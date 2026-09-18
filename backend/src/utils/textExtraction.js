const Tesseract = require("tesseract.js");

// pdfjs-dist v4 is ESM.
// Keep the rest of this backend CommonJS and load PDF.js lazily.
let pdfjsLibPromise = null;

const getPdfjs = async () => {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfjsLibPromise;
};

/**
 * Clean extracted text while preserving useful resume structure.
 *
 * IMPORTANT:
 * Do not remove spaces globally.
 * The positional PDF extractor is responsible for reconstructing
 * word boundaries before this function runs.
 */
const normalizeText = (text) => {
  return String(text || "")
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

    // Replace unusual/non-ASCII characters safely.
    .replace(/[^\x00-\x7F]/g, " ")

    // Normalize horizontal whitespace only.
    .replace(/[ \t]+/g, " ")

    // Remove whitespace around newlines.
    .replace(/[ \t]*\n[ \t]*/g, "\n")

    // Prevent excessive blank lines.
    .replace(/\n{3,}/g, "\n\n")

    .trim();
};

/**
 * Determine whether two PDF text items should have a space between them.
 *
 * PDF text extraction is not the same as reading normal text.
 * A PDF may contain:
 *
 *   "Senior"
 *   "Technical"
 *   "Operations"
 *
 * as separate positioned objects.
 *
 * We therefore use the actual horizontal distance between objects.
 */
const shouldInsertSpace = (previous, current) => {
  const gap = current.x - previous.endX;

  // If items overlap or touch, they belong together.
  if (gap <= 0) {
    return false;
  }

  const fontSize =
    (Math.abs(previous.height) + Math.abs(current.height)) / 2 || 10;

  /*
   * PDFs use different coordinate scales, so don't use a single
   * absolute threshold.
   *
   * A small amount of positive space is normally kerning.
   * A larger gap is much more likely to represent a word boundary.
   */
  const relativeThreshold = fontSize * 0.18;

  const threshold = Math.max(1.0, relativeThreshold);

  if (gap > threshold) {
    return true;
  }

  /*
   * Additional protection for clearly separated alphabetic words.
   *
   * Example:
   *   "Senior" -> "Technical"
   *
   * If there is measurable positive distance and both sides look
   * like normal word text, favor preserving the visual boundary.
   */
  const previousText = previous.text;
  const currentText = current.text;

  const previousEndsWithWordChar = /[A-Za-z0-9)]$/.test(previousText);
  const currentStartsWithWordChar = /^[A-Za-z0-9(]/.test(currentText);

  if (
    gap > 0.5 &&
    previousEndsWithWordChar &&
    currentStartsWithWordChar &&
    previousText.length > 1 &&
    currentText.length > 1
  ) {
    return true;
  }

  return false;
};

/**
 * Group PDF text items into visual lines.
 */
const groupIntoLines = (items) => {
  if (!items.length) {
    return [];
  }

  // Sort from top to bottom, then left to right.
  items.sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);

    if (yDiff < Math.max(a.height, b.height) * 0.5) {
      return a.x - b.x;
    }

    // PDF coordinates generally increase upward.
    return b.y - a.y;
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const item of items) {
    const tolerance = Math.max(item.height, 10) * 0.5;

    if (
      currentY === null ||
      Math.abs(item.y - currentY) <= tolerance
    ) {
      currentLine.push(item);

      if (currentY === null) {
        currentY = item.y;
      }
    } else {
      if (currentLine.length) {
        lines.push(currentLine);
      }

      currentLine = [item];
      currentY = item.y;
    }

    if (item.hasEOL) {
      if (currentLine.length) {
        lines.push(currentLine);
      }

      currentLine = [];
      currentY = null;
    }
  }

  if (currentLine.length) {
    lines.push(currentLine);
  }

  return lines;
};

/**
 * Convert a visual PDF line into normal text.
 */
const reconstructLine = (line) => {
  if (!line.length) {
    return "";
  }

  line.sort((a, b) => a.x - b.x);

  let result = line[0].text;

  for (let i = 1; i < line.length; i++) {
    const previous = line[i - 1];
    const current = line[i];

    if (shouldInsertSpace(previous, current)) {
      result += " ";
    }

    result += current.text;
  }

  return result.trim();
};

/**
 * Extract text from a PDF using PDF.js positional information.
 *
 * This is intentionally kept separate from normalizeText().
 * PDF reconstruction and text cleanup are two different operations.
 */
const extractPdfText = async (buffer) => {
  const pdfjsLib = await getPdfjs();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),

    // Avoid unnecessary worker configuration in Node.
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;

  const pages = [];

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      const page = await pdf.getPage(pageNumber);

      /*
       * disableCombineTextItems is important here.
       *
       * We want PDF.js to expose smaller text fragments so that
       * we can reconstruct spaces from their actual positions.
       */
      const content = await page.getTextContent({
        disableCombineTextItems: true,
      });

      const items = content.items
        .filter((item) => item.str && item.str.trim())
        .map((item) => {
          const x = Number(item.transform?.[4] || 0);
          const y = Number(item.transform?.[5] || 0);

          const height =
            Math.abs(Number(item.transform?.[3] || 0)) || 10;

          const width = Number(item.width || 0);

          return {
            text: item.str,
            x,
            y,
            width,
            endX: x + width,
            height,
            hasEOL: Boolean(item.hasEOL),
          };
        });

      if (!items.length) {
        pages.push("");
        continue;
      }

      const lines = groupIntoLines(items);

      const pageText = lines
        .map(reconstructLine)
        .filter(Boolean)
        .join("\n");

      pages.push(pageText);

      await page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n\n");
};

/**
 * Score extraction quality (0-100).
 */
const getQualityScore = (text) => {
  if (!text) {
    return 0;
  }

  let score = 0;
  const lowerText = text.toLowerCase();

  if (text.length > 500) {
    score += 30;
  }

  if (text.length > 1500) {
    score += 20;
  }

  const keywords = [
    "experience",
    "education",
    "skills",
    "projects",
    "work",
    "internship",
    "github",
    "linkedin",
  ];

  const matches = keywords.filter((keyword) =>
    lowerText.includes(keyword)
  ).length;

  score += matches * 8;

  if (text.split("\n").length > 10) {
    score += 10;
  }

  return Math.min(score, 100);
};

/**
 * OCR fallback for scanned PDFs.
 */
const runOCR = async (buffer) => {
  try {
    const result = await Tesseract.recognize(
      buffer,
      "eng"
    );

    return result.data.text || "";
  } catch (err) {
    console.error(
      "OCR extraction failed:",
      err.message
    );

    return "";
  }
};

/**
 * MAIN EXTRACTOR
 */
const extractResumeText = async (buffer) => {
  let method = "pdf-text";
  let text = "";

  // ---------------------------
  // 1. Try positional PDF extraction
  // ---------------------------
  try {
    text = await extractPdfText(buffer);
  } catch (err) {
    console.error(
      "PDF text extraction failed:",
      err.message
    );

    text = "";
  }

  text = normalizeText(text);

  let qualityScore = getQualityScore(text);

  // ---------------------------
  // 2. OCR fallback
  // ---------------------------
  if (
    !text ||
    text.length < 100 ||
    qualityScore < 25
  ) {
    method = "ocr";

    const ocrText = await runOCR(buffer);

    text = normalizeText(ocrText);

    qualityScore = getQualityScore(text);
  }

  // ---------------------------
  // 3. Final validation
  // ---------------------------
  return {
    text,

    extraction: {
      method,
      qualityScore,
      isScanned: method === "ocr",
      textLength: text.length,
    },
  };
};

module.exports = {
  extractResumeText,
  normalizeText,
};
