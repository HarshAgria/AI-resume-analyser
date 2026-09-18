const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { ChromaClient } = require("chromadb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { AppError } = require("../utils/appError");

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
// Technical terminology
// ==================================================

/*
 * Each group represents one canonical technical concept.
 *
 * aliases are lexical forms that should be treated as
 * equivalent for deterministic evidence validation.
 */

const TECHNICAL_TERM_GROUPS = [
  {
    canonical: "node.js",
    aliases: ["node.js", "nodejs"],
  },

  {
    canonical: "express.js",
    aliases: ["express.js", "expressjs"],
  },

  {
    canonical: "rest api",
    aliases: [
      "rest api",
      "rest apis",
      "restful api",
      "restful apis",
      "rest services",
      "rest endpoints",
    ],
  },

  {
    canonical: "postgresql",
    aliases: ["postgresql", "postgres"],
  },

  {
    canonical: "mysql",
    aliases: ["mysql"],
  },

  {
    canonical: "mariadb",
    aliases: ["mariadb"],
  },

  {
    canonical: "oracle",
    aliases: ["oracle database", "oracle db"],
  },

  {
    canonical: "sql server",
    aliases: ["sql server", "microsoft sql server", "mssql"],
  },

  {
    canonical: "mongodb",
    aliases: ["mongodb", "mongo db", "mongo"],
  },

  {
    canonical: "redis",
    aliases: ["redis"],
  },

  {
    canonical: "aws",
    aliases: ["aws", "amazon web services"],
  },

  {
    canonical: "azure",
    aliases: ["azure", "microsoft azure"],
  },

  {
    canonical: "gcp",
    aliases: ["gcp", "google cloud", "google cloud platform"],
  },

  {
    canonical: "docker",
    aliases: [
      "docker",
      "containerization",
      "containerized applications",
      "containerized application",
    ],
  },

  {
    canonical: "kubernetes",
    aliases: ["kubernetes", "k8s"],
  },

  {
    canonical: "microservices",
    aliases: [
      "microservices",
      "microservice",
      "microservices architecture",
      "microservice architecture",
    ],
  },

  {
    canonical: "jwt",
    aliases: ["jwt", "json web token", "json web tokens"],
  },

  {
    canonical: "oauth",
    aliases: ["oauth", "oauth2", "oauth 2.0"],
  },

  {
    canonical: "authentication",
    aliases: ["authentication", "authn"],
  },

  {
    canonical: "authorization",
    aliases: ["authorization", "authz"],
  },

  {
    canonical: "api security",
    aliases: ["api security", "secure api", "secure apis"],
  },

  {
    canonical: "jest",
    aliases: ["jest"],
  },

  {
    canonical: "mocha",
    aliases: ["mocha"],
  },

  {
    canonical: "vitest",
    aliases: ["vitest"],
  },

  {
    canonical: "cypress",
    aliases: ["cypress"],
  },

  {
    canonical: "playwright",
    aliases: ["playwright"],
  },

  {
    canonical: "automated testing",
    aliases: ["automated testing", "automated tests", "test automation"],
  },

  {
    canonical: "unit testing",
    aliases: ["unit testing", "unit tests", "unit test"],
  },

  {
    canonical: "integration testing",
    aliases: ["integration testing", "integration tests", "integration test"],
  },

  {
    canonical: "ci/cd",
    aliases: [
      "ci/cd",
      "ci cd",
      "continuous integration",
      "continuous delivery",
      "continuous deployment",
    ],
  },

  {
    canonical: "git",
    aliases: ["git", "github", "gitlab", "bitbucket"],
  },

  {
    canonical: "linux",
    aliases: ["linux"],
  },

  {
    canonical: "terraform",
    aliases: ["terraform"],
  },

  {
    canonical: "ansible",
    aliases: ["ansible"],
  },
];

// ==================================================
// Requirement rules
// ==================================================

/*
 * Rules describe HOW a requirement must be validated.
 *
 * mode:
 *
 *   "all" -> every concept must be present
 *   "any" -> at least one concept must be present
 *
 * This solves cases such as:
 *
 * PostgreSQL OR MySQL
 *
 * and:
 *
 * Authentication AND API security
 */

const REQUIREMENT_RULES = [
  {
    id: "node_backend",
    patterns: [
      /node(?:\.js|js)\b/i,
      /\bnode\s+backend\b/i,
      /\bbackend\s+application\s+development\b/i,
      /\bbackend\s+development\b/i,
    ],
    mode: "all",
    groups: ["node.js"],
  },

  {
    id: "express_rest",
    patterns: [
      /\bexpress(?:\.js|js)?\b/i,
      /\brest(?:ful)?\s+apis?\b/i,
      /\brest\s+services?\b/i,
      /\brest\s+endpoints?\b/i,
    ],
    mode: "all",
    groups: ["express.js", "rest api"],
  },

  {
    id: "relational_database",
    patterns: [
      /\bpostgres(?:ql)?\b/i,
      /\bmysql\b/i,
      /\bmariadb\b/i,
      /\boracle(?:\s+database|\s+db)?\b/i,
      /\bmssql\b/i,
      /\bsql\s+server\b/i,
      /\brelational\s+database\b/i,
    ],
    mode: "any",
    groups: ["postgresql", "mysql", "mariadb", "oracle", "sql server"],
  },

  {
    id: "aws",
    patterns: [/\baws\b/i, /\bamazon\s+web\s+services\b/i],
    mode: "all",
    groups: ["aws"],
  },

  {
    id: "docker",
    patterns: [
      /\bdocker\b/i,
      /\bcontainerization\b/i,
      /\bcontainerized\b/i,
      /\bcontainer-based\b/i,
    ],
    mode: "all",
    groups: ["docker"],
  },

  {
    id: "kubernetes",
    patterns: [/\bkubernetes\b/i, /\bk8s\b/i],
    mode: "all",
    groups: ["kubernetes"],
  },

  {
    id: "microservices",
    patterns: [/\bmicroservices?\b/i, /\bmicroservices?\s+architecture\b/i],
    mode: "all",
    groups: ["microservices"],
  },

  {
    id: "cicd",
    patterns: [
      /\bci\s*\/\s*cd\b/i,
      /\bcontinuous\s+integration\b/i,
      /\bcontinuous\s+delivery\b/i,
      /\bcontinuous\s+deployment\b/i,
    ],
    mode: "all",
    groups: ["ci/cd"],
  },

  {
    id: "authentication_api_security",
    patterns: [
      /\bauthentication\b/i,
      /\bauthn\b/i,
      /\bapi\s+security\b/i,
      /\bsecure\s+apis?\b/i,
      /\bapi\s+authentication\b/i,
      /\bapi\s+authorization\b/i,
    ],
    mode: "all",
    groups: ["authentication", "api security"],
  },

  {
    id: "automated_backend_testing",
    patterns: [
      /\bautomated\s+(?:backend\s+)?testing\b/i,
      /\bautomated\s+(?:backend\s+)?tests?\b/i,
      /\bbackend\s+testing\b/i,
      /\btest\s+automation\b/i,
      /\bunit\s+testing\b/i,
      /\bintegration\s+testing\b/i,
    ],
    mode: "any",
    groups: ["automated testing", "unit testing", "integration testing"],
  },
];

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
// Text normalization
// ==================================================

const cleanRequirement = (text) => {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[-•*]\s*/, "")
    .trim();
};

/*
 * Normalization used for deterministic lexical matching.
 *
 * We deliberately preserve characters important to technical
 * terminology:
 *
 *   .
 *   /
 *   +
 *   #
 *   -
 */

const normalizeText = (text) => {
  return String(text || "")
    .toLowerCase()
    .replace(/\r/g, "\n")
    .replace(/[()[\]{}:,;!?'"`|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/*
 * PDF extraction can occasionally produce:
 *
 *   Node . js
 *   Node .js
 *   CI / CD
 *   ALEXMORGAN
 *
 * We normalize technical separators here without aggressively
 * changing the original evidence stored in Chroma.
 */

const normalizeTechnicalText = (text) => {
  return normalizeText(text)
    .replace(/\bnode\s*\.\s*js\b/g, "node.js")
    .replace(/\bexpress\s*\.\s*js\b/g, "express.js")
    .replace(/\bci\s*\/\s*cd\b/g, "ci/cd")
    .replace(/\brest\s*-\s*api\b/g, "rest api")
    .replace(/\brestful\s+api\b/g, "rest api")
    .replace(/\bapi\s*-\s*security\b/g, "api security")
    .replace(/\bmicro\s*-\s*services\b/g, "microservices")
    .replace(/\bgoogle\s+cloud\s+platform\b/g, "gcp")
    .replace(/\bamazon\s+web\s+services\b/g, "aws")
    .replace(/\bk\s*8\s*s\b/g, "kubernetes")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeRequirementKey = (text) => {
  return normalizeText(text)
    .replace(/[^\w\s+#./-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeResumeText = (text) => {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// ==================================================
// Requirement helpers
// ==================================================

const deduplicateRequirements = (requirements) => {
  const seen = new Set();

  return requirements.filter((requirement) => {
    const key = normalizeRequirementKey(requirement);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

/*
 * Find a requirement rule.
 */

const getRequirementRule = (requirement) => {
  const normalized = normalizeTechnicalText(requirement);

  /*
   * Specific rules first.
   */

  for (const rule of REQUIREMENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule;
    }
  }

  return null;
};

/*
 * Generic technical group detection.
 *
 * This is used when a requirement does not match one of
 * the explicit higher-level rules.
 */

const getTechnicalGroupsForRequirement = (requirement) => {
  const normalizedRequirement = normalizeTechnicalText(requirement);

  return TECHNICAL_TERM_GROUPS.filter((group) =>
    group.aliases.some((alias) =>
      normalizedRequirement.includes(normalizeTechnicalText(alias)),
    ),
  );
};

/*
 * Determine whether an alias exists as an actual lexical
 * concept instead of using loose substring matching.
 */

const containsTechnicalAlias = (normalizedEvidence, alias) => {
  const normalizedAlias = normalizeTechnicalText(alias);

  if (!normalizedAlias) {
    return false;
  }

  /*
   * Multi-word terms can safely use includes.
   */

  if (
    normalizedAlias.includes(" ") ||
    normalizedAlias.includes("/") ||
    normalizedAlias.includes(".") ||
    normalizedAlias.includes("-")
  ) {
    return normalizedEvidence.includes(normalizedAlias);
  }

  /*
   * Single technical tokens need boundaries.
   */

  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");

  return regex.test(normalizedEvidence);
};

/*
 * Find whether a canonical technical group appears
 * explicitly in evidence.
 */

const evidenceContainsGroup = (group, normalizedEvidence) => {
  return group.aliases.some((alias) =>
    containsTechnicalAlias(normalizedEvidence, alias),
  );
};

/*
 * Deterministic validation.
 */

const validateTechnicalRequirement = (requirement, evidence) => {
  const normalizedEvidence = normalizeTechnicalText(
    evidence.map((item) => item.text || "").join(" "),
  );

  const rule = getRequirementRule(requirement);

  /*
   * Explicit rule.
   */

  if (rule) {
    const requiredTerms = rule.groups;

    const matchedTerms = rule.groups.filter((groupName) => {
      const group = TECHNICAL_TERM_GROUPS.find(
        (item) => item.canonical === groupName,
      );

      return group ? evidenceContainsGroup(group, normalizedEvidence) : false;
    });

    const missingTerms = requiredTerms.filter(
      (term) => !matchedTerms.includes(term),
    );

    const satisfied =
      rule.mode === "any" ? matchedTerms.length > 0 : missingTerms.length === 0;

    return {
      isTechnicalRequirement: true,
      mode: rule.mode,
      requiredTerms,
      matchedTerms,
      missingTerms,
      satisfied,
    };
  }

  /*
   * Generic technical rule.
   */

  const technicalGroups = getTechnicalGroupsForRequirement(requirement);

  if (!technicalGroups.length) {
    return {
      isTechnicalRequirement: false,
      mode: null,
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      satisfied: true,
    };
  }

  const requiredTerms = technicalGroups.map((group) => group.canonical);

  const matchedTerms = technicalGroups
    .filter((group) => evidenceContainsGroup(group, normalizedEvidence))
    .map((group) => group.canonical);

  const missingTerms = requiredTerms.filter(
    (term) => !matchedTerms.includes(term),
  );

  return {
    isTechnicalRequirement: true,
    mode: "all",
    requiredTerms,
    matchedTerms,
    missingTerms,
    satisfied: missingTerms.length === 0,
  };
};

// ==================================================
// Evidence status
// ==================================================

const getEvidenceStatus = (requirement, evidence) => {
  const bestDistance = evidence.length > 0 ? evidence[0].distance : null;

  /*
   * No semantic evidence.
   */

  if (!evidence.length) {
    return {
      status: "missing",
      evidenceReason: "No sufficiently relevant resume evidence was retrieved.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance: null,
    };
  }

  const technicalValidation = validateTechnicalRequirement(
    requirement,
    evidence,
  );

  /*
   * Technical requirement:
   *
   * Explicit evidence is mandatory.
   */

  if (technicalValidation.isTechnicalRequirement) {
    if (!technicalValidation.satisfied) {
      return {
        status: "missing",
        evidenceReason:
          technicalValidation.mode === "any"
            ? "Semantically related resume content was retrieved, but none of the accepted technical alternatives were explicitly demonstrated."
            : "Semantically related resume content was retrieved, but one or more required technical concepts were not explicitly demonstrated.",
        requiredTerms: technicalValidation.requiredTerms,
        matchedTerms: technicalValidation.matchedTerms,
        missingTerms: technicalValidation.missingTerms,
        bestDistance,
      };
    }

    /*
     * Technical concept was explicitly demonstrated.
     *
     * Deterministic technical validation takes priority over
     * the exact embedding distance. The embedding distance
     * is still retained as supporting metadata.
     */
    return {
      status: "strong_match",
      evidenceReason:
        "The required technical concepts were explicitly demonstrated in the retrieved resume evidence.",
      requiredTerms: technicalValidation.requiredTerms,
      matchedTerms: technicalValidation.matchedTerms,
      missingTerms: technicalValidation.missingTerms,
      bestDistance,
    };
  }

  /*
   * Generic requirement:
   *
   * semantic similarity is sufficient.
   */

  if (bestDistance !== null && bestDistance <= STRONG_MATCH_DISTANCE) {
    return {
      status: "strong_match",
      evidenceReason:
        "Strong semantic similarity was found between the requirement and resume evidence.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance,
    };
  }

  if (bestDistance !== null && bestDistance <= POSSIBLE_MATCH_DISTANCE) {
    return {
      status: "possible_match",
      evidenceReason:
        "Moderate semantic similarity was found between the requirement and resume evidence.",
      requiredTerms: [],
      matchedTerms: [],
      missingTerms: [],
      bestDistance,
    };
  }

  return {
    status: "missing",
    evidenceReason:
      "The retrieved evidence was not sufficiently similar to the requirement.",
    requiredTerms: [],
    matchedTerms: [],
    missingTerms: [],
    bestDistance,
  };
};


// ==================================================
// JD Requirement Extraction
// ==================================================

const extractRequirements = (jdText) => {
  if (!jdText || !jdText.trim()) {
    return [];
  }

  const normalized = jdText
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  const headingOnly = new Set([
    "requirements",
    "required",
    "qualifications",
    "required qualifications",
    "preferred qualifications",
    "responsibilities",
    "skills",
    "technical skills",
    "nice to have",
    "preferred",
    "must have",
    "what you'll do",
    "what you will do",
    "about the role",
    "about us",
    "job description",
  ]);

  // --------------------------------------------------
  // 1. First try normal line-based extraction
  // --------------------------------------------------

  const lines = normalized
    .split(/\n+/)
    .map(cleanRequirement)
    .filter(Boolean);

  const lineRequirements = lines.filter((line) => {
    if (line.length < 8 || line.length > 500) {
      return false;
    }

    const normalizedLine = line
      .toLowerCase()
      .replace(/[:\-]+$/, "")
      .trim();

    return !headingOnly.has(normalizedLine);
  });

  /*
   * If the JD contains multiple actual lines/bullets,
   * use those as requirements.
   */
  if (lineRequirements.length >= 2) {
    return deduplicateRequirements(lineRequirements);
  }

  // --------------------------------------------------
  // 2. Technical requirement extraction
  // --------------------------------------------------
  //
  // Handles one-line JDs such as:
  //
  // "Experience with Node.js, Express.js, REST APIs,
  // PostgreSQL, AWS, Docker, Kubernetes..."
  //
  // Instead of treating the entire sentence as one
  // requirement, extract the individual concepts.
  // --------------------------------------------------

  const technicalRequirements = [
    {
      requirement: "Node.js",
      patterns: [/\bnode(?:\.js|js)\b/i],
    },

    {
      requirement: "Express.js",
      patterns: [/\bexpress(?:\.js|js)?\b/i],
    },

    {
      requirement: "REST APIs",
      patterns: [
        /\brest\s+apis?\b/i,
        /\brestful\s+apis?\b/i,
        /\brest\s+services?\b/i,
        /\brest\s+endpoints?\b/i,
      ],
    },

    {
      requirement: "PostgreSQL",
      patterns: [/\bpostgres(?:ql)?\b/i],
    },

    {
      requirement: "MySQL",
      patterns: [/\bmysql\b/i],
    },

    {
      requirement: "MariaDB",
      patterns: [/\bmariadb\b/i],
    },

    {
      requirement: "Oracle",
      patterns: [/\boracle(?:\s+database|\s+db)?\b/i],
    },

    {
      requirement: "SQL Server",
      patterns: [
        /\bsql\s+server\b/i,
        /\bmssql\b/i,
      ],
    },

    {
      requirement: "MongoDB",
      patterns: [
        /\bmongodb\b/i,
        /\bmongo\s+db\b/i,
      ],
    },

    {
      requirement: "Redis",
      patterns: [/\bredis\b/i],
    },

    {
      requirement: "AWS",
      patterns: [
        /\baws\b/i,
        /\bamazon\s+web\s+services\b/i,
      ],
    },

    {
      requirement: "Azure",
      patterns: [
        /\bazure\b/i,
        /\bmicrosoft\s+azure\b/i,
      ],
    },

    {
      requirement: "GCP",
      patterns: [
        /\bgcp\b/i,
        /\bgoogle\s+cloud\b/i,
        /\bgoogle\s+cloud\s+platform\b/i,
      ],
    },

    {
      requirement: "Docker",
      patterns: [
        /\bdocker\b/i,
        /\bcontainerization\b/i,
        /\bcontainerized\b/i,
      ],
    },

    {
      requirement: "Kubernetes",
      patterns: [
        /\bkubernetes\b/i,
        /\bk8s\b/i,
      ],
    },

    {
      requirement: "Microservices",
      patterns: [
        /\bmicroservices?\b/i,
        /\bmicroservices?\s+architecture\b/i,
      ],
    },

    {
      requirement: "CI/CD",
      patterns: [
        /\bci\s*\/\s*cd\b/i,
        /\bcontinuous\s+integration\b/i,
        /\bcontinuous\s+delivery\b/i,
        /\bcontinuous\s+deployment\b/i,
      ],
    },

    {
      requirement: "Authentication",
      patterns: [
        /\bauthentication\b/i,
        /\bauthn\b/i,
      ],
    },

    {
      requirement: "API Security",
      patterns: [
        /\bapi\s+security\b/i,
        /\bsecure\s+apis?\b/i,
      ],
    },

    {
      requirement: "Automated Backend Testing",
      patterns: [
        /\bautomated\s+(?:backend\s+)?testing\b/i,
        /\bautomated\s+(?:backend\s+)?tests?\b/i,
        /\bbackend\s+testing\b/i,
        /\btest\s+automation\b/i,
      ],
    },

    {
      requirement: "Unit Testing",
      patterns: [
        /\bunit\s+testing\b/i,
        /\bunit\s+tests?\b/i,
      ],
    },

    {
      requirement: "Integration Testing",
      patterns: [
        /\bintegration\s+testing\b/i,
        /\bintegration\s+tests?\b/i,
      ],
    },

    {
      requirement: "Git",
      patterns: [
        /\bgit\b/i,
        /\bgithub\b/i,
        /\bgitlab\b/i,
        /\bbitbucket\b/i,
      ],
    },

    {
      requirement: "Linux",
      patterns: [
        /\blinux\b/i,
      ],
    },

    {
      requirement: "Terraform",
      patterns: [
        /\bterraform\b/i,
      ],
    },

    {
      requirement: "Ansible",
      patterns: [
        /\bansible\b/i,
      ],
    },
  ];

  const extractedTechnicalRequirements = [];

  for (const item of technicalRequirements) {
    const matched = item.patterns.some((pattern) =>
      pattern.test(normalized),
    );

    if (matched) {
      extractedTechnicalRequirements.push(item.requirement);
    }
  }

  // --------------------------------------------------
  // 3. Add important compound requirements
  // --------------------------------------------------

  const hasAuthentication = extractedTechnicalRequirements.includes(
    "Authentication",
  );

  const hasApiSecurity = extractedTechnicalRequirements.includes(
    "API Security",
  );

  if (hasAuthentication && hasApiSecurity) {
    extractedTechnicalRequirements.push(
      "Authentication and API Security",
    );
  }

  // --------------------------------------------------
  // 4. Return technical requirements if found
  // --------------------------------------------------

  if (extractedTechnicalRequirements.length > 0) {
    return deduplicateRequirements(
      extractedTechnicalRequirements,
    );
  }

  // --------------------------------------------------
  // 5. Fallback: sentence-based extraction
  // --------------------------------------------------

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map(cleanRequirement)
    .filter((sentence) => {
      if (sentence.length < 8 || sentence.length > 500) {
        return false;
      }

      const normalizedSentence = sentence
        .toLowerCase()
        .replace(/[.:,\-]+$/, "")
        .trim();

      return !headingOnly.has(normalizedSentence);
    });

  return deduplicateRequirements(sentences);
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

  const requirements = extractRequirements(jdText);

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

  const vectors = await embeddings.embedDocuments(requirements);

  const ids = requirements.map(
    (_, index) => `jd_requirement_${sessionId}_${index}`,
  );

  await collection.add({
    ids,
    embeddings: vectors,
    documents: requirements,

    metadatas: requirements.map((_, index) => ({
      sessionId,
      type: "jd_requirement",
      requirementIndex: index,
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

      const evaluation = getEvidenceStatus(requirement, evidence);

      return {
        requirement,

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
