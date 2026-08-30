#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleDriveClient } from "./client.js";
import { ConfigError, DEFAULT_BASE, hasCredentials, loadConfig } from "./config.js";
import { instrumentToolCalls, Telemetry } from "./telemetry.js";
import type { GoogleDriveConfig } from "./types.js";
import { registerSearchTools } from "./tools/search.js";
import { registerFileTools } from "./tools/files.js";
import { registerContentTools } from "./tools/content.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerPermissionTools } from "./tools/permissions.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerRawTool } from "./tools/raw.js";

/**
 * Prose handed to the calling model in the `initialize` result — the only place
 * it learns what the tool list cannot say: which Google product this API is,
 * what the API refuses to do, and the behaviours that make a naive loop
 * expensive, lossy or duplicating.
 */
const INSTRUCTIONS =
  "Google Drive API v3 manages files, folders and sharing in Google Drive — it cannot edit inside " +
  "Docs/Sheets/Slides (no Docs/Sheets API here): it moves, shares, exports and converts those files as " +
  "opaque units. Everything is addressed by fileId, and names are NOT unique — search first, act on ids, " +
  "and never create a 'missing' folder or file without checking (create/copy/upload are duplicating writes, " +
  "and writes are never retried after a 5xx or timeout: verify with search_files/get_file before re-sending). " +
  "Folders are files (mimeType application/vnd.google-apps.folder). Google-native files have no bytes: " +
  "download_file rejects them — export_file converts (Docs even to text/markdown; 10 MB export cap), and " +
  "upload_file with convert_to imports the other way. Uploads cap at 5 MB per call (resumable sessions via " +
  "raw_request for more). Trash (trash_file) is reversible for ~30 days and is what users mean by 'delete'; " +
  "delete_file_forever bypasses the trash and cannot be undone — never confuse the two. search_files hides " +
  "trashed files and sees shared drives only with drive_id/include_all_drives. Sharing changes are live " +
  "immediately; between personal accounts role=owner only invites (pendingOwner) until accepted. If auth " +
  "suddenly breaks, the OAuth consent screen is usually still in Testing, where refresh tokens die after 7 days.";

/**
 * Prepended to INSTRUCTIONS when no credentials are configured. The model reads
 * this before it picks a tool, so an unconfigured session opens with the fix
 * rather than with a failed call. There is no in-chat login here: credentials
 * come only from the environment, so the fix is an operator action + restart.
 */
const UNCONFIGURED_PREFIX =
  "ATTENTION: Google Drive is not connected yet — no credentials are configured, so every " +
  "tool call will fail. The operator must set GOOGLE_DRIVE_CLIENT_ID + " +
  "GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN (recommended), or " +
  "GOOGLE_DRIVE_ACCESS_TOKEN with a short-lived access token, in the MCP client's " +
  "server config and restart this server — the variables are read only at startup. ";

/** Reads the package version so the server reports its real version to MCP clients. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Loads the config without dying on a bad value. A server that exits here never
 * completes the MCP handshake, so the user sees a dead server and no reason.
 * Instead the problem is carried into the session, where the model can read it
 * and relay it: the config degrades to "no credentials" and every tool call
 * fails with the actionable message.
 */
function loadConfigOrDegraded(telemetry: Telemetry): {
  config: GoogleDriveConfig;
  problem?: ConfigError;
} {
  try {
    return { config: loadConfig() };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(`Error: ${err.message}`);
    // Fire-and-forget now that the process survives: the historical
    // `startup_failed` funnel stays comparable, but nothing blocks startup.
    telemetry.send("startup_failed", { reason: err.reason });
    return {
      config: { apiBase: process.env.GOOGLE_DRIVE_API_BASE || DEFAULT_BASE },
      problem: err,
    };
  }
}

async function main(): Promise<void> {
  // Anonymous usage pings (ids/names/versions only, never data or arguments);
  // opt out with ASKADS_TELEMETRY=0. Built before the config so missing
  // credentials can be reported; wired to the server before tools register.
  const telemetry = new Telemetry(readVersion());
  const { config, problem } = loadConfigOrDegraded(telemetry);
  const client = new GoogleDriveClient(config);

  // Decided once, at startup: credentials come only from the environment, so
  // "restart after setting the variables" is the accurate advice to give.
  const connected = hasCredentials(config);

  const server = new McpServer(
    {
      name: "mcp-google-drive",
      version: readVersion(),
    },
    // Surfaces in the initialize result, before the client sees a single tool.
    {
      instructions: connected
        ? INSTRUCTIONS
        : UNCONFIGURED_PREFIX + (problem ? `Configuration problem: ${problem.message} ` : "") + INSTRUCTIONS,
    },
  );

  instrumentToolCalls(server, telemetry);
  server.server.oninitialized = () => {
    telemetry.setClientInfo(server.server.getClientVersion());
    // Split on purpose: `server_start` keeps meaning "a usable install started",
    // so the unconfigured case gets its own event instead of inflating that number.
    if (connected) telemetry.send("server_start");
    else telemetry.send("unconfigured_start", { reason: problem?.reason ?? "missing_credentials" });
  };

  registerSearchTools(server, client);
  registerFileTools(server, client);
  registerContentTools(server, client);
  registerTrashTools(server, client);
  registerPermissionTools(server, client);
  registerCommentTools(server, client);
  registerRawTool(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `mcp-google-drive running on stdio${connected ? "" : " (no credentials — set the environment variables and restart)"}`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting mcp-google-drive:", err);
  process.exit(1);
});
