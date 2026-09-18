const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");

const { createMCPClient } = require("../mcp/client");

const upload = require("../middleware/upload");

const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");

const { analyzeResume } = require("../services/geminiService");
const { extractResumeText } = require("../utils/textExtraction");
const { AppError } = require("../utils/appError");
const { auditLog, redact } = require("../utils/auditLogger");

// ==================================================
// Resume Detection
// ==================================================

const isLikelyResume = (text) => {
  if (!text || text.trim().length < 200) {
    return false;
  }

  const lc = text.toLowerCase();

  // Domain-agnostic resume/CV signals. Do not require software-specific
  // sections such as GitHub, projects, or technical skills.
  const signals = [
    "experience", "work experience", "professional experience", "employment",
    "work history", "career history", "education", "qualification",
    "qualifications", "skills", "competencies", "expertise", "profile",
    "professional summary", "summary", "objective", "achievements",
    "awards", "certifications", "licenses", "publications", "portfolio",
    "internship", "volunteer", "clinical experience", "research experience",
  ];

  const score = signals.reduce(
    (acc, key) => acc + (lc.includes(key) ? 1 : 0),
    0,
  );

  // A valid CV normally contains at least two broad resume signals.
  return score >= 2;
};

// ==================================================
// MCP JSON Parser
// ==================================================
const parseMcpJsonResult = (result, toolName) => {
  if (result?.isError) {
    console.error(`MCP tool failed: ${toolName}`, result);

    throw new AppError(
      "MCP_TOOL_FAILED",
      `The MCP tool "${toolName}" failed while processing the request.`,
      502,
      undefined,
      true,
    );
  }

  const textBlock = Array.isArray(result?.content)
    ? result.content.find(
        (item) => item?.type === "text" && typeof item.text === "string",
      )
    : null;

  if (!textBlock?.text) {
    throw new AppError(
      "MCP_RESPONSE_INVALID",
      `The MCP tool "${toolName}" returned an invalid response.`,
      502,
      undefined,
      true,
    );
  }

  try {
    const parsed = JSON.parse(textBlock.text);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("MCP response is not a JSON object.");
    }

    return parsed;
  } catch (error) {
    console.error(`MCP JSON parsing failed for ${toolName}:`, error.message);

    throw new AppError(
      "MCP_RESPONSE_INVALID",
      `The MCP tool "${toolName}" returned invalid JSON.`,
      502,
      undefined,
      true,
    );
  }
};

// ==================================================
// Normalize AI Response
// ==================================================
const normalizeAnalysis = (analysis, hasJDAnalysis) => {
  const safeAnalysis = analysis && typeof analysis === "object" ? analysis : {};
  return {
    ...safeAnalysis,
    summary:
      typeof safeAnalysis.summary === "string"
        ? safeAnalysis.summary
        : "No summary was generated.",
    strengths: Array.isArray(safeAnalysis.strengths)
      ? safeAnalysis.strengths
      : [],
    improvements: Array.isArray(safeAnalysis.improvements)
      ? safeAnalysis.improvements
      : [],
    missingKeywords: Array.isArray(safeAnalysis.missingKeywords)
      ? safeAnalysis.missingKeywords
      : [],
    recommendedRoles: Array.isArray(safeAnalysis.recommendedRoles)
      ? safeAnalysis.recommendedRoles
      : [],
    matchedRequirements: Array.isArray(safeAnalysis.matchedRequirements)
      ? safeAnalysis.matchedRequirements
      : [],
    possibleRequirements: Array.isArray(safeAnalysis.possibleRequirements)
      ? safeAnalysis.possibleRequirements
      : [],
    missingRequirements: Array.isArray(safeAnalysis.missingRequirements)
      ? safeAnalysis.missingRequirements
      : [],
    blockingRequirements: Array.isArray(safeAnalysis.blockingRequirements)
      ? safeAnalysis.blockingRequirements
      : [],

    hasJDAnalysis: Boolean(hasJDAnalysis),

    candidateName:
      typeof safeAnalysis.candidateName === "string"
        ? safeAnalysis.candidateName
        : "",
    atsRating:
      typeof safeAnalysis.atsRating === "string" ? safeAnalysis.atsRating : "",
    confidenceLevel:
      typeof safeAnalysis.confidenceLevel === "number"
        ? safeAnalysis.confidenceLevel
        : 0,
    recruiterApproval:
      typeof safeAnalysis.recruiterApproval === "number"
        ? safeAnalysis.recruiterApproval
        : 0,
    jdMatchScore:
      typeof safeAnalysis.jdMatchScore === "number"
        ? safeAnalysis.jdMatchScore
        : null,
    score: typeof safeAnalysis.score === "number" 
    ? safeAnalysis.score 
    : 0,
  };
};

