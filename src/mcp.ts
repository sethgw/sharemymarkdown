import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAppMcpServer, createLocalMcpBackend } from "@/mcp/server";

const main = async () => {
  const transport = new StdioServerTransport();
  const mcpServer = createAppMcpServer(createLocalMcpBackend);
  await mcpServer.connect(transport);
};

await main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
