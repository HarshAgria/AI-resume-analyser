const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");

/**
 * Clean extracted text
 */
const cleanText = (text) => {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Score extraction quality (0-100)
 */
const getQualityScore = (text) => {
  if (!text) return 0;

  let score = 0;

  if (text.length > 500) score += 30;
  if (text.length > 1500) score += 20;

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

  const matches = keywords.filter((k) =>
    text.toLowerCase().includes(k)
  ).length;

  score += matches * 8;

  if (text.split("\n").length > 10) score += 10;

  return Math.min(score, 100);
};

/**
 * OCR fallback for scanned PDFs
 */
const runOCR = async (buffer) => {
  try {
    const result = await Tesseract.recognize(buffer, "eng");
    return result.data.text || "";
  } catch (err) {
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
  // 1. Try PDF text extraction
  // ---------------------------
  try {
    const data = await pdfParse(buffer);
    text = data.text || "";
  } catch (err) {
    text = "";
  }

  text = cleanText(text);

  // ---------------------------
  // 2. If failed → OCR fallback
  // ---------------------------
  if (!text || text.length < 100) {
    method = "ocr";
    text = await runOCR(buffer);
    text = cleanText(text);
  }

  // ---------------------------
  // 3. Final validation
  // ---------------------------
  const qualityScore = getQualityScore(text);

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

module.exports = { extractResumeText };