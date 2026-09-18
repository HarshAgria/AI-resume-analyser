const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require("chromadb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { AppError } = require("../utils/appError");
const { extractRequirementsWithAI, importanceWeight } = require("./requirementExtractionService");

// ==================================================
// Embeddings
// ==================================================

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
});

// ==================================================
// Chroma
// ==================================================

const chromaClient = new ChromaClient({
  host: process.env.CHROMA_HOST || "localhost",
  port: Number(process.env.CHROMA_PORT || 8000),
  ssl: false,
});

const COLLECTION_NAME =
  process.env.RAG_COLLECTION_NAME || "resume_analyser_rag";

// ==================================================
// Configuration
// ==================================================

const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 500);

const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 80);

const MAX_DISTANCE = Number(process.env.RAG_MAX_DISTANCE || 0.5);

const STRONG_MATCH_DISTANCE = Number(
  process.env.RAG_STRONG_MATCH_DISTANCE || 0.35,
);

const POSSIBLE_MATCH_DISTANCE = Number(
  process.env.RAG_POSSIBLE_MATCH_DISTANCE || 0.45,
);

const MAX_EVIDENCE_PER_REQUIREMENT = Number(
  process.env.RAG_MAX_EVIDENCE_PER_REQUIREMENT || 3,
);

const MAX_QUERY_RESULTS = Number(process.env.RAG_MAX_QUERY_RESULTS || 5);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

// ==================================================
// Domain-agnostic requirement matching
// ==================================================

/*
 * This matcher is intentionally profession-agnostic. It must work for
 * software, finance, healthcare, sales, marketing, operations, legal,
 * education, design, research, and other domains.
 */

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","has","have","in","is",
  "of","on","or","the","to","with","will","you","your","we","our","this","that",
  "than","then","into","over","under","using","used","use","including","such","their",
  "they","them","it","its","about","through","across","within","while","must","should",
  "can","may","able","ability","work","working","experience","knowledge","understanding",
  "strong","excellent","good","skills","skill","role","roles","responsible","responsibilities",
  "required","requirements","preferred","candidate","candidates","position","job","team","teams",
]);

const cleanRequirement = (text) => String(text || "")
  .replace(/\s+/g, " ")
  .replace(/^[-•*▪◦]+\s*/, "")
  .trim();

const normalizeText = (text) => String(text || "")
  .toLowerCase()
  .replace(/\r/g, "\n")
  .replace(/[()[\]{}:,;!?"`|\\]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeTechnicalText = normalizeText;

const normalizeRequirementKey = (text) => normalizeText(text)
  .replace(/[^\w\s+#./-]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const normalizeResumeText = (text) => String(text || "")
  .replace(/\r/g, "\n")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const deduplicateRequirements = (requirements) => {
  const seen = new Set();
  return requirements.filter((requirement) => {
    const key = normalizeRequirementKey(requirement);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const meaningfulTerms = (text) => normalizeText(text)
  .split(/\s+/)
  .map((term) => term.replace(/^[^a-z0-9+#.-]+|[^a-z0-9+#.-]+$/gi, ""))
  .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

const lexicalEvidenceScore = (requirement, evidenceText) => {
  const reqTerms = [...new Set(meaningfulTerms(requirement))];
  if (!reqTerms.length) return 0;
  const evidence = normalizeText(evidenceText);
  const matched = reqTerms.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(evidence);
  });
  return matched.length / reqTerms.length;
};

// Kept as compatibility exports for existing callers/tests. There is no
// software-specific rule table anymore.
const getRequirementRule = () => null;
const getTechnicalGroupsForRequirement = () => [];
const validateTechnicalRequirement = (requirement, evidence) => ({
  isTechnicalRequirement: false,
  mode: null,
  requiredTerms: [],
  matchedTerms: [],
  missingTerms: [],
  satisfied: true,
  lexicalScore: lexicalEvidenceScore(
    requirement,
    evidence.map((item) => item?.text || "").join(" "),
  ),
});

// ==================================================
// Evidence status
// ==================================================

const getEvidenceStatus = (requirement, evidence) => {
  const bestDistance = evidence.length ? evidence[0].distance : null;
  const combinedEvidence = evidence.map((item) => item?.text || "").join(" ");
  const lexicalScore = lexicalEvidenceScore(requirement, combinedEvidence);

  if (!evidence.length) {
    return {
      status: "missing",
      evidenceReason: "No sufficiently relevant resume evidence was retrieved.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance: null,
      lexicalScore: 0,
    };
  }

  // Semantic similarity is domain-agnostic. Explicit lexical overlap can
  // strengthen a match but is never tied to a particular profession.
  if (bestDistance !== null && (bestDistance <= STRONG_MATCH_DISTANCE || lexicalScore >= 0.60)) {
    return {
      status: "strong_match",
      evidenceReason: lexicalScore >= 0.60
        ? "Relevant resume evidence contains substantial explicit overlap with the requirement."
        : "Strong semantic similarity was found between the requirement and resume evidence.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance,
      lexicalScore,
    };
  }

  if (bestDistance !== null && (bestDistance <= POSSIBLE_MATCH_DISTANCE || lexicalScore >= 0.30)) {
    return {
      status: "possible_match",
      evidenceReason: "Resume evidence is related to the requirement but does not establish a strong match.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance,
      lexicalScore,
    };
  }

  return {
    status: "missing",
    evidenceReason: "The retrieved evidence was not sufficiently similar to the requirement.",
    requiredTerms: [],
    matchedTerms: [],
    missingTerms: [],
    bestDistance,
    lexicalScore,
  };
};

// ==================================================
// Chroma Collection
// ==================================================

const getCollection = async () => {
  return chromaClient.getOrCreateCollection({
    name: COLLECTION_NAME,

    metadata: {
      description:
        "Resume and job-description vectors for requirement-centric resume matching.",
    },

    configuration: {
      hnsw: {
        space: "cosine",
      },
    },
  });
};

// ==================================================
// JD Requirement Extraction
// ==================================================

// Requirement extraction is AI-assisted and domain-agnostic. The embedding
// layer stores the structured requirement object while keeping the original
// requirement text as the vector document.

const extractRequirements = async (jdText) => {
  return extractRequirementsWithAI(jdText);
};

// ==================================================
// Session cleanup before writing
// ==================================================

const deleteSessionVectors = async (collection, sessionId) => {
  const results = await collection.get({
    where: {
      sessionId,
    },
  });

  if (results.ids?.length) {
    await collection.delete({
      ids: results.ids,
    });
  }
};

// ==================================================
// Embed Job Description
// ==================================================

const embedJobDescription = async (jdText, sessionId) => {
  if (!jdText || jdText.trim().length < 50) {
    throw new AppError(
      "RAG_JD_TOO_SHORT",
      "Job description must contain at least 50 characters.",
      400,
    );
  }

  if (!sessionId) {
    throw new AppError(
      "RAG_SESSION_INVALID",
      "RAG session ID is required.",
      500,
      undefined,
      true,
    );
  }

  const requirements = await extractRequirements(jdText);

  if (!requirements.length) {
    throw new AppError(
      "RAG_REQUIREMENTS_NOT_FOUND",
      "No usable job requirements could be extracted from the job description.",
      422,
    );
  }

  const collection = await getCollection();

  /*
   * Make embedding operation idempotent.
   *
   * If a session is reused, remove old vectors first.
   */

  await deleteSessionVectors(collection, sessionId);

  const requirementTexts = requirements.map((item) => item.text);
  const vectors = await embeddings.embedDocuments(requirementTexts);

  const ids = requirements.map(
    (_, index) => `jd_requirement_${sessionId}_${index}`,
  );

  await collection.add({
    ids,
    embeddings: vectors,
    documents: requirementTexts,

    metadatas: requirements.map((item, index) => ({
      sessionId,
      type: "jd_requirement",
      requirementIndex: index,
      category: item.category,
      importance: item.importance,
      weight: item.weight,
    })),
  });

  return {
    sessionId,
    requirementCount: requirements.length,
    requirements,
  };
};

// ==================================================
// Store Resume
// ==================================================

const embedResume = async (resumeText, sessionId) => {
  if (!resumeText || !resumeText.trim()) {
    throw new AppError(
      "RAG_RESUME_EMPTY",
      "Resume text is required for RAG matching.",
      422,
    );
  }

  if (!sessionId) {
    throw new AppError(
      "RAG_SESSION_INVALID",
      "RAG session ID is required.",
      500,
      undefined,
      true,
    );
  }

  const normalizedResumeText = normalizeResumeText(resumeText);

  const resumeChunks = await splitter.splitText(normalizedResumeText);

  if (!resumeChunks.length) {
    throw new AppError(
      "RAG_RESUME_CHUNKING_FAILED",
      "No usable resume chunks could be created.",
      422,
    );
  }

  const chunksToStore = resumeChunks.map((text, index) => ({
    text,
    originalIndex: index,
  }));

  const collection = await getCollection();

  /*
   * Resume may be embedded after JD in the same session.
   *
   * Only remove existing resume vectors here.
   * Never delete JD requirements.
   */

  const existingResume = await collection.get({
    where: {
      $and: [{ sessionId }, { type: "resume" }],
    },
  });

  if (existingResume.ids?.length) {
    await collection.delete({
      ids: existingResume.ids,
    });
  }

  const vectors = await embeddings.embedDocuments(
    chunksToStore.map((chunk) => chunk.text),
  );

  const ids = chunksToStore.map(
    (chunk) => `resume_${sessionId}_${chunk.originalIndex}`,
  );

  await collection.add({
    ids,
    embeddings: vectors,

    documents: chunksToStore.map((chunk) => chunk.text),

    metadatas: chunksToStore.map((chunk) => ({
      sessionId,
      type: "resume",
      chunkIndex: chunk.originalIndex,
    })),
  });

  return {
    sessionId,
    chunkCount: chunksToStore.length,
    totalChunkCount: resumeChunks.length,
  };
};

// ==================================================
// Requirement → Resume Evidence
// ==================================================

const retrieveResumeEvidence = async (
  sessionId,
  topK = MAX_EVIDENCE_PER_REQUIREMENT,
) => {
  if (!sessionId) {
    throw new AppError(
      "RAG_SESSION_INVALID",
      "RAG session ID is required.",
      500,
      undefined,
      true,
    );
  }

  const collection = await getCollection();

  const safeTopK = Math.min(
    Math.max(Number(topK) || MAX_EVIDENCE_PER_REQUIREMENT, 1),
    MAX_QUERY_RESULTS,
  );

  /*
   * Get JD requirements and their stored embeddings.
   */

  const jdData = await collection.get({
    where: {
      $and: [{ sessionId }, { type: "jd_requirement" }],
    },

    include: ["documents", "metadatas", "embeddings"],
  });

  const requirements = jdData.documents || [];

  const requirementMetadatas = jdData.metadatas || [];
  const requirementVectors = jdData.embeddings || [];

  if (!requirements.length) {
    throw new AppError(
      "RAG_REQUIREMENTS_NOT_FOUND",
      "No stored job requirements were found for this session.",
      422,
    );
  }

  /*
   * Make sure resume vectors exist.
   */

  const resumeData = await collection.get({
    where: {
      $and: [{ sessionId }, { type: "resume" }],
    },
  });

  if (!resumeData.ids?.length) {
    throw new AppError(
      "RAG_RESUME_NOT_FOUND",
      "No stored resume evidence was found for this session.",
      422,
    );
  }

  /*
   * Search every requirement independently.
   */

  const results = await Promise.all(
    requirements.map(async (requirement, index) => {
      const queryEmbedding = requirementVectors[index];

      if (!Array.isArray(queryEmbedding) || !queryEmbedding.length) {
        throw new AppError(
          "RAG_EMBEDDING_MISSING",
          "Stored job requirement embedding is missing.",
          502,
          undefined,
          true,
        );
      }

      const searchResult = await collection.query({
        queryEmbeddings: [queryEmbedding],

        nResults: safeTopK,

        where: {
          $and: [{ sessionId }, { type: "resume" }],
        },

        include: ["documents", "distances", "metadatas"],
      });

      const documents = searchResult.documents?.[0] || [];

      const distances = searchResult.distances?.[0] || [];

      const metadatas = searchResult.metadatas?.[0] || [];

      const evidence = [];

      for (let j = 0; j < documents.length; j++) {
        const document = documents[j];

        const distance = distances[j];

        if (!document || typeof distance !== "number") {
          continue;
        }

        /*
         * Retrieval filter only.
         */

        if (distance > MAX_DISTANCE) {
          continue;
        }

        evidence.push({
          text: document,
          distance,
          chunkIndex: metadatas[j]?.chunkIndex ?? null,
        });
      }

      evidence.sort((a, b) => a.distance - b.distance);

      /*
       * Validate after semantic retrieval.
       */

      const metadata = requirementMetadatas[index] || {};
      const evaluation = getEvidenceStatus(requirement, evidence);

      return {
        requirement,
        category: metadata.category || "other",
        importance: metadata.importance || "required",
        weight: Number(metadata.weight) || importanceWeight(metadata.importance || "required"),

        status: evaluation.status,

        evidenceReason: evaluation.evidenceReason,

        requiredTerms: evaluation.requiredTerms,

        matchedTerms: evaluation.matchedTerms,

        missingTerms: evaluation.missingTerms,

        bestDistance: evaluation.bestDistance,

        /*
         * Never expose misleading semantic
         * evidence for missing requirements.
         */

        evidence: evaluation.status === "missing" ? [] : evidence,
      };
    }),
  );

  return {
    requirements: results,
  };
};

// ==================================================
// Cleanup
// ==================================================

const cleanupSession = async (sessionId) => {
  if (!sessionId) {
    return;
  }

  const collection = await getCollection();

  await deleteSessionVectors(collection, sessionId);
};

// ==================================================
// Exports
// ==================================================

module.exports = {
  extractRequirements,
  embedJobDescription,
  embedResume,
  retrieveResumeEvidence,
  cleanupSession,

  /*
   * Exporting these makes deterministic matching
   * unit-testable.
   */

  normalizeText,
  normalizeTechnicalText,
  getRequirementRule,
  validateTechnicalRequirement,
  getEvidenceStatus,
};
