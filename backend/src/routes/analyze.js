const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");

const { analyzeResume } = require("../services/geminiService");
const { extractResumeText } = require("../utils/textExtraction");
const { AppError } = require("../utils/appError");
const { auditLog, redact } = require("../utils/auditLogger");

// ------------------------------
// Improved Resume Detection
// ------------------------------
const isLikelyResume = (text) => {
  if (!text || text.trim().length < 200) return false;

  const lc = text.toLowerCase();

  const signals = [
    "experience",
    "education",
    "skills",
    "projects",
    "work experience",
    "internship",
    "linkedin",
    "github",
    "summary",
    "certifications",
  ];

  const score = signals.reduce((acc, key) => acc + lc.includes(key), 0);

  return score >= 3;
};

// ------------------------------
// MAIN ANALYSIS ROUTE
// ------------------------------
router.post("/", upload, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(
        "MISSING_FILE",
        "Please upload a PDF resume file to continue.",
        400
      );
    }

    const filename = req.file.originalname || "";
    const mimetype = req.file.mimetype || "";

    if (
      mimetype !== "application/pdf" &&
      !filename.toLowerCase().endsWith(".pdf")
    ) {
      throw new AppError(
        "UNSUPPORTED_FILE_TYPE",
        "Only PDF files are supported.",
        400
      );
    }

    // ------------------------------
    // 1. Extract resume text
    // ------------------------------
    const extractionResult = await extractResumeText(req.file.buffer);

    let resumeText = extractionResult?.text || "";

    // ------------------------------
    // 2. HARD VALIDATION (IMPORTANT FIX)
    // ------------------------------
    if (!resumeText || resumeText.trim().length < 100) {
      throw new AppError(
        "EXTRACTION_FAILED",
        "We could not extract readable text from this PDF. Please upload a text-based resume or re-export your file as a proper PDF.",
        422
      );
    }

    // ------------------------------
    // 3. Resume sanity check
    // ------------------------------
    if (!isLikelyResume(resumeText)) {
      throw new AppError(
        "NOT_A_RESUME",
        "The uploaded file does not appear to be a resume. Please upload a valid resume document.",
        400
      );
    }

    // ------------------------------
    // 4. Upload file (cloud storage)
    // ------------------------------
    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname
    );

    const targetRole = req.body?.role || "";

    // ------------------------------
    // 5. AI ANALYSIS
    // ------------------------------
    const analysis = await analyzeResume(resumeText, targetRole);

    // ------------------------------
    // 6. AUDIT LOGGING (enhanced)
    // ------------------------------
    auditLog("resume_analyzed", {
      fileName: req.file.originalname,
      sizeBytes: req.file.size,
      method: extractionResult?.extraction?.method || "unknown",
      qualityScore: extractionResult?.extraction?.qualityScore ?? 0,
      textLength: resumeText.length,
      cloudinaryPublicId: redact(uploadResult.publicId),
    });

    // ------------------------------
    // 7. RESPONSE
    // ------------------------------
    res.json({
      success: true,
      fileUrl: uploadResult.url,
      publicId: uploadResult.publicId,
      analysis,
      extraction: {
        ...extractionResult.extraction,
        textLength: resumeText.length,
        isReadable: resumeText.length > 200,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------
// DELETE ROUTE (UNCHANGED BUT SAFE)
// ------------------------------
router.post("/delete", async (req, res, next) => {
  try {
    const { fileUrl, publicId } = req.body;

    if (!publicId && !fileUrl) {
      throw new AppError(
        "MISSING_FILE_REFERENCE",
        "No uploaded file reference was provided.",
        400
      );
    }

    const targetPublicId =
      publicId ||
      (fileUrl || "")
        .split("/")
        .slice(-2)
        .join("/")
        .replace(/\.[^.]+$/, "");

    if (!targetPublicId) {
      throw new AppError(
        "INVALID_FILE_REFERENCE",
        "Invalid upload reference. File could not be deleted.",
        400
      );
    }

    const result = await deleteFromCloudinary(targetPublicId);

    auditLog("resume_deleted", {
      publicId: redact(targetPublicId),
      cloudinaryResult: result,
    });

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;