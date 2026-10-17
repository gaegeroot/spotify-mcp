import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getRecentlyPlayed } from "../spotify/client.js";

export function registerHistoryTool(server: McpServer): void {
  server.registerTool(
    "get_recently_played",
    {
      description: "Get tracks from your Spotify listening history",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        after: z
          .number()
          .int()
          .optional()
          .describe("Return plays after this Unix timestamp in milliseconds"),
        before: z
          .number()
          .int()
          .optional()
          .describe("Return plays before this Unix timestamp in milliseconds"),
      }).refine(
        ({ after, before }) => after === undefined || before === undefined,
        { message: "Specify either after or before, not both." },
      ),
    },
    async ({ limit, after, before }) => {
      try {
        const history = await getRecentlyPlayed({ limit, after, before });
        const text = history.items.length
          ? history.items
              .map((item, index) => {
                const artists = item.track.artists
                  .map((artist) => artist.name)
                  .join(", ");
                return `${index + 1}. ${item.track.name} — ${artists} (${item.played_at})\n${item.track.external_urls.spotify}`;
              })
              .join("\n\n")
          : "No recently played tracks found.";
        const cursors = history.cursors;
        const cursorText = [
          cursors?.before ? `Before cursor: ${cursors.before}` : undefined,
          cursors?.after ? `After cursor: ${cursors.after}` : undefined,
        ]
          .filter(Boolean)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: cursorText ? `${text}\n\n${cursorText}` : text,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : "Spotify listening history request failed.",
            },
          ],
          isError: true,
        };
      }
    },
  );
}