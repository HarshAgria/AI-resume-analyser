const path = require("path");

const {
  Client,
} = require("@modelcontextprotocol/sdk/client/index.js");

const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

class MCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected && this.client) {
      return this.client;
    }

    this.transport = new StdioClientTransport({
      command: "node",
      args: [
        path.join(__dirname, "server.js"),
      ],
    });

    this.client = new Client(
      {
        name: "resume-analyzer-api",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(
      this.transport
    );

    this.connected = true;

    return this.client;
  }

  async callTool(
    name,
    arguments_ = {}
  ) {
    if (!this.client || !this.connected) {
      throw new Error(
        "MCP client is not connected."
      );
    }

    return this.client.callTool({
      name,
      arguments: arguments_,
    });
  }

  async disconnect() {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
    } catch (error) {
      console.error(
        "MCP disconnect failed:",
        error.message
      );
    } finally {
      this.client = null;
      this.transport = null;
      this.connected = false;
    }
  }
}

function createMCPClient() {
  return new MCPClient();
}

module.exports = {
  MCPClient,
  createMCPClient,
};
