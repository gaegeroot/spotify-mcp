import {
  getSpotifyCatalogAccessToken,
  getSpotifyUserAccessToken,
} from "./auth.js";

export interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string };
  external_urls: { spotify: string };
}

export interface SpotifyRecentPlayedResponse {
  cursors?: { after?: string | null; before?: string | null };
  items: {
    played_at: string;
    track: SpotifyTrack;
  }[];
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrack[];
  };
}

export async function getRecentlyPlayed(options: {
  limit: number;
  after?: number;
  before?: number;
}): Promise<SpotifyRecentPlayedResponse> {
  const accessToken = await getSpotifyUserAccessToken();
  const recentUrl = new URL(
    "https://api.spotify.com/v1/me/player/recently-played",
  );
  recentUrl.searchParams.set("limit", String(options.limit));
  if (options.after !== undefined) {
    recentUrl.searchParams.set("after", String(options.after));
  }
  if (options.before !== undefined) {
    recentUrl.searchParams.set("before", String(options.before));
  }

  const response = await fetch(recentUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `Spotify listening history request failed (${response.status}). Confirm the account granted user-read-recently-played.`,
    );
  }

  return (await response.json()) as SpotifyRecentPlayedResponse;
}

export async function searchTracks(
  query: string,
  limit: number,
): Promise<SpotifyTrack[]> {
  const accessToken = await getSpotifyCatalogAccessToken();
  const searchUrl = new URL("https://api.spotify.com/v1/search");
  searchUrl.search = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
  }).toString();

  const response = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify search failed (${response.status}).`);
  }

  const searchData = (await response.json()) as SpotifySearchResponse;
  return searchData.tracks?.items ?? [];
}