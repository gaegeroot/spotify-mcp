import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchTracks } from "../spotify/client.js";

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    "search_tracks",
    {
      description: "Search Spotify's catalog for tracks",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Track, artist, or album terms to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Maximum number of tracks to return (1-10)"),
      }),
    },
    async ({ query, limit }) => {
      try {
        const tracks = await searchTracks(query, limit);
        const text = tracks.length
          ? tracks
              .map((track, index) => {
                const artists = track.artists.map((artist) => artist.name).join(", ");
                return `${index + 1}. ${track.name} — ${artists} (${track.album.name})\n${track.external_urls.spotify}`;
              })
              .join("\n\n")
          : `No Spotify tracks found for "${query}".`;

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text:
                error instanceof Error ? error.message : "Spotify request failed.",
            },
          ],
          isError: true,
        };
      }
    },
  );
}