const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require("chromadb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { AppError } = require("../utils/appError");

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
});

const chromaClient = new ChromaClient({
  host: process.env.CHROMA_HOST || "localhost",
  port: Number(process.env.CHROMA_PORT || 8000),
  ssl: false,
});

const COLLECTION_NAME = "resume_analyser_jd";

const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 500);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 100);

const MAX_DISTANCE = Number(process.env.RAG_MAX_DISTANCE || 0.7);

// Maximum number of JD requirements sent to Gemini
const MAX_RETRIEVED_CHUNKS = 8;

// Maximum resume chunks used for retrieval.
// This protects the embedding API from pathological PDFs.
const MAX_RESUME_CHUNKS = 100;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

const getCollection = async () => {
  return chromaClient.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: {
      description: "Job descriptions for resume matching",
    },
    configuration: {
      hnsw: {
        space: "cosine",
      },
    },
  });
};

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

  const chunks = await splitter.splitText(jdText.trim());

  if (!chunks.length) {
    throw new AppError(
      "RAG_CHUNKING_FAILED",
      "No usable chunks could be created from the job description.",
      422,
    );
  }

  const collection = await getCollection();

  const vectors = await embeddings.embedDocuments(chunks);

  const ids = chunks.map((_, index) => `jd_${sessionId}_${index}`);

  await collection.add({
    ids,
    embeddings: vectors,
    documents: chunks,
    metadatas: chunks.map((_, index) => ({
      sessionId,
      type: "job_description",
      chunkIndex: index,
    })),
  });

  return {
    sessionId,
    chunkCount: chunks.length,
  };
};

/**
 * Retrieve JD requirements using the ENTIRE resume.
 *
 * Instead of:
 *
 *   resumeText.slice(0, 5000)
 *
 * we chunk the entire resume and query Chroma
 * once for every meaningful resume chunk.
 *
 * This prevents skills near the end of the resume
 * from being ignored.
 */

const retrieveRelevantRequirements = async (
  resumeText,
  sessionId,
  topK = 5,
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

  if (!resumeText || !resumeText.trim()) {
    throw new AppError(
      "RAG_RESUME_EMPTY",
      "Resume text is required for JD matching.",
      422,
    );
  }

  const collection = await getCollection();

  const safeTopK = Math.min(Math.max(Number(topK) || 5, 1), 10);

  // --------------------------------------------------
  // 1. Split the ENTIRE resume
  // --------------------------------------------------

  const resumeChunks = await splitter.splitText(resumeText.trim());

  if (!resumeChunks.length) {
    return [];
  }

  // // Protect embedding API from extremely large resumes.
  const selectResumeChunks = (chunks, maxChunks) => {
    if (chunks.length <= maxChunks) {
      return chunks.map((text, index) => ({
        text,
        originalIndex: index,
      }));
    }

    const selected = [];
    const step = (chunks.length - 1) / (maxChunks - 1);

    for (let i = 0; i < maxChunks; i++) {
      const index = Math.round(i * step);

      selected.push({
        text: chunks[index],
        originalIndex: index,
      });
    }

    return selected;
  };

  const chunksToSearch = selectResumeChunks(resumeChunks, MAX_RESUME_CHUNKS);

  console.log(
    `🔎 RAG: searching ${chunksToSearch.length}/${resumeChunks.length} resume chunks`,
  );

  // --------------------------------------------------
  // 2. Embed every resume chunk
  // --------------------------------------------------

  const resumeVectors = await embeddings.embedDocuments(
    chunksToSearch.map((chunk) => chunk.text),
  );

  // --------------------------------------------------
  // 3. Query Chroma for every resume chunk
  // --------------------------------------------------

  const queryResults = await Promise.all(
    resumeVectors.map((vector) =>
      collection.query({
        queryEmbeddings: [vector],
        nResults: safeTopK,
        where: {
          sessionId,
        },
        include: ["documents", "distances", "metadatas"],
      }),
    ),
  );

  const candidates = [];

  for (let i = 0; i < queryResults.length; i++) {
    const results = queryResults[i];

    const documents = results.documents?.[0] || [];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    for (let j = 0; j < documents.length; j++) {
      const document = documents[j];
      const distance = distances[j];

      if (!document || typeof distance !== "number") {
        continue;
      }

      if (distance > MAX_DISTANCE) {
        continue;
      }

      candidates.push({
        document,
        distance,
        metadata: metadatas[j] || {},
        resumeChunkIndex: chunksToSearch[i].originalIndex,
      });
    }
  }

  // --------------------------------------------------
  // 5. Deduplicate JD chunks
  // --------------------------------------------------
  //
  // The same JD chunk may be relevant to several
  // resume chunks. Keep its BEST distance.
  //
  // Lower cosine distance = more similar.
  // --------------------------------------------------

  const uniqueChunks = new Map();

  for (const candidate of candidates) {
    const chunkIndex = candidate.metadata?.chunkIndex;

    const key =
      chunkIndex !== undefined ? `chunk_${chunkIndex}` : candidate.document;

    const existing = uniqueChunks.get(key);

    if (!existing || candidate.distance < existing.distance) {
      uniqueChunks.set(key, candidate);
    }
  }

  // --------------------------------------------------
  // 6. Rank by best similarity
  // --------------------------------------------------

  const ranked = Array.from(uniqueChunks.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_RETRIEVED_CHUNKS);

  console.log(`✅ RAG: ${ranked.length} relevant JD chunks retrieved`);

  return ranked.map((item) => item.document);
};

/**
 * Delete all vectors belonging to a session.
 */
const cleanupSession = async (sessionId) => {
  if (!sessionId) return;

  const collection = await getCollection();

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

module.exports = {
  embedJobDescription,
  retrieveRelevantRequirements,
  cleanupSession,
};
