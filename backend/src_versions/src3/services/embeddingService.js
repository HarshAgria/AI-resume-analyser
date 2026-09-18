const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require("chromadb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { AppError } = require("../utils/appError");
const { extractRequirementsWithAI, importanceWeight } = require("./requirementExtractionService");

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
});

const chromaClient = new ChromaClient({
  host: process.env.CHROMA_HOST || "localhost",
  port: Number(process.env.CHROMA_PORT || 8000),
  ssl: false,
});

const COLLECTION_NAME = process.env.RAG_COLLECTION_NAME || "resume_analyser_rag";
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 700);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const MAX_DISTANCE = Number(process.env.RAG_MAX_DISTANCE || 0.60);
const STRONG_MATCH_DISTANCE = Number(process.env.RAG_STRONG_MATCH_DISTANCE || 0.38);
const POSSIBLE_MATCH_DISTANCE = Number(process.env.RAG_POSSIBLE_MATCH_DISTANCE || 0.55);
const MAX_EVIDENCE_PER_REQUIREMENT = Number(process.env.RAG_MAX_EVIDENCE_PER_REQUIREMENT || 4);
const MAX_QUERY_RESULTS = Number(process.env.RAG_MAX_QUERY_RESULTS || 8);

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
});

// -----------------------------------------------------------------------------
// Domain-agnostic text handling
// -----------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","has","have",
  "in","is","of","on","or","the","to","with","will","you","your","we",
  "our","this","that","than","then","into","over","under","using","used",
  "use","including","such","their","they","them","it","its","about","through",
  "across","within","while","must","should","can","may","able","ability","work",
  "working","experience","knowledge","understanding","strong","excellent","good",
  "skills","skill","role","roles","responsible","responsibilities","required",
  "requirements","preferred","candidate","candidates","position","job","team","teams",
  "develop","developing","development","provide","providing","support","supports",
]);