// ==================================================
// MAIN ANALYSIS ROUTE
// ==================================================

router.post("/", upload, async (req, res, next) => {
  let sessionId = null;
  let mcpClient = null;

  try {
    // ------------------------------------------------
    // 1. File validation
    // ------------------------------------------------

    if (!req.file) {
      throw new AppError(
        "MISSING_FILE",
        "Please upload a PDF resume file to continue.",
        400,
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
        400,
      );
    }

    // ------------------------------------------------
    // 2. Extract resume text
    // ------------------------------------------------

    const extractionResult = await extractResumeText(req.file.buffer);

    const resumeText = extractionResult?.text?.trim() || "";

    // ------------------------------------------------
    // 3. Extraction validation
    // ------------------------------------------------

    if (resumeText.length < 100) {
      throw new AppError(
        "EXTRACTION_FAILED",
        "We could not extract readable text from this PDF. Please upload a text-based resume or re-export your file as a proper PDF.",
        422,
      );
    }

    // ------------------------------------------------
    // 4. Resume sanity check
    // ------------------------------------------------

    if (!isLikelyResume(resumeText)) {
      throw new AppError(
        "NOT_A_RESUME",
        "The uploaded file does not appear to be a resume. Please upload a valid resume document.",
        400,
      );
    }

    // ------------------------------------------------
    // 5. Request fields
    // ------------------------------------------------

    const targetRole = String(req.body?.targetRole || "").trim();

    const jobDescription = String(req.body?.jobDescription || "").trim();

    const hasJobDescription = jobDescription.length >= 50;

    // ------------------------------------------------
    // 6. JD / RAG analysis through MCP
    // ------------------------------------------------

    let ragResults = [];
    let hasJDAnalysis = false;
    let matchedRequirements = [];
    let possibleRequirements = [];
    let missingRequirements = [];
    let deterministicBlockingRequirements = [];
    let deterministicJdMatchScore = null;

    if (hasJobDescription) {
      sessionId = uuidv4();

      mcpClient = createMCPClient();

      try {
        // ------------------------------------------------
        // Connect to MCP server
        // ------------------------------------------------

        await mcpClient.connect();

        // ------------------------------------------------
        // Tool 1: Embed JD requirements
        // ------------------------------------------------

        const embedJDResult = await mcpClient.callTool(
          "embed_job_description",
          {
            jobDescription,
            sessionId,
          },
        );

        parseMcpJsonResult(embedJDResult, "embed_job_description");

        // ------------------------------------------------
        // Tool 2: Embed resume chunks
        // ------------------------------------------------

        const embedResumeResult = await mcpClient.callTool("embed_resume", {
          resumeText,
          sessionId,
        });

        parseMcpJsonResult(embedResumeResult, "embed_resume");

        // ------------------------------------------------
        // Tool 3: Retrieve requirement-centric evidence
        // ------------------------------------------------

        const evidenceResult = await mcpClient.callTool(
          "retrieve_resume_evidence",
          {
            sessionId,
            topK: 3,
          },
        );

        const evidenceData = parseMcpJsonResult(
          evidenceResult,
          "retrieve_resume_evidence",
        );

        ragResults = Array.isArray(evidenceData?.requirements)
          ? evidenceData.requirements
          : [];
        matchedRequirements = ragResults
          .filter((item) => item?.status === "strong_match")
          .map((item) => item.requirement)
          .filter(Boolean);

        possibleRequirements = ragResults
          .filter((item) => item?.status === "possible_match")
          .map((item) => item.requirement)
          .filter(Boolean);

        missingRequirements = ragResults
          .filter((item) => item?.status === "missing")
          .map((item) => item.requirement)
          .filter(Boolean);

        // Weighted, domain-agnostic scoring. Importance comes from the JD
        // requirement extractor rather than profession-specific rules.
        const statusValue = {
          strong_match: 1,
          possible_match: 0.5,
          missing: 0,
        };

        const weightedTotal = ragResults.reduce(
          (total, item) => total + (Number(item?.weight) || 1),
          0,
        );

        const weightedEvidence = ragResults.reduce((total, item) => {
          const weight = Number(item?.weight) || 1;
          return total + weight * (statusValue[item?.status] || 0);
        }, 0);

        deterministicJdMatchScore = weightedTotal > 0
          ? Number(((weightedEvidence / weightedTotal) * 100).toFixed(1))
          : 0;

        deterministicBlockingRequirements = ragResults
          .filter((item) =>
            (item?.importance === "critical" || item?.importance === "required") &&
            item?.status === "missing"
          )
          .map((item) => item.requirement)
          .filter(Boolean);

        hasJDAnalysis = ragResults.length > 0;
      } finally {
        // ------------------------------------------------
        // Cleanup RAG session
        // ------------------------------------------------

        if (mcpClient && mcpClient.connected && sessionId) {
          try {
            const cleanupResult = await mcpClient.callTool(
              "cleanup_rag_session",
              {
                sessionId,
              },
            );

            parseMcpJsonResult(cleanupResult, "cleanup_rag_session");
          } catch (cleanupError) {
            console.error("MCP RAG cleanup failed:", cleanupError.message);
          }
        }
      }
    }
    // ------------------------------------------------
    // 7. AI analysis
    // ------------------------------------------------

    const rawAnalysis = await analyzeResume(resumeText, targetRole, ragResults);
    const analysis = normalizeAnalysis(rawAnalysis, hasJDAnalysis);

    if (hasJDAnalysis) {
      analysis.matchedRequirements = matchedRequirements;
      analysis.possibleRequirements = possibleRequirements;
      analysis.missingRequirements = missingRequirements;
      analysis.blockingRequirements = deterministicBlockingRequirements;
      analysis.jdMatchScore = deterministicJdMatchScore;
    } else {
      analysis.matchedRequirements = [];
      analysis.possibleRequirements = [];
      analysis.missingRequirements = [];
      analysis.blockingRequirements = [];
      analysis.jdMatchScore = null;
    }

    // ------------------------------------------------
    // 8. Cloudinary upload
    // ------------------------------------------------

    const uploadResult = await uploadToCloudinary(
      req.file.buffer,
      req.file.originalname,
    );

    if (!uploadResult?.url || !uploadResult?.publicId) {
      throw new AppError(
        "UPLOAD_FAILED",
        "The resume was analyzed but could not be stored securely.",
        502,
        undefined,
        true,
      );
    }

    // ------------------------------------------------
    // 9. Audit
    // ------------------------------------------------

    auditLog("resume_analyzed", {
      fileName: req.file.originalname,
      sizeBytes: req.file.size,

      method: extractionResult?.extraction?.method || "unknown",

      qualityScore: extractionResult?.extraction?.qualityScore ?? 0,

      textLength: resumeText.length,

      targetRole: targetRole || "not-provided",

      hasJDAnalysis,

      retrievedRequirements: ragResults.length,

      cloudinaryPublicId: redact(uploadResult.publicId),
    });

    // ------------------------------------------------
    // 10. Response
    // ------------------------------------------------

    return res.status(200).json({
      success: true,

      fileUrl: uploadResult.url,

      publicId: uploadResult.publicId,

      analysis,

      hasJDAnalysis,

      extraction: {
        ...(extractionResult?.extraction || {}),
        textLength: resumeText.length,

        isReadable: resumeText.length > 200,
      },
    });
  } catch (error) {
    return next(error);
  } finally {
    // ------------------------------------------------
    // Always disconnect MCP
    // ------------------------------------------------

    if (mcpClient) {
      try {
        await mcpClient.disconnect();
      } catch (disconnectError) {
        console.error("MCP disconnect failed:", disconnectError.message);
      }
    }
  }
});

// ==================================================
// DELETE CLOUDINARY FILE
// ==================================================

router.post("/delete", async (req, res, next) => {
  try {
    const { fileUrl, publicId } = req.body || {};

    if (!publicId && !fileUrl) {
      throw new AppError(
        "MISSING_FILE_REFERENCE",
        "No uploaded file reference was provided.",
        400,
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
        400,
      );
    }

    const result = await deleteFromCloudinary(targetPublicId);

    auditLog("resume_deleted", {
      publicId: redact(targetPublicId),

      cloudinaryResult: result,
    });

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
