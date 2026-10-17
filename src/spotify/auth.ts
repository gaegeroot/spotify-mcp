import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8080/callback";
const SPOTIFY_TOKEN_PATH = join(
  homedir(),
  ".config",
  "spotify-mcp",
  "token.json",
);

let callbackServer: Server | undefined;
let pendingAuthorization:
  | { codeVerifier: string; state: string }
  | undefined;
let userRefreshToken: string | undefined;
let userAccessToken: string | undefined;
let userAccessTokenExpiresAt = 0;

function getSpotifyClientId(): string {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error("Set SPOTIFY_CLIENT_ID in the MCP server environment.");
  }
  return clientId;
}

async function readSpotifyRefreshToken(): Promise<string | undefined> {
  try {
    const savedToken = JSON.parse(await readFile(SPOTIFY_TOKEN_PATH, "utf8")) as {
      refresh_token?: unknown;
    };
    if (typeof savedToken.refresh_token !== "string") {
      throw new Error("The saved Spotify token file is invalid. Connect again.");
    }
    return savedToken.refresh_token;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function saveSpotifyRefreshToken(refreshToken: string): Promise<void> {
  await mkdir(dirname(SPOTIFY_TOKEN_PATH), { recursive: true, mode: 0o700 });
  await writeFile(
    SPOTIFY_TOKEN_PATH,
    JSON.stringify({ refresh_token: refreshToken }),
    { mode: 0o600 },
  );
  await chmod(SPOTIFY_TOKEN_PATH, 0o600);
  userRefreshToken = refreshToken;
}

async function handleSpotifyCallback(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const callbackUrl = new URL(request.url ?? "/", SPOTIFY_REDIRECT_URI);
  if (request.method !== "GET" || callbackUrl.pathname !== "/callback") {
    response.writeHead(404).end("Not found");
    return;
  }

  const authorization = pendingAuthorization;
  const returnedState = callbackUrl.searchParams.get("state");
  if (!authorization || returnedState !== authorization.state) {
    response.writeHead(400).end("Spotify sign-in state did not match. Try again.");
    return;
  }

  pendingAuthorization = undefined;
  const authorizationError = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  if (authorizationError || !code) {
    response.writeHead(400).end("Spotify sign-in was not completed. You can close this page.");
    return;
  }

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getSpotifyClientId(),
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_verifier: authorization.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    response.writeHead(502).end("Spotify token exchange failed. Check the MCP server log.");
    throw new Error(`Spotify token exchange failed (${tokenResponse.status}).`);
  }

  const tokenData = (await tokenResponse.json()) as SpotifyTokenResponse;
  if (!tokenData.access_token || !tokenData.refresh_token) {
    response.writeHead(502).end("Spotify did not return the expected tokens.");
    throw new Error("Spotify token response did not include an access and refresh token.");
  }

  await saveSpotifyRefreshToken(tokenData.refresh_token);
  userAccessToken = tokenData.access_token;
  userAccessTokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Spotify is connected. You can close this page and return to your MCP client.");
}

async function ensureSpotifyCallbackServer(): Promise<void> {
  if (callbackServer?.listening) {
    return;
  }

  const server = createHttpServer((request, response) => {
    void handleSpotifyCallback(request, response).catch((error: unknown) => {
      console.error(
        "Spotify OAuth callback error:",
        error instanceof Error ? error.message : "Unknown error",
      );
      if (!response.headersSent) {
        response.writeHead(500).end("Spotify sign-in failed. Check the MCP server log.");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(8080, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  }).catch((error: unknown) => {
    server.close();
    throw new Error(
      `Could not start the Spotify callback listener on 127.0.0.1:8080: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  });

  callbackServer = server;
}

export async function createSpotifyAuthorizationUrl(): Promise<string> {
  const clientId = getSpotifyClientId();
  await ensureSpotifyCallbackServer();
  const codeVerifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("hex");
  pendingAuthorization = { codeVerifier, state };

  const authorizationUrl = new URL("https://accounts.spotify.com/authorize");
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: "user-read-recently-played",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    state,
  }).toString();
  return authorizationUrl.toString();
}

export async function getSpotifyUserAccessToken(): Promise<string> {
  if (userAccessToken && userAccessTokenExpiresAt > Date.now() + 60_000) {
    return userAccessToken;
  }

  userRefreshToken ??= await readSpotifyRefreshToken();
  if (!userRefreshToken) {
    throw new Error("Spotify is not connected. Call spotify_connect first.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getSpotifyClientId(),
      grant_type: "refresh_token",
      refresh_token: userRefreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Spotify token refresh failed (${response.status}). Call spotify_connect to reconnect.`,
    );
  }

  const tokenData = (await response.json()) as SpotifyTokenResponse;
  if (!tokenData.access_token) {
    throw new Error("Spotify did not return an access token.");
  }
  if (tokenData.refresh_token) {
    await saveSpotifyRefreshToken(tokenData.refresh_token);
  }
  userAccessToken = tokenData.access_token;
  userAccessTokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  return userAccessToken;
}

export async function getSpotifyCatalogAccessToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the MCP server environment.",
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status}).`);
  }

  const tokenData = (await response.json()) as SpotifyTokenResponse;
  return tokenData.access_token;
}