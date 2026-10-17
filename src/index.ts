import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

serveStdio(createServer, {
  onerror: (error) => console.error("Spotify MCP Server error:", error),
});

console.error("Spotify MCP Server running on stdio");
