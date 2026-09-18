const { GoogleGenerativeAI } = require("@google/generative-ai");
const { AppError } = require("../utils/appError");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.6-flash,gemini-3.7-flash,gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MAX_MODEL_RETRIES = Number(process.env.GEMINI_MODEL_RETRIES || 2);
const RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 1000);
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 30000);
const MAX_JD_CHARS = Number(process.env.MAX_JD_EXTRACTION_CHARS || 30000);

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const withTimeout = async (promise, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new AppError("JD_EXTRACTION_TIMEOUT", "Job description requirement extraction timed out.", 408, undefined, true)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const isTransientGeminiError = (error) => {
  const status = Number(error?.status || error?.statusCode || error?.code);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return /service unavailable|temporarily unavailable|high demand|overloaded|rate limit|quota|timeout|timed out|fetching from .*generativelanguage/i.test(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateWithModelFallback = async (prompt) => {
  const models = [...new Set([MODEL_NAME, ...MODEL_FALLBACKS])];
  let lastError;

  for (const modelName of models) {
    const model = genAI.getGenerativeModel({ model: modelName });

    for (let attempt = 0; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
      try {
        const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
        return { result, modelName };
      } catch (error) {
        lastError = error;
        if (!isTransientGeminiError(error) || attempt === MAX_MODEL_RETRIES) break;
        await sleep(RETRY_BASE_MS * (2 ** attempt));
      }
    }
  }

  throw new AppError(
    "AI_MODEL_UNAVAILABLE",
    "Gemini is temporarily unavailable. The analyzer tried the configured model and fallback models. Please retry shortly.",
    503,
    lastError?.message,
    true,
  );
};

const parseJson = (raw) => {
  const text = String(raw || "").replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new AppError("JD_EXTRACTION_INVALID", "The AI could not produce valid job requirements.", 502, undefined, true);
    try { return JSON.parse(match[0]); }
    catch (error) { throw new AppError("JD_EXTRACTION_INVALID", "The AI could not produce valid job requirements.", 502, error.message, true); }
  }
};

const allowedCategories = new Set([
  "skill", "experience", "education", "certification", "license",
  "responsibility", "domain_knowledge", "language", "location",
  "work_authorization", "seniority", "other",
]);

const allowedImportance = new Set(["critical", "required", "preferred", "nice_to_have"]);

const inferImportance = (text) => {
  const lc = text.toLowerCase();
  if (/\b(must have|mandatory|non[- ]negotiable|hard requirement|disqualif(?:y|ying)|required license|required certification)\b/.test(lc)) return "critical";
  if (/\b(must|required|required to|minimum|need to|shall)\b/.test(lc)) return "required";
  if (/\b(preferred|prefer|ideally|desired)\b/.test(lc)) return "preferred";
  if (/\b(nice to have|bonus|plus|would be a plus)\b/.test(lc)) return "nice_to_have";
  return "required";
};

const importanceWeight = (importance) => ({
  critical: 1.5,
  required: 1.0,
  preferred: 0.6,
  nice_to_have: 0.3,
}[importance] || 1);

const cleanRequirement = (item, index) => {
  const text = normalize(item?.text || item?.requirement);
  if (text.length < 5) return null;
  const category = allowedCategories.has(item?.category) ? item.category : "other";
  const importance = allowedImportance.has(item?.importance) ? item.importance : inferImportance(text);
  const weight = Number(clamp(Number(item?.weight) || importanceWeight(importance), 0.2, 2).toFixed(2));
  const logic = item?.logic === "AND" || item?.logic === "OR" ? item.logic : null;
  const components = Array.isArray(item?.components)
    ? item.components.map((component) => normalize(component?.text || component)).filter(Boolean)
    : [];
  const alternatives = Array.isArray(item?.alternatives)
    ? item.alternatives.map((alternative) => ({
        text: normalize(alternative?.text || alternative),
        degree: alternative?.degree || null,
        minYears: Number.isFinite(Number(alternative?.minYears)) ? Number(alternative.minYears) : null,
        maxYears: Number.isFinite(Number(alternative?.maxYears)) ? Number(alternative.maxYears) : null,
      })).filter((alternative) => alternative.text)
    : [];
  return {
    id: `req_${index + 1}`,
    text,
    category,
    importance,
    weight,
    logic,
    components,
    alternatives,
  };
};

const dedupe = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractRequirementsWithAI = async (jobDescription) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("AI_CONFIG_MISSING", "GEMINI_API_KEY is not configured.", 500, undefined, true);
  }

  const jd = String(jobDescription || "").slice(0, MAX_JD_CHARS);

  const prompt = `
You are a universal job-description requirements extraction engine.

Extract atomic, actionable hiring requirements from the job description below.
This system must work for ANY profession or industry: software, finance,
healthcare, sales, marketing, legal, education, engineering, operations,
design, research, skilled trades, public sector, and others.

Rules:
1. Extract only requirements that affect candidate qualification, selection, or job fit.
2. Split combined requirements when they can be evaluated independently. For example, "BS + 1-3 years" should become one structured requirement preserving BOTH degree and experience constraints, while "C/C++ and Python" should remain one skill requirement if the candidate must have both. Split a bullet when its clauses can be independently satisfied or failed.
3. Do not copy section headings, company descriptions, benefits, generic culture text, or duplicated sentences.
4. Preserve important qualifiers such as minimum years, degree level, license status, location, work authorization, required tools, languages, quotas, scope, and seniority.
5. Never assume a requirement is technical.
6. Categorize each requirement using ONLY:
   skill, experience, education, certification, license, responsibility,
   domain_knowledge, language, location, work_authorization, seniority, other
7. Importance:
   critical = explicit hard gate / must-have that can disqualify a candidate
   required = explicitly required qualification
   preferred = preferred/desirable qualification
   nice_to_have = bonus/plus
8. Return concise requirement text that can be matched against resume evidence.
9. Do not invent requirements.
10. If the JD contains an explicit minimum years threshold, keep it in the requirement text.
11. Preserve logical structure. Use logic="AND" when ALL listed clauses are required, and logic="OR" when ANY alternative satisfies the requirement.
12. For compound requirements, return independently evaluable components. For example, "C/C++ and Python" has logic="AND" with two components.
13. For alternatives such as "MS + 0-2 years OR BS + 1-3 years", use logic="OR" with alternatives. Each alternative may contain degree and experience constraints.
14. Do not use semantic similarity as proof. The downstream matcher will validate each component separately.

Return ONLY JSON in this shape:
{
  "requirements": [
    {
      "text": "...",
      "category": "skill",
      "importance": "required",
      "weight": 1.0,
      "logic": null,
      "components": [],
      "alternatives": []
    }
  ]
}

JOB DESCRIPTION:
${jd}
`;

  const { result } = await generateWithModelFallback(prompt);
  const parsed = parseJson(result.response.text());
  const raw = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  const cleaned = dedupe(raw.map(cleanRequirement).filter(Boolean));

  if (!cleaned.length) {
    throw new AppError("JD_REQUIREMENTS_NOT_FOUND", "No usable job requirements could be extracted from the job description.", 422);
  }

  return cleaned;
};

module.exports = {
  extractRequirementsWithAI,
  importanceWeight,
};
