require("dotenv").config({
  quiet: true,
});

const {
  McpServer,
} = require(
  "@modelcontextprotocol/sdk/server/mcp.js",
);

const {
  StdioServerTransport,
} = require(
  "@modelcontextprotocol/sdk/server/stdio.js",
);

const { z } = require("zod");

const {
  embedJobDescription,
  embedResume,
  retrieveResumeEvidence,
  cleanupSession,
} = require(
  "../services/embeddingService",
);

// ============================================================
// MCP Server
// ============================================================

const server =
  new McpServer({
    name: "resume-analyzer-rag",
    version: "3.0.0",
  });

// ============================================================
// Error serialization
// ============================================================

const serializeError = (
  error,
) => {
  return {
    error:
      error?.message ||
      "Unknown MCP tool error.",

    code:
      error?.code ||
      "MCP_TOOL_ERROR",
  };
};

// ============================================================
// Tool 1: Embed Job Description
// ============================================================

server.tool(
  "embed_job_description",

  "Extract individual job requirements and store their embeddings for deterministic resume evidence matching.",

  {
    jobDescription: z
      .string()
      .min(50)
      .describe(
        "Complete job description.",
      ),

    sessionId: z
      .string()
      .min(1)
      .describe(
        "Unique analysis session ID.",
      ),
  },

  async ({
    jobDescription,
    sessionId,
  }) => {
    try {
      const result =
        await embedJobDescription(
          jobDescription,
          sessionId,
        );

      return {
        content: [
          {
            type: "text",

            text: JSON.stringify(
              result,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,

        content: [
          {
            type: "text",

            text: JSON.stringify(
              serializeError(
                error,
              ),
            ),
          },
        ],
      };
    }
  },
);

// ============================================================
// Tool 2: Embed Resume
// ============================================================

server.tool(
  "embed_resume",

  "Normalize, split, embed, and store the complete resume as searchable evidence for the current RAG session.",

  {
    resumeText: z
      .string()
      .min(1)
      .describe(
        "Complete extracted resume text.",
      ),

    sessionId: z
      .string()
      .min(1)
      .describe(
        "Unique analysis session ID.",
      ),
  },

  async ({
    resumeText,
    sessionId,
  }) => {
    try {
      const result =
        await embedResume(
          resumeText,
          sessionId,
        );

      return {
        content: [
          {
            type: "text",

            text: JSON.stringify(
              result,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,

        content: [
          {
            type: "text",

            text: JSON.stringify(
              serializeError(
                error,
              ),
            ),
          },
        ],
      };
    }
  },
);

// ============================================================
// Tool 3: Retrieve Resume Evidence
// ============================================================

server.tool(
  "retrieve_resume_evidence",

  "Retrieve resume evidence for every stored JD requirement. Semantic retrieval is followed by deterministic technical-term validation. Missing requirements do not expose misleading semantic evidence.",

  {
    sessionId: z
      .string()
      .min(1)
      .describe(
        "Unique analysis session ID.",
      ),

    topK: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe(
        "Maximum validated evidence chunks returned per requirement.",
      ),
  },

  async ({
    sessionId,
    topK,
  }) => {
    try {
      const results =
        await retrieveResumeEvidence(
          sessionId,
          topK || 3,
        );

      const requirements =
        Array.isArray(
          results?.requirements,
        )
          ? results.requirements
          : [];

      return {
        content: [
          {
            type: "text",

            text: JSON.stringify({
              sessionId,

              count:
                requirements.length,

              requirements,
            }),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,

        content: [
          {
            type: "text",

            text: JSON.stringify(
              serializeError(
                error,
              ),
            ),
          },
        ],
      };
    }
  },
);

// ============================================================
// Tool 4: Cleanup
// ============================================================

server.tool(
  "cleanup_rag_session",

  "Delete all JD and resume vectors associated with an analysis session.",

  {
    sessionId: z
      .string()
      .min(1)
      .describe(
        "Analysis session ID to clean up.",
      ),
  },

  async ({
    sessionId,
  }) => {
    try {
      await cleanupSession(
        sessionId,
      );

      return {
        content: [
          {
            type: "text",

            text: JSON.stringify({
              sessionId,

              success: true,

              message:
                "RAG session cleaned up successfully.",
            }),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,

        content: [
          {
            type: "text",

            text: JSON.stringify(
              serializeError(
                error,
              ),
            ),
          },
        ],
      };
    }
  },
);

// ============================================================
// STDIO transport
// ============================================================

async function main() {
  const transport =
    new StdioServerTransport();

  await server.connect(
    transport,
  );
}

main().catch((error) => {
  console.error(
    "MCP server failed:",
    error,
  );

  process.exit(1);
});
