const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  RecursiveCharacterTextSplitter,
} = require("@langchain/textsplitters");

const { AppError } = require("../utils/appError");
const {
  normalizeText,
} = require("../utils/textExtraction");

// ==================================================
// Gemini
// ==================================================

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY,
);

const MODEL_NAME =
  process.env.GEMINI_MODEL ||
  "gemini-3.5-flash-lite";

const MODEL_FALLBACKS = (process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.6-flash,gemini-3.7-flash,gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MAX_MODEL_RETRIES = Number(process.env.GEMINI_MODEL_RETRIES || 2);
const RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 1000);

const MAX_INPUT_CHARS = Number(
  process.env.MAX_AI_INPUT_CHARS || 22000,
);

const MAX_SECTION_CHARS = Number(
  process.env.MAX_AI_SECTION_CHARS || 9000,
);

const AI_TIMEOUT_MS = Number(
  process.env.AI_TIMEOUT_MS || 30000,
);

// ==================================================
// Timeout
// ==================================================

const withTimeout = async (
  promise,
  timeoutMs,
) => {
  let timeoutHandle;

  const timeoutPromise =
    new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () =>
          reject(
            new AppError(
              "AI_TIMEOUT",
              "The AI request timed out. Please try again.",
              408,
              undefined,
              true,
            ),
          ),
        timeoutMs,
      );
    });

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutHandle);
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
        const result = await withTimeout(model.generateContent(prompt), AI_TIMEOUT_MS);
        return { result, modelName };
      } catch (error) {
        lastError = error;
        const status = Number(error?.status || error?.statusCode || error?.code);
        const message = String(error?.message || error || "");
        const modelUnavailable = [400, 404].includes(status) || /model.*(not found|does not exist|not supported)|not found/i.test(message);

        // A bad/retired model must not consume retries. Move immediately to the next model.
        if (modelUnavailable) break;
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

// ==================================================
// JSON parser
// ==================================================

const parseJsonResponse = (
  rawText,
) => {
  const cleanText = String(
    rawText || "",
  )
    .replace(/```json|```/g, "")
    .trim();

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    const match =
      cleanText.match(
        /\{[\s\S]*\}/,
      );

    if (match) {
      try {
        return JSON.parse(
          match[0],
        );
      } catch (nestedError) {
        throw new AppError(
          "AI_RESPONSE_INVALID",
          "The AI response format was invalid. Please retry.",
          502,
          nestedError.message,
          true,
        );
      }
    }

    throw new AppError(
      "AI_RESPONSE_INVALID",
      "The AI response format was invalid. Please retry.",
      502,
      err.message,
      true,
    );
  }
};

// ==================================================
// Resume chunking
// ==================================================

const splitter =
  new RecursiveCharacterTextSplitter({
    chunkSize:
      MAX_SECTION_CHARS,
    chunkOverlap: 300,
  });

const splitIntoChunks = async (
  text,
) => {
  if (
    !text ||
    text.length <=
      MAX_SECTION_CHARS
  ) {
    return [text];
  }

  const chunks =
    await splitter.splitText(
      text,
    );

  return chunks.length
    ? chunks
    : [text];
};

// ==================================================
// Long resume summarization
// ==================================================

