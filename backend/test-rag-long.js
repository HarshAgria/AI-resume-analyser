require("dotenv").config();

const { v4: uuidv4 } = require("uuid");

const {
  embedJobDescription,
  retrieveRelevantRequirements,
  cleanupSession,
} = require("./src/services/embeddingService");

async function test() {
  const sessionId = uuidv4();

  console.log("🚀 Starting LONG RAG test...");
  console.log("Session:", sessionId);

  const jobDescription = `
We are looking for a Backend Developer with strong experience in Node.js,
Express, REST APIs, PostgreSQL, AWS, Docker, Kubernetes, microservices
architecture, CI/CD, scalable cloud infrastructure, authentication,
API security, automated testing, distributed systems, system architecture,
monitoring, logging, and production backend systems.

The candidate should be able to design and maintain scalable backend
services, work with cloud infrastructure, build reliable APIs, optimize
database performance, implement secure authentication and authorization,
and contribute to automated deployment pipelines.

Experience with Docker containers, Kubernetes orchestration, AWS services,
PostgreSQL databases, microservices architecture, CI/CD pipelines,
automated testing, and production monitoring is highly preferred.
`;

  const resumeText = `
Harsh Agria

Software Engineer with experience building production systems,
backend services, networking systems, and full-stack applications.

Professional Experience:

Software Engineer

Developed backend services using Node.js and Express.
Built REST APIs for production applications.
Worked with MongoDB and optimized database schemas and queries.
Implemented authentication and authorization mechanisms.
Worked on production telecom systems involving SIP, SRTP and DTLS.
Improved system setup time by 60 percent.
Improved incident resolution efficiency by 40 percent.

Developed full-stack applications and worked closely with frontend
and backend components.

Worked with Docker containers for local and production development.

Projects:

Built scalable backend applications using Node.js and Express.
Designed REST API services and integrated database systems.
Implemented automated testing for backend functionality.
Worked with cloud-hosted applications and production deployments.

Additional Experience:

Worked with AWS-based infrastructure and cloud services.
Worked with PostgreSQL databases and SQL queries.
Worked with distributed backend services and microservices concepts.
Worked with CI/CD pipelines for automated builds and deployments.
Worked with Kubernetes concepts including deployments and services.
Implemented monitoring, logging and production debugging.
Worked on system architecture and performance optimization.
`;

  try {
    console.log("\n📌 Embedding job description...");

    const jdResult = await embedJobDescription(
      jobDescription,
      sessionId
    );

    console.log("✅ JD embedded");
    console.log("Chunks:", jdResult.chunkCount);

    console.log("\n📌 Running full-resume retrieval...");

    const requirements = await retrieveRelevantRequirements(
      resumeText,
      sessionId,
      5
    );

    console.log("\n🔎 Retrieved requirements:");

    if (!requirements.length) {
      console.log("❌ No requirements retrieved.");
    } else {
      requirements.forEach((requirement, index) => {
        console.log(`\n${index + 1}. ${requirement}`);
      });
    }

    console.log("\n🎉 LONG RAG test successful!");
  } catch (error) {
    console.error("\n❌ LONG RAG test failed:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanupSession(sessionId);
      console.log("\n🧹 Test session cleaned up.");
    } catch (cleanupError) {
      console.error(
        "\n⚠️ Failed to clean up test session:",
        cleanupError.message
      );
    }
  }
}

test();
