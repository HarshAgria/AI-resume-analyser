const fs = require("fs");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

const { extractResumeText } = require("../utils/textExtraction");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/mcp/server.js"],
  });

  const client = new Client(
    {
      name: "resume-analyzer-real-pdf-test",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  console.log("\n✅ Connected to MCP server");

  // --------------------------------------------------
  // 1. Discover MCP tools
  // --------------------------------------------------

  const tools = await client.listTools();

  console.log("\n🔧 Available MCP tools:");

  for (const tool of tools.tools) {
    console.log(`- ${tool.name}: ${tool.description}`);
  }

  // --------------------------------------------------
  // 2. Create isolated RAG session
  // --------------------------------------------------

  const sessionId = `mcp-pdf-test-${Date.now()}`;

  console.log(`\n🆔 Session: ${sessionId}`);

  try {
    // ------------------------------------------------
    // 3. Job Description
    // ------------------------------------------------

    const jobDescription = `
Requirements:
- Node.js experience with backend application development
- Express.js and REST API development
- PostgreSQL or another relational database
- AWS cloud deployment experience
- Docker and containerization
- Kubernetes knowledge
- Microservices architecture
- CI/CD pipeline experience
- Authentication and API security
- Automated backend testing
`;

    console.log("\n📌 Embedding JD through MCP...");

    const embedJDResult = await client.callTool({
      name: "embed_job_description",
      arguments: {
        jobDescription,
        sessionId,
      },
    });

    console.log("\n📦 JD embed result:");
    console.log(JSON.stringify(embedJDResult, null, 2));

    // ------------------------------------------------
    // 4. Read REAL PDF
    // ------------------------------------------------

    const pdfPath = "ALEX.pdf";

    console.log(`\n📄 Reading real resume: ${pdfPath}`);

    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Resume file not found: ${pdfPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);

    console.log(`PDF size: ${pdfBuffer.length} bytes`);

    // ------------------------------------------------
    // 5. Extract resume text
    // ------------------------------------------------

    console.log("\n📖 Extracting resume text...");

    const extracted = await extractResumeText(pdfBuffer);

    console.log("\n📊 Extraction result:");

    console.log({
      method: extracted.extraction.method,
      qualityScore: extracted.extraction.qualityScore,
      isScanned: extracted.extraction.isScanned,
      textLength: extracted.extraction.textLength,
    });

    if (!extracted.text) {
      throw new Error("Resume text extraction returned empty text.");
    }

    console.log("\n📝 Resume preview:");
    console.log(extracted.text.slice(0, 500));
    console.log("...");

    // ------------------------------------------------
    // 6. Embed resume through MCP
    // ------------------------------------------------

    console.log("\n📚 Embedding resume through MCP...");

    const embedResumeResult = await client.callTool({
      name: "embed_resume",
      arguments: {
        resumeText: extracted.text,
        sessionId,
      },
    });

    console.log("\n📦 Resume embed result:");
    console.log(JSON.stringify(embedResumeResult, null, 2));

    // ------------------------------------------------
    // 7. Retrieve resume evidence
    // ------------------------------------------------

    console.log("\n🔎 Retrieving resume evidence for JD requirements...");

    const evidenceResult = await client.callTool({
      name: "retrieve_resume_evidence",
      arguments: {
        sessionId,
        topK: 3,
      },
    });

    console.log("\n📦 Evidence result:");
    console.log(JSON.stringify(evidenceResult, null, 2));

    // ------------------------------------------------
    // 7b. Human-readable retrieval report
    // ------------------------------------------------

    console.log("\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("RAG REQUIREMENT EVIDENCE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (evidenceResult.isError) {
      console.log("❌ Evidence retrieval failed.");
      console.log(evidenceResult);
    } else {
      const evidenceData = JSON.parse(evidenceResult.content[0].text);

      for (const item of evidenceData.requirements) {
        console.log(`\nRequirement: ${item.requirement}`);
        console.log(`Status: ${item.status}`);

        if (!item.evidence.length) {
          console.log("Evidence: NONE");
          continue;
        }

        for (const evidence of item.evidence) {
          console.log(`Distance: ${evidence.distance.toFixed(3)}`);

          console.log(`Evidence: ${evidence.text.slice(0, 250)}...`);
        }
      }
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // ------------------------------------------------
    // 8. Cleanup
    // ------------------------------------------------

    console.log("\n🧹 Cleaning up RAG session...");

    const cleanupResult = await client.callTool({
      name: "cleanup_rag_session",
      arguments: {
        sessionId,
      },
    });

    console.log("\n📦 Cleanup result:");
    console.log(JSON.stringify(cleanupResult, null, 2));

    console.log("\n🎉 REQUIREMENT-CENTRIC MCP + RAG TEST COMPLETED!");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("\n❌ MCP test failed:");
  console.error(error);
  process.exit(1);
});
