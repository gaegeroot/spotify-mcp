# Spotify MCP

A Model Context Protocol (MCP) server that lets an MCP client search Spotify's
track catalog and access the connected user's recently played tracks.

## Requirements

- Node.js and npm
- A Spotify account
- A Spotify app created in the
  [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

In your Spotify app settings, add this exact Redirect URI:

```text
http://127.0.0.1:8080/callback
```

The server uses Spotify's client credentials flow to search the catalog, and
OAuth authorization with the `user-read-recently-played` permission to read
listening history.

## Setup

1. Install dependencies and compile the TypeScript source:

   ```sh
   npm ci
   npm run build
   ```

2. Provide your Spotify app's client ID and client secret to the MCP server as
   `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.

   This repository includes a VS Code MCP configuration at
   `.vscode/mcp.json`. When VS Code prompts for the server inputs, enter the
   client ID and secret from your Spotify app. The secret input is masked.

   For another MCP client, configure a stdio server that runs
   `node /absolute/path/to/spotify-mcp/build/index.js` and pass both variables
   in that server's environment. Do not commit credentials or put them in
   source files.

3. Start the `spotify-mcp` server from your MCP client. The first time you need
   listening history, call `spotify_connect` and open the returned URL in a
   browser. Once Spotify confirms the connection, return to your MCP client.

The refresh token is saved locally at
`~/.config/spotify-mcp/token.json` with restrictive file permissions. You
normally only need to connect once; use `spotify_connect` again if access
needs to be restored.

## Available tools

### `spotify_connect`

Starts Spotify account authorization and returns a URL to open in a browser.
The local callback listener uses `127.0.0.1:8080`.

### `search_tracks`

Searches Spotify's track catalog by track, artist, or album terms.

- `query` (string, required): Search terms.
- `limit` (integer, optional): Number of results, from 1 to 10; defaults to 5.

Requires both Spotify environment variables. Does not require connecting a
user account.

### `get_recently_played`

Returns recently played tracks for the connected Spotify account, including
artist, play time, and Spotify link.

- `limit` (integer, optional): Number of results, from 1 to 50; defaults to 20.
- `after` (integer, optional): Unix timestamp in milliseconds; return plays
  after this time.
- `before` (integer, optional): Unix timestamp in milliseconds; return plays
  before this time.

Specify at most one of `after` and `before`. This tool requires the user to
have completed `spotify_connect`.

## Development

The TypeScript source is in `src/`; `npm run build` emits runnable JavaScript
into `build/`. The server communicates over stdio, so start it through an MCP
client rather than as an interactive command-line application.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