const summarizeLongResume = async (
  text,
) => {
  if (!text) {
    return "";
  }

  if (
    text.length <=
    MAX_INPUT_CHARS
  ) {
    return text;
  }

  const chunks =
    await splitIntoChunks(text);

  const summaries = [];

  for (
    const [
      index,
      chunk,
    ] of chunks.entries()
  ) {
    const chunkPrompt = `
You are preparing reliable ATS analysis input.

Summarize this resume section into concise factual bullets.

Preserve:
- candidate name
- job titles
- employers
- dates
- years of experience
- technologies
- tools
- programming languages
- frameworks
- databases
- cloud platforms
- certifications
- education
- projects
- measurable achievements
- responsibilities
- domain expertise

Do not invent anything.
Do not infer missing information.
Do not remove important technical details.

Section ${index + 1}/${chunks.length}:

${chunk}
`;

    const { result } =
      await generateWithModelFallback(
          chunkPrompt,
        );

    const summary =
      result.response
        .text()
        .trim();

    if (summary) {
      summaries.push(
        summary,
      );
    }
  }

  const combined =
    summaries.join("\n\n");

  if (
    combined.length <=
    MAX_INPUT_CHARS
  ) {
    return combined;
  }

  const compressionPrompt = `
Compress the following resume analysis notes into a highly information-dense factual summary suitable for ATS evaluation.

Preserve:
- candidate identity
- employment history
- dates
- job titles
- technologies
- tools
- frameworks
- databases
- cloud platforms
- certifications
- education
- projects
- measurable achievements
- domain expertise

Do not invent information.
Do not remove important technologies or experience.

Return concise structured bullets only.

Resume notes:

${combined}
`;

  const { result } =
    await generateWithModelFallback(
      compressionPrompt,
    );

  return result.response
    .text()
    .trim();
};

// ==================================================
// RAG context
// ==================================================

const buildRagContext = (
  ragResults,
) => {
  if (
    !Array.isArray(
      ragResults,
    ) ||
    !ragResults.length
  ) {
    return "";
  }

  return ragResults
    .map((item, index) => {
      const requirement =
        String(
          item?.requirement ||
            "",
        ).trim();

      if (!requirement) {
        return "";
      }

      const status =
        String(
          item?.status ||
            "missing",
        ).trim();

      const evidence =
        Array.isArray(
          item?.evidence,
        )
          ? item.evidence
              .slice(0, 3)
              .map((entry) => {
                const text =
                  String(
                    entry?.text ||
                      "",
                  ).trim();

                if (!text) {
                  return null;
                }

                const distance =
                  typeof entry?.distance ===
                  "number"
                    ? entry.distance.toFixed(
                        3,
                      )
                    : "n/a";

                return `- [distance=${distance}] ${text}`;
              })
              .filter(Boolean)
              .join("\n")
          : "";

      const requiredTerms =
        Array.isArray(
          item?.requiredTerms,
        )
          ? item.requiredTerms.join(
              ", ",
            )
          : "";

      const matchedTerms =
        Array.isArray(
          item?.matchedTerms,
        )
          ? item.matchedTerms.join(
              ", ",
            )
          : "";

      const missingTerms =
        Array.isArray(
          item?.missingTerms,
        )
          ? item.missingTerms.join(
              ", ",
            )
          : "";

      return `
Requirement ${index + 1}:
${requirement}

Deterministic Retrieval Status:
${status}

Required Technical Terms:
${requiredTerms || "None"}

Matched Technical Terms:
${matchedTerms || "None"}

Missing Technical Terms:
${missingTerms || "None"}

Resume Evidence:
${
  evidence ||
  "No matching resume evidence found."
}
`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
};

// ==================================================
// AI error mapping
// ==================================================

const mapAiError = (
  err,
) => {
  const message =
    String(
      err?.message || "",
    ).toLowerCase();

  if (
    err instanceof AppError
  ) {
    return err;
  }

  if (
    message.includes(
      "token",
    ) ||
    message.includes(
      "context",
    ) ||
    message.includes(
      "maximum input",
    )
  ) {
    return new AppError(
      "TOKEN_LIMIT_EXCEEDED",
      "The resume content exceeded model token limits. Please try a shorter resume.",
      413,
      err.message,
      true,
    );
  }

  if (
    message.includes(
      "deadline",
    ) ||
    message.includes(
      "timeout",
    ) ||
    message.includes(
      "timed out",
    )
  ) {
    return new AppError(
      "AI_TIMEOUT",
      "The AI analysis request timed out. Please try again.",
      408,
      err.message,
      true,
    );
  }

  if (
    message.includes("503") ||
    message.includes("service unavailable") ||
    message.includes("high demand") ||
    message.includes("temporarily unavailable") ||
    message.includes("overloaded")
  ) {
    return new AppError(
      "AI_MODEL_UNAVAILABLE",
      "Gemini is temporarily overloaded. Please retry shortly; the analyzer will automatically use a fallback model when available.",
      503,
      err.message,
      true,
    );
  }

  if (
    message.includes(
      "429",
    ) ||
    message.includes(
      "quota",
    ) ||
    message.includes(
      "rate",
    )
  ) {
    return new AppError(
      "AI_RATE_LIMITED",
      "The AI service is busy right now. Please retry in a moment.",
      429,
      err.message,
      true,
    );
  }

  return new AppError(
    "AI_ANALYSIS_FAILED",
    "The AI service could not complete resume analysis.",
    502,
    err.message,
    true,
  );
};

// ==================================================
// Analyze Resume
// ==================================================

const analyzeResume = async (
  resumeText,
  targetRole = "",
  relevantJDChunks = [],
) => {
  if (
    !resumeText ||
    !resumeText.trim()
  ) {
    throw new AppError(
      "AI_RESUME_EMPTY",
      "Resume text is required for AI analysis.",
      422,
    );
  }

  const normalized =
    normalizeText(
      resumeText,
    );

  const currentDate =
    new Date()
      .toISOString()
      .split("T")[0];

  const hasRagAnalysis =
    Array.isArray(
      relevantJDChunks,
    ) &&
    relevantJDChunks.length >
      0;

  const ragContext =
    buildRagContext(
      relevantJDChunks,
    );

  try {
    const preparedResume =
      await summarizeLongResume(
        normalized,
      );

    const prompt = `
You are a senior recruiter and ATS optimization expert.

Evaluate resumes for any profession, industry, and seniority.

Your analysis must be:
- factual
- objective
- evidence-based
- role-aware
- ATS-aware
- free from assumptions

Return ONLY a valid JSON object.
Do not return markdown.
Do not return comments.
Do not return explanations outside the JSON object.

========================================
RESUME
========================================

${preparedResume.slice(
  0,
  MAX_INPUT_CHARS,
)}

========================================
TARGET ROLE
========================================

${targetRole || "Not provided"}

========================================
CURRENT DATE
========================================

${currentDate}

========================================
DETERMINISTIC JD MATCHING DATA
========================================

${
  hasRagAnalysis
    ? ragContext
    : "No job description analysis was provided."
}

========================================
CRITICAL MATCHING RULE — RAG IS SOURCE OF TRUTH
========================================

The "DETERMINISTIC JD MATCHING DATA" section contains the complete,
individual job requirements extracted and evaluated by the RAG system.

You MUST use those individual "Requirement N:" entries as the ONLY
source for:

- matchedRequirements
- missingRequirements
- jdMatchScore

DO NOT extract requirements again from the resume.
DO NOT extract requirements again from the raw job description.
DO NOT use the raw job description as a fallback.
DO NOT put the entire job description into matchedRequirements
or missingRequirements.
DO NOT combine multiple requirements into one string.

Each item in matchedRequirements or missingRequirements MUST correspond
to exactly ONE "Requirement N:" from the deterministic RAG data.

Mapping rules:

- strong_match → matchedRequirements
- possible_match → possibleRequirements
- missing → missingRequirements

For every Requirement N:

1. Copy the individual requirement text from the "Requirement N:" field.
2. Look only at its deterministic retrieval status and supplied evidence.
3. Put that individual requirement into the appropriate output array.
4. Never replace it with the full job description.

Example:

If the deterministic data contains:

Requirement 1:
Node.js

Deterministic Retrieval Status:
strong_match

Requirement 2:
Express.js

Deterministic Retrieval Status:
missing

Requirement 3:
PostgreSQL

Deterministic Retrieval Status:
missing

Then the output MUST contain:

"matchedRequirements": [
  "Node.js"
],

"missingRequirements": [
  "Express.js",
  "PostgreSQL"
]

It is INVALID to return:

"missingRequirements": [
  "<entire job description>"
]

The raw job description is contextual information only. It is NOT
a source for constructing these arrays.

========================================
EVIDENCE MATCHING RULE
========================================

This analyzer is domain-agnostic. Requirements may concern any profession,
including technology, finance, healthcare, sales, marketing, operations,
legal, education, design, research, skilled trades, public sector, or other
fields. Never assume that a requirement is technical.

Use the deterministic retrieval status and supplied evidence as the source
of truth. Semantic similarity may connect differently worded but equivalent
experience; do not invent qualifications, credentials, employers, tools, or
experience that are not supported by the resume evidence.

A possible_match means related evidence exists but the match is uncertain. It
must appear in possibleRequirements, not missingRequirements.

A missing requirement means the supplied resume evidence does not demonstrate
the requirement sufficiently.

========================================
========================================
JSON SCHEMA
========================================

{
  "score": <number 1-10 with one decimal>,
  "atsRating": "<Excellent | Good | Fair | Poor>",
  "summary": "<2-3 sentence assessment>",
  "strengths": [
    "<strength 1>",
    "<strength 2>",
    "<strength 3>"
  ],
  "improvements": [
    "<improvement 1>",
    "<improvement 2>",
    "<improvement 3>"
  ],
  "missingKeywords": [
    "<keyword1>",
    "<keyword2>",
    "<keyword3>",
    "<keyword4>",
    "<keyword5>"
  ],
  "jdMatchScore": <number 0-100 or null>,
  "matchedRequirements": [
    "<requirement 1>",
    "<requirement 2>"
  ],
  "possibleRequirements": [
    "<requirement 1>",
    "<requirement 2>"
  ],
  "missingRequirements": [
    "<requirement 1>",
    "<requirement 2>"
  ],
  "blockingRequirements": [
    "<critical or required requirement with missing evidence>"
  ],
  "candidateName": "<full name if present, otherwise empty string>",
  "alignment": {
    "matches": <true | false>,
    "confidence": <number 0.0-1.0>
  },
  "recommendedRoles": [
    "<role1>",
    "<role2>",
    "<role3>"
  ],
  "confidenceLevel": <number 0.0-1.0>,
  "recruiterApproval": <number 0-100>
}

========================================
JD ANALYSIS RULES
========================================

If deterministic JD requirements are provided:

- Calculate jdMatchScore from 0 to 100.
- Use deterministic retrieval statuses as the primary evidence.
- matchedRequirements may contain only strongly demonstrated requirements.
- possibleRequirements may contain only uncertain/partial matches.
- missingRequirements must contain only requirements with missing evidence.
- possible_match requirements must not be treated as certain.
- possible_match requirements belong in possibleRequirements, not missingRequirements.
- Do not invent requirements.
- Do not invent resume evidence.

If no JD requirements are provided:

- jdMatchScore = null
- matchedRequirements = []
- missingRequirements = []

========================================
GENERAL ANALYSIS RULES
========================================

Analyze ONLY information present in the resume.

Never invent:
- skills
- certifications
- experience
- projects
- technologies
- employers
- job titles
- achievements

Never assume experience from the target role.

Recommendations must be supported by resume evidence.

========================================
DATE RULES
========================================

Use Current Date when interpreting dates.

Treat:
- Present
- Current
- ongoing

as continuing through Current Date.

Calculate experience only from explicitly provided dates.

Do not assume missing dates.

Do not treat future dates as completed experience.

========================================
MISSING KEYWORDS
========================================

Maximum 5.

Only suggest keywords relevant to:
- target role
- the candidate's demonstrated domain and career direction

Do not include technologies already present in the resume.

Do not recommend unsupported technologies as if the candidate already knows them.

========================================
RECOMMENDED ROLES
========================================

Return exactly 3 realistic job titles.

They must match demonstrated experience.

Do not recommend unrelated roles.

========================================
SCORING
========================================

10.0 = Outstanding
9.0-9.9 = Excellent
8.0-8.9 = Strong
7.0-7.9 = Good
6.0-6.9 = Average
Below 6.0 = Needs significant improvement

Score based on:
- ATS compatibility
- recruiter appeal
- target-role relevance
- clarity
- measurable impact
- domain expertise and relevant capabilities
- structure
- demonstrated experience

========================================
IMPROVEMENTS
========================================

Focus on high-impact improvements.

Do not repeat strengths.

Do not recommend adding experience the candidate does not have.

Do not claim that the candidate should add a technology as existing experience.

========================================
ROLE ALIGNMENT
========================================

If a target role is provided:

Evaluate alignment using demonstrated skills, projects, and experience.

If no target role is provided:

alignment.matches = false
alignment.confidence = 0

========================================
FINAL OUTPUT
========================================

Return ONLY valid JSON.
`;

    const { result } =
      await generateWithModelFallback(
          prompt,
        );

    const parsed =
      parseJsonResponse(
        result.response.text(),
      );

    /*
     * Final defensive normalization.
     */

    const normalizedResult = {
      ...parsed,

      confidenceLevel:
        typeof parsed.confidenceLevel ===
        "number"
          ? Number(
              Math.min(
                1,
                Math.max(
                  0,
                  parsed.confidenceLevel,
                ),
              ).toFixed(2),
            )
          : Number(
              Math.min(
                1,
                Math.max(
                  0.3,
                  (Number(
                    parsed.score,
                  ) || 6) / 10,
                ),
              ).toFixed(2),
            ),

      recruiterApproval:
        typeof parsed.recruiterApproval ===
        "number"
          ? Math.round(
              Math.min(
                100,
                Math.max(
                  0,
                  parsed.recruiterApproval,
                ),
              ),
            )
          : Math.round(
              Math.min(
                98,
                Math.max(
                  25,
                  (Number(
                    parsed.score,
                  ) || 6) * 10,
                ),
              ),
            ),
    };

    /*
     * Defensive RAG correction.
     *
     * Even if the model accidentally violates the prompt,
     * deterministic statuses remain authoritative.
     */

    if (hasRagAnalysis) {
      const strongMatches =
        relevantJDChunks
          .filter(
            (item) =>
              item?.status ===
              "strong_match",
          )
          .map(
            (item) =>
              item.requirement,
          );

      const possibleMatches =
        relevantJDChunks
          .filter((item) => item?.status === "possible_match")
          .map((item) => item.requirement);

      const missing =
        relevantJDChunks
          .filter((item) => item?.status === "missing")
          .map((item) => item.requirement);

      normalizedResult.matchedRequirements = strongMatches;
      normalizedResult.possibleRequirements = possibleMatches;
      normalizedResult.missingRequirements = missing;

      const weightedTotal = relevantJDChunks.reduce(
        (total, item) => total + (Number(item?.weight) || 1),
        0,
      );

      const weightedEvidence = relevantJDChunks.reduce((total, item) => {
        const weight = Number(item?.weight) || 1;
        const value = item?.status === "strong_match" ? 1 : item?.status === "possible_match" ? 0.5 : 0;
        return total + weight * value;
      }, 0);

      normalizedResult.jdMatchScore = weightedTotal > 0
        ? Number(((weightedEvidence / weightedTotal) * 100).toFixed(1))
        : 0;

      normalizedResult.blockingRequirements = relevantJDChunks
        .filter((item) =>
          (item?.importance === "critical" || item?.importance === "required") &&
          item?.status === "missing"
        )
        .map((item) => item.requirement);
    } else {
      normalizedResult.jdMatchScore =
        null;

      normalizedResult.matchedRequirements =
        [];

      normalizedResult.missingRequirements =
        [];
    }

    return normalizedResult;
  } catch (err) {
    throw mapAiError(err);
  }
};

module.exports = {
  analyzeResume,
  buildRagContext,
};
