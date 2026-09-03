const { GoogleGenerativeAI } = require("@google/generative-ai");
const { AppError } = require("../utils/appError");
const { normalizeText } = require("../utils/textExtraction");

// Install this package: npm install @google/generative-ai

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const MAX_INPUT_CHARS = Number(process.env.MAX_AI_INPUT_CHARS || 22000);
const MAX_SECTION_CHARS = Number(process.env.MAX_AI_SECTION_CHARS || 9000);
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 30000);

const withTimeout = async (promise, timeoutMs) => {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
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
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const parseJsonResponse = (rawText) => {
  const cleanText = String(rawText || "")
    .replace(/```json|```/g, "")
    .trim();
  try {
    return JSON.parse(cleanText);
  } catch (err) {
    const m = cleanText.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new AppError(
      "AI_RESPONSE_INVALID",
      "The AI response format was invalid. Please retry.",
      502,
      err.message,
      true,
    );
  }
};

const splitIntoChunks = (text, chunkSize) => {
  if (text.length <= chunkSize) return [text];

  const parts = text.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    current = part.length > chunkSize ? part.slice(0, chunkSize) : part;
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 5);
};

const summarizeLongResume = async (model, text) => {
  const chunks = splitIntoChunks(text, MAX_SECTION_CHARS);
  if (chunks.length === 1 && text.length <= MAX_INPUT_CHARS) {
    return text;
  }

  const summaries = [];
  for (const [index, chunk] of chunks.entries()) {
    const chunkPrompt = `
You are preparing robust ATS analysis input.
Summarize this resume section into concise bullets that preserve facts.
Keep names, years, titles, tools, metrics, certifications, and domain context.
Do not invent details.

Section ${index + 1}/${chunks.length}:
${chunk}
`;
    const result = await withTimeout(
      model.generateContent(chunkPrompt),
      AI_TIMEOUT_MS,
    );
    summaries.push(result.response.text().trim());
  }

  return summaries.join("\n");
};

const mapAiError = (err) => {
  const message = String(err?.message || "").toLowerCase();
  if (err instanceof AppError) return err;

  if (
    message.includes("token") ||
    message.includes("context") ||
    message.includes("maximum input")
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
    message.includes("deadline") ||
    message.includes("timeout") ||
    message.includes("timed out")
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
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate")
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

const analyzeResume = async (
  resumeText,
  targetRole = "",
  relevantJDChunks = [],
) => {
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const normalized = normalizeText(resumeText);
  const compactText = normalized.slice(0, MAX_INPUT_CHARS * 2);
  const currentDate = new Date().toISOString().split("T")[0];

  const jdContext =
    relevantJDChunks.length > 0
      ? `
Retrieved Job Description Requirements:
${relevantJDChunks.map((chunk, index) => `${index + 1}. ${chunk}`).join("\n")}

Use these retrieved requirements to evaluate the candidate's
alignment with the job description.

Important:
- Only mark a requirement as matched when the resume provides evidence.
- Do not assume a skill simply because it is common for the role.
- Identify missing requirements only from the retrieved job requirements.
`
      : "";

  try {
    const preparedResume = await summarizeLongResume(model, compactText);

    const prompt = `
You are a senior recruiter and ATS optimization expert evaluating resumes for ANY profession, industry, and seniority.
Your analysis must be fair, objective, and role-aware when a target role is provided.

Analyze the resume content below and return ONLY a valid JSON object.
Do not include markdown, comments, or extra text.

Resume Text:
${preparedResume.slice(0, MAX_INPUT_CHARS)}

Target Role (may be empty):
${targetRole || "Not provided"}

Current Date:
${currentDate}

${jdContext}

JSON schema:
{
  "score": <number 1-10 with one decimal>,
  "atsRating": <"Excellent" | "Good" | "Fair" | "Poor">,
  "summary": "<2-3 sentence assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"],
  "missingKeywords": ["<keyword1>", "<keyword2>", "<keyword3>", "<keyword4>", "<keyword5>"],
  
  "jdMatchScore": <number 0-100 or null>,
  "matchedRequirements": ["<requirement 1>", "<requirement 2>"],
  "missingRequirements": ["<requirement 1>", "<requirement 2>"],

  "candidateName": "<full name if present, else empty string>",
  "alignment": { "matches": <true|false>, "confidence": <0.0-1.0> },
  "recommendedRoles": ["<role1>", "<role2>", "<role3>"],
  "confidenceLevel": <number 0.0-1.0>,
  "recruiterApproval": <number 0-100>
}

JD Analysis Rules:
- If Retrieved Job Description Requirements are provided:
  - Calculate jdMatchScore from 0 to 100.
  - matchedRequirements must contain requirements supported by resume evidence.
  - missingRequirements must contain relevant requirements not demonstrated by the resume.
  - Do not penalize the candidate for requirements that are not present in the retrieved context.
- If no Job Description Requirements are provided:
  - jdMatchScore must be null.
  - matchedRequirements must be [].
  - missingRequirements must be [].

Analysis Rules:
- Analyze ONLY information present in the resume.
- Never invent skills, certifications, experience, projects, or technologies.
- Every recommendation must be supported by resume evidence.
- Be objective and avoid assumptions.

Date Evaluation Rules:
- Use the provided Current Date when interpreting dates in the resume.
- Treat "Present", "Current", or ongoing employment as continuing through the Current Date.
- Calculate experience durations only from dates explicitly provided in the resume.
- Do not assume dates that are not stated.
- Do not treat future dates as completed experience.

Missing Keywords Rules:
- Suggest only keywords relevant to the target role or the candidate's primary profession.
- Do not include technologies already listed in the resume.
- Return a maximum of 5 keywords.
- Order keywords by importance.

Recommended Roles Rules:
- Return exactly 3 realistic industry job titles.
- Roles should match the candidate's demonstrated experience.
- Do not recommend unrelated roles.

Scoring Guidelines:
- 10.0 = Outstanding
- 9.0-9.9 = Excellent
- 8.0-8.9 = Strong
- 7.0-7.9 = Good
- 6.0-6.9 = Average
- Below 6.0 = Needs significant improvement
- The score should reflect ATS compatibility, recruiter appeal, relevance to the target role, clarity, measurable impact, and technical depth.

Improvement Rules:
- Focus on high-impact improvements.
- Do not repeat strengths.
- Do not recommend adding skills or experience that are unsupported by the resume.

Role Alignment Rules:
- If a target role is provided, evaluate alignment using the candidate's demonstrated skills, projects, and experience.
- If no target role is provided:
  - alignment.matches = false
  - alignment.confidence = 0

Output Rules:
- Return ONLY a valid JSON object.
- Do not include markdown, comments, or extra text.
- Ensure the JSON follows the provided schema.
`;

    const result = await withTimeout(
      model.generateContent(prompt),
      AI_TIMEOUT_MS,
    );
    const parsed = parseJsonResponse(result.response.text());

    return {
      ...parsed,
      confidenceLevel:
        typeof parsed.confidenceLevel === "number"
          ? parsed.confidenceLevel
          : Number(
              Math.min(1, Math.max(0.3, (parsed.score || 6) / 10)).toFixed(2),
            ),
      recruiterApproval:
        typeof parsed.recruiterApproval === "number"
          ? parsed.recruiterApproval
          : Math.round(Math.min(98, Math.max(25, (parsed.score || 6) * 10))),
    };
  } catch (err) {
    throw mapAiError(err);
  }
};

module.exports = { analyzeResume };