const normalizeText = (text) => String(text || "")
  .toLowerCase()
  .replace(/\r/g, "\n")
  // Keep characters useful for credentials, versions and compound terms.
  .replace(/[()[\]{}:,;!?"`|\\]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeResumeText = (text) => String(text || "")
  .replace(/\r/g, "\n")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const cleanRequirement = (text) => String(text || "")
  .replace(/\s+/g, " ")
  .replace(/^[-•*▪◦]+\s*/, "")
  .trim();

const normalizeRequirementKey = (text) => normalizeText(text)
  .replace(/[^a-z0-9+#./-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const deduplicateRequirements = (requirements) => {
  const seen = new Set();
  return requirements.filter((item) => {
    const key = normalizeRequirementKey(item.text || item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const meaningfulTerms = (text) => normalizeText(text)
  .split(/\s+/)
  .map((term) => term.replace(/^[^a-z0-9+#./-]+|[^a-z0-9+#./-]+$/gi, ""))
  .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));

const tokenRegex = (term) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
};

const lexicalEvidenceScore = (requirement, evidenceText) => {
  const terms = [...new Set(meaningfulTerms(requirement))];
  if (!terms.length) return 0;
  const evidence = normalizeText(evidenceText);
  const matched = terms.filter((term) => tokenRegex(term).test(evidence));
  return matched.length / terms.length;
};

// Exact phrase / token evidence is evaluated across the complete resume corpus,
// not only the top semantic chunks. This prevents RAG ranking from hiding an
// explicit qualification such as "C++" or "Python" elsewhere in the CV.
const explicitEvidence = (requirement, resumeChunks) => {
  const req = normalizeText(requirement);
  const allText = resumeChunks.map((c) => c.text || "").join("\n");
  const lexicalScore = lexicalEvidenceScore(requirement, allText);

  const phrases = req
    .split(/\s+(?:and|or)\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);

  const matchedPhrases = phrases.filter((phrase) => {
    const terms = meaningfulTerms(phrase);
    return terms.length > 0 && lexicalEvidenceScore(phrase, allText) >= 0.80;
  });

  // A concise requirement with strong lexical overlap is explicit enough for
  // deterministic validation, while longer natural-language requirements are
  // left to semantic evidence unless the resume contains most of their terms.
  const explicit = lexicalScore >= (meaningfulTerms(requirement).length <= 3 ? 0.66 : 0.72);

  const chunks = resumeChunks
    .map((chunk) => ({
      ...chunk,
      lexicalScore: lexicalEvidenceScore(requirement, chunk.text || ""),
    }))
    .filter((chunk) => chunk.lexicalScore >= 0.25)
    .sort((a, b) => b.lexicalScore - a.lexicalScore);

  return {
    explicit,
    lexicalScore,
    matchedPhrases,
    chunks,
  };
};

// -----------------------------------------------------------------------------
// Generic requirement-aware validation
// -----------------------------------------------------------------------------

const extractYearRanges = (text) => {
  const matches = [...String(text || "").matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/gi)];
  return matches.map((m) => Number(m[1])).filter(Number.isFinite);
};

const calculateExperienceYears = (resumeText) => {
  const source = String(resumeText || "");

  // Prefer employment/work-history sections so university/school dates do not
  // get counted as professional experience. If no section marker exists, fall
  // back to the full document rather than pretending experience is absent.
  const sectionPattern = /(?:professional experience|work experience|employment history|work history|career history|experience)\b/i;
  const sectionMatch = source.match(sectionPattern);
  let text = source;
  if (sectionMatch && sectionMatch.index !== undefined) {
    const start = sectionMatch.index;
    const remainder = source.slice(start + sectionMatch[0].length);
    const endMatch = remainder.match(/\n\s*(?:education|academic background|qualifications|certifications|skills|projects|achievements|awards|publications|references)\b/i);
    text = remainder.slice(0, endMatch ? endMatch.index : remainder.length);
  }

  const monthMap = {
    jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,
    jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11,
  };
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthNames = Object.keys(monthMap).join("|");
  const pattern = new RegExp(
    `(?:(${monthNames})\\.?\\s*)?(20\\d{2})\\s*(?:-|–|—|to)\\s*(?:(${monthNames})\\.?\\s*)?(20\\d{2}|present|current)`,
    "gi",
  );

  const ranges = [];
  for (const match of text.matchAll(pattern)) {
    const startMonth = match[1] ? monthMap[match[1].toLowerCase()] : 0;
    const startYear = Number(match[2]);
    const endMonth = match[3] ? monthMap[match[3].toLowerCase()] : currentMonth;
    const endYear = /present|current/i.test(match[4]) ? currentYear : Number(match[4]);
    if (!startYear || !endYear || endYear < startYear) continue;
    const months = Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth) + 1);
    ranges.push(months / 12);
  }
  return ranges.reduce((sum, value) => sum + value, 0);
};

const hasDegreeEvidence = (requirement, resumeText) => {
  const req = normalizeText(requirement);
  const resume = normalizeText(resumeText);
  const bachelor = /\b(bachelor|b\.?s\.?|b\.?tech|b\.?e\.?|undergraduate|bsc|bca)\b/.test(req);
  const master = /\b(master|m\.?s\.?|m\.?tech|m\.?e\.?|msc|mba|graduate degree)\b/.test(req);
  if (bachelor && /\b(bachelor|b\.?s\.?|b\.?tech|b\.?e\.?|bsc|bca)\b/.test(resume)) return true;
  if (master && /\b(master|m\.?s\.?|m\.?tech|m\.?e\.?|msc|mba)\b/.test(resume)) return true;
  return false;
};

const structuredValidation = (requirement, resumeText, category) => {
  const req = normalizeText(requirement);
  const resume = normalizeText(resumeText);
  const hasDegreeCue = /\b(?:bs|bachelor|b\.s\.|btech|b\.?e\.?|bsc|bca|master|ms|m\.s\.|mtech|m\.?e\.?|msc|mba|degree)\b/.test(req);
  const requestedYears = extractYearRanges(req);

  if (hasDegreeCue) {
    const degreeMatch = hasDegreeEvidence(requirement, resumeText);
    if (!degreeMatch) {
      return { status: "missing", reason: "The required degree level is not explicitly demonstrated in the resume." };
    }

    if (requestedYears.length) {
      const candidateYears = calculateExperienceYears(resumeText);
      const minimum = Math.min(...requestedYears);
      if (candidateYears < minimum) {
        return { status: "missing", reason: `The required degree is present, but the resume documents approximately ${candidateYears.toFixed(1)} years of professional experience, below the stated minimum of ${minimum} years.` };
      }
      return { status: "strong_match", reason: `The required degree is present and the resume documents approximately ${candidateYears.toFixed(1)} years of professional experience, meeting the stated minimum of ${minimum} years.` };
    }

    return { status: "strong_match", reason: "The required degree level is explicitly present in the resume." };
  }

  if ((category === "experience" || /\b\d+\s*\+?\s*years?\b/.test(req)) && requestedYears.length) {
    const candidateYears = calculateExperienceYears(resumeText);
    const minimum = Math.min(...requestedYears);
    if (candidateYears >= minimum) {
      return { status: "strong_match", reason: `The resume documents approximately ${candidateYears.toFixed(1)} years of professional experience, meeting the stated minimum of ${minimum} years.` };
    }
    return { status: "missing", reason: `The resume documents approximately ${candidateYears.toFixed(1)} years of professional experience, below the stated minimum of ${minimum} years.` };
  }

  if (["license", "certification", "work_authorization", "language"].includes(category)) {
    if (meaningfulTerms(requirement).length && lexicalEvidenceScore(requirement, resumeText) >= 0.65) {
      return { status: "strong_match", reason: "The requested credential, license, authorization, or language is explicitly evidenced in the resume." };
    }
  }

  return null;
};

const getEvidenceStatus = (requirement, evidence, resumeText = "", category = "other") => {
  const semanticEvidence = Array.isArray(evidence) ? evidence : [];
  const allChunks = semanticEvidence.map((item) => ({ text: item.text || "", chunkIndex: item.chunkIndex ?? null }));
  const explicit = explicitEvidence(requirement, resumeText ? resumeText.split(/\n{2,}/).map((text, i) => ({ text, chunkIndex: i })) : allChunks);
  const bestDistance = semanticEvidence.length ? semanticEvidence[0].distance : null;

  const structured = structuredValidation(requirement, resumeText, category);
  if (structured) {
    const evidenceChunks = explicit.chunks.length ? explicit.chunks : semanticEvidence;
    return {
      status: structured.status,
      evidenceReason: structured.reason,
      bestDistance,
      lexicalScore: explicit.lexicalScore,
      evidence: evidenceChunks,
    };
  }

  if (explicit.explicit) {
    return {
      status: "strong_match",
      evidenceReason: "The resume contains explicit lexical evidence for the requirement.",
      bestDistance,
      lexicalScore: explicit.lexicalScore,
      evidence: explicit.chunks.length ? explicit.chunks : semanticEvidence,
    };
  }

  if (bestDistance !== null && bestDistance <= STRONG_MATCH_DISTANCE) {
    return {
      status: "strong_match",
      evidenceReason: "Strong semantic evidence was found for the requirement.",
      bestDistance,
      lexicalScore: explicit.lexicalScore,
      evidence: semanticEvidence,
    };
  }

  if (bestDistance !== null && bestDistance <= POSSIBLE_MATCH_DISTANCE) {
    return {
      status: "possible_match",
      evidenceReason: "Related resume evidence was found, but it does not establish the requirement with high certainty.",
      bestDistance,
      lexicalScore: explicit.lexicalScore,
      evidence: semanticEvidence,
    };
  }

  return {
    status: "missing",
    evidenceReason: "The resume does not provide sufficient evidence for this requirement.",
    bestDistance,
    lexicalScore: explicit.lexicalScore,
    evidence: [],
  };
};

const scoreRequirements = (requirements) => {
  const statusValue = { strong_match: 1, possible_match: 0.5, missing: 0 };
  const totalWeight = requirements.reduce((sum, item) => sum + (Number(item.weight) || importanceWeight(item.importance || "required")), 0);
  const achievedWeight = requirements.reduce((sum, item) => {
    const weight = Number(item.weight) || importanceWeight(item.importance || "required");
    return sum + weight * (statusValue[item.status] || 0);
  }, 0);
  return totalWeight > 0 ? Number(((achievedWeight / totalWeight) * 100).toFixed(1)) : 0;
};

// Compatibility exports: intentionally no profession-specific rules.
const getRequirementRule = () => null;
const getTechnicalGroupsForRequirement = () => [];
const validateTechnicalRequirement = (requirement, evidence) => ({
  isTechnicalRequirement: false,
  mode: null,
  requiredTerms: [],
  matchedTerms: [],
  missingTerms: [],
  satisfied: true,
  lexicalScore: lexicalEvidenceScore(requirement, evidence.map((item) => item?.text || "").join(" ")),
});

// -----------------------------------------------------------------------------
// Chroma
// -----------------------------------------------------------------------------

const getCollection = async () => chromaClient.getOrCreateCollection({
  name: COLLECTION_NAME,
  metadata: { description: "Domain-agnostic resume/JD evidence vectors." },
  configuration: { hnsw: { space: "cosine" } },
});

const deleteSessionVectors = async (collection, sessionId) => {
  const results = await collection.get({ where: { sessionId } });
  if (results.ids?.length) await collection.delete({ ids: results.ids });
};

const extractRequirements = async (jdText) => extractRequirementsWithAI(jdText);

const embedJobDescription = async (jdText, sessionId) => {
  if (!jdText || jdText.trim().length < 50) throw new AppError("RAG_JD_TOO_SHORT", "Job description must contain at least 50 characters.", 400);
  if (!sessionId) throw new AppError("RAG_SESSION_INVALID", "RAG session ID is required.", 500, undefined, true);

  const requirements = deduplicateRequirements(await extractRequirements(jdText));
  if (!requirements.length) throw new AppError("RAG_REQUIREMENTS_NOT_FOUND", "No usable job requirements could be extracted from the job description.", 422);

  const collection = await getCollection();
  await deleteSessionVectors(collection, sessionId);
  const vectors = await embeddings.embedDocuments(requirements.map((item) => item.text));
  const ids = requirements.map((_, i) => `jd_requirement_${sessionId}_${i}`);

  await collection.add({
    ids,
    embeddings: vectors,
    documents: requirements.map((item) => item.text),
    metadatas: requirements.map((item, index) => ({
      sessionId,
      type: "jd_requirement",
      requirementIndex: index,
      category: item.category || "other",
      importance: item.importance || "required",
      weight: Number(item.weight) || importanceWeight(item.importance || "required"),
    })),
  });

  return { sessionId, requirementCount: requirements.length, requirements };
};

const embedResume = async (resumeText, sessionId) => {
  if (!resumeText?.trim()) throw new AppError("RAG_RESUME_EMPTY", "Resume text is required for RAG matching.", 422);
  if (!sessionId) throw new AppError("RAG_SESSION_INVALID", "RAG session ID is required.", 500, undefined, true);

  const chunks = await splitter.splitText(normalizeResumeText(resumeText));
  if (!chunks.length) throw new AppError("RAG_RESUME_CHUNKING_FAILED", "No usable resume chunks could be created.", 422);

  const collection = await getCollection();
  const existing = await collection.get({ where: { $and: [{ sessionId }, { type: "resume" }] } });
  if (existing.ids?.length) await collection.delete({ ids: existing.ids });

  const vectors = await embeddings.embedDocuments(chunks);
  const ids = chunks.map((_, i) => `resume_${sessionId}_${i}`);
  await collection.add({
    ids,
    embeddings: vectors,
    documents: chunks,
    metadatas: chunks.map((_, i) => ({ sessionId, type: "resume", chunkIndex: i })),
  });
  return { sessionId, chunkCount: chunks.length, totalChunkCount: chunks.length };
};

const retrieveResumeEvidence = async (sessionId, topK = MAX_EVIDENCE_PER_REQUIREMENT) => {
  if (!sessionId) throw new AppError("RAG_SESSION_INVALID", "RAG session ID is required.", 500, undefined, true);
  const collection = await getCollection();
  const safeTopK = Math.min(Math.max(Number(topK) || MAX_EVIDENCE_PER_REQUIREMENT, 1), MAX_QUERY_RESULTS);

  const jdData = await collection.get({
    where: { $and: [{ sessionId }, { type: "jd_requirement" }] },
    include: ["documents", "metadatas", "embeddings"],
  });
  const requirements = jdData.documents || [];
  const requirementMetadatas = jdData.metadatas || [];
  const requirementVectors = jdData.embeddings || [];
  if (!requirements.length) throw new AppError("RAG_REQUIREMENTS_NOT_FOUND", "No stored job requirements were found for this session.", 422);

  const resumeData = await collection.get({
    where: { $and: [{ sessionId }, { type: "resume" }] },
    include: ["documents", "metadatas"],
  });
  const resumeDocuments = resumeData.documents || [];
  if (!resumeDocuments.length) throw new AppError("RAG_RESUME_NOT_FOUND", "No stored resume evidence was found for this session.", 422);

  const resumeChunks = resumeDocuments.map((text, i) => ({
    text,
    chunkIndex: resumeData.metadatas?.[i]?.chunkIndex ?? i,
  }));
  const completeResumeText = resumeChunks.map((x) => x.text).join("\n\n");

  const results = await Promise.all(requirements.map(async (requirement, index) => {
    const queryEmbedding = requirementVectors[index];
    if (!Array.isArray(queryEmbedding) || !queryEmbedding.length) throw new AppError("RAG_EMBEDDING_MISSING", "Stored job requirement embedding is missing.", 502, undefined, true);

    const searchResult = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: safeTopK,
      where: { $and: [{ sessionId }, { type: "resume" }] },
      include: ["documents", "distances", "metadatas"],
    });

    const semanticEvidence = [];
    const docs = searchResult.documents?.[0] || [];
    const distances = searchResult.distances?.[0] || [];
    const metas = searchResult.metadatas?.[0] || [];
    for (let i = 0; i < docs.length; i++) {
      if (!docs[i] || typeof distances[i] !== "number" || distances[i] > MAX_DISTANCE) continue;
      semanticEvidence.push({ text: docs[i], distance: distances[i], chunkIndex: metas[i]?.chunkIndex ?? null });
    }
    semanticEvidence.sort((a, b) => a.distance - b.distance);

    const metadata = requirementMetadatas[index] || {};
    const evaluation = getEvidenceStatus(requirement, semanticEvidence, completeResumeText, metadata.category || "other");

    const evidence = (evaluation.evidence || []).slice(0, safeTopK);
    return {
      requirement,
      category: metadata.category || "other",
      importance: metadata.importance || "required",
      weight: Number(metadata.weight) || importanceWeight(metadata.importance || "required"),
      status: evaluation.status,
      evidenceReason: evaluation.evidenceReason,
      bestDistance: evaluation.bestDistance,
      lexicalScore: evaluation.lexicalScore,
      evidence,
    };
  }));

  return {
    requirements: results,
    jdMatchScore: scoreRequirements(results),
    blockingRequirements: results
      .filter((item) => ["critical", "required"].includes(item.importance) && item.status === "missing")
      .map((item) => item.requirement),
  };
};

const cleanupSession = async (sessionId) => {
  if (!sessionId) return;
  const collection = await getCollection();
  await deleteSessionVectors(collection, sessionId);
};

module.exports = {
  extractRequirements,
  embedJobDescription,
  embedResume,
  retrieveResumeEvidence,
  cleanupSession,
  scoreRequirements,
  normalizeText,
  normalizeTechnicalText: normalizeText,
  getRequirementRule,
  validateTechnicalRequirement,
  getEvidenceStatus,
  calculateExperienceYears,
};
