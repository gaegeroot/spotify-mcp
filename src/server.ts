import { McpServer } from "@modelcontextprotocol/server";
import { registerConnectTool } from "./tools/connect.js";
import { registerHistoryTool } from "./tools/history.js";
import { registerSearchTool } from "./tools/search.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "spotify-mcp",
    version: "1.0.0",
  });

  registerConnectTool(server);
  registerHistoryTool(server);
  registerSearchTool(server);

  return server;
}