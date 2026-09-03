const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");

const {
  embedJobDescription,
  retrieveRelevantRequirements,
  cleanupSession,
} = require("../services/embeddingService");

const upload = require("../middleware/upload");

const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");

const { analyzeResume } = require("../services/geminiService");
const { extractResumeText } = require("../utils/textExtraction");
const { AppError } = require("../utils/appError");
const {
  auditLog,
  redact,
} = require("../utils/auditLogger");

// ==================================================
// Resume Detection
// ==================================================

const isLikelyResume = (text) => {
  if (!text || text.trim().length < 200) {
    return false;
  }

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

  const score = signals.reduce(
    (acc, key) =>
      acc + (lc.includes(key) ? 1 : 0),
    0
  );

  return score >= 3;
};

// ==================================================
// MAIN ANALYSIS ROUTE
// ==================================================

router.post("/", upload, async (req, res, next) => {
  let sessionId = null;

  try {
    // ------------------------------------------------
    // 1. File validation
    // ------------------------------------------------

    if (!req.file) {
      throw new AppError(
        "MISSING_FILE",
        "Please upload a PDF resume file to continue.",
        400
      );
    }

    const filename =
      req.file.originalname || "";

    const mimetype =
      req.file.mimetype || "";

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

    // ------------------------------------------------
    // 2. Extract resume text
    // ------------------------------------------------

    const extractionResult =
      await extractResumeText(
        req.file.buffer
      );

    const resumeText =
      extractionResult?.text?.trim() || "";

    // ------------------------------------------------
    // 3. Extraction validation
    // ------------------------------------------------

    if (resumeText.length < 100) {
      throw new AppError(
        "EXTRACTION_FAILED",
        "We could not extract readable text from this PDF. Please upload a text-based resume or re-export your file as a proper PDF.",
        422
      );
    }

    // ------------------------------------------------
    // 4. Resume sanity check
    // ------------------------------------------------

    if (!isLikelyResume(resumeText)) {
      throw new AppError(
        "NOT_A_RESUME",
        "The uploaded file does not appear to be a resume. Please upload a valid resume document.",
        400
      );
    }

    // ------------------------------------------------
    // 5. Request fields
    // ------------------------------------------------

    const targetRole = String(
      req.body?.targetRole || ""
    ).trim();

    const jobDescription = String(
      req.body?.jobDescription || ""
    ).trim();

    const hasJobDescription =
      jobDescription.length >= 50;

    // ------------------------------------------------
    // 6. RAG
    // ------------------------------------------------

    let relevantJDChunks = [];
    let hasJDAnalysis = false;

    if (hasJobDescription) {
      sessionId = uuidv4();

      try {
        // Store JD vectors
        await embedJobDescription(
          jobDescription,
          sessionId
        );

        // Search using the ENTIRE resume
        relevantJDChunks =
          await retrieveRelevantRequirements(
            resumeText,
            sessionId,
            5
          );

        hasJDAnalysis =
          relevantJDChunks.length > 0;
      } finally {
        // Always clean temporary vectors
        await cleanupSession(
          sessionId
        ).catch((cleanupError) => {
          console.error(
            "RAG cleanup failed:",
            cleanupError.message
          );
        });
      }
    }

    // ------------------------------------------------
    // 7. AI analysis
    // ------------------------------------------------

    const analysis =
      await analyzeResume(
        resumeText,
        targetRole,
        relevantJDChunks
      );

    // ------------------------------------------------
    // 8. Cloudinary upload
    // ------------------------------------------------

    const uploadResult =
      await uploadToCloudinary(
        req.file.buffer,
        req.file.originalname
      );

    // ------------------------------------------------
    // 9. Audit
    // ------------------------------------------------

    auditLog("resume_analyzed", {
      fileName: req.file.originalname,
      sizeBytes: req.file.size,

      method:
        extractionResult?.extraction?.method ||
        "unknown",

      qualityScore:
        extractionResult?.extraction
          ?.qualityScore ?? 0,

      textLength: resumeText.length,

      targetRole:
        targetRole || "not-provided",

      hasJDAnalysis,

      retrievedJDChunks:
        relevantJDChunks.length,

      cloudinaryPublicId:
        redact(uploadResult.publicId),
    });

    // ------------------------------------------------
    // 10. Response
    // ------------------------------------------------

    return res.status(200).json({
      success: true,

      fileUrl: uploadResult.url,

      publicId:
        uploadResult.publicId,

      analysis,

      hasJDAnalysis,

      extraction: {
        ...extractionResult.extraction,

        textLength:
          resumeText.length,

        isReadable:
          resumeText.length > 200,
      },
    });
  } catch (error) {
    // ------------------------------------------------
    // Defensive cleanup
    // ------------------------------------------------

    if (sessionId) {
      await cleanupSession(
        sessionId
      ).catch((cleanupError) => {
        console.error(
          "RAG emergency cleanup failed:",
          cleanupError.message
        );
      });
    }

    return next(error);
  }
});

// ==================================================
// DELETE CLOUDINARY FILE
// ==================================================

router.post(
  "/delete",
  async (req, res, next) => {
    try {
      const {
        fileUrl,
        publicId,
      } = req.body;

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

      const result =
        await deleteFromCloudinary(
          targetPublicId
        );

      auditLog("resume_deleted", {
        publicId:
          redact(targetPublicId),

        cloudinaryResult:
          result,
      });

      return res.status(200).json({
        success: true,
        result,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;