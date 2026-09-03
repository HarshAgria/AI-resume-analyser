require("dotenv").config();

const { v4: uuidv4 } = require("uuid");

const {
  embedJobDescription,
  retrieveRelevantRequirements,
  cleanupSession,
} = require("./src/services/embeddingService");

async function test() {
  const sessionId = uuidv4();

  try {
    console.log("🚀 Starting RAG test...");
    console.log("Session:", sessionId);

    const jd = `
      We are looking for a Backend Developer.

      Required skills:
      AWS, Kubernetes, microservices architecture,
      scalable cloud infrastructure and CI/CD.

      The candidate should have strong experience
      building production backend systems.
      `;

    const resume = `
Software Engineer with 3 years of experience.

Node.js
Express
MongoDB
PostgreSQL
Docker

Built backend services and REST APIs.

Worked on authentication and API security.

${"Additional resume content. ".repeat(80)}

IMPORTANT SKILL:
AWS
Kubernetes
Microservices Architecture
Scalable Cloud Infrastructure
CI/CD
`;


    const result = await embedJobDescription(jd, sessionId);

    console.log("✅ JD embedded");
    console.log("Chunks:", result.chunkCount);

    const relevant = await retrieveRelevantRequirements(resume, sessionId, 5);

    console.log("\n🔎 Retrieved requirements:");

    relevant.forEach((chunk, index) => {
      console.log(`\n${index + 1}. ${chunk}`);
    });

    console.log("\n🎉 RAG test successful!");
  } catch (error) {
    console.error("\n❌ RAG test failed:");
    console.error(error);
  } finally {
    await cleanupSession(sessionId).catch((error) => {
      console.error("Cleanup failed:", error.message);
    });
  }
}

test();
