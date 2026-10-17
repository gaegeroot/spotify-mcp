import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createSpotifyAuthorizationUrl } from "../spotify/auth.js";

export function registerConnectTool(server: McpServer): void {
  server.registerTool(
    "spotify_connect",
    {
      description: "Connect your Spotify account to access your listening history",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const authorizationUrl = await createSpotifyAuthorizationUrl();
        return {
          content: [
            {
              type: "text",
              text: `Open this URL to authorize Spotify, then return here after the callback confirms the connection:\n${authorizationUrl}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : "Spotify authorization failed.",
            },
          ],
          isError: true,
        };
      }
    },
  );
}