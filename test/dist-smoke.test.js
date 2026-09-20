import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { GoogleDriveClient } from "../dist/client.js";
import { registerSearchTools } from "../dist/tools/search.js";
import { registerFileTools } from "../dist/tools/files.js";
import { registerContentTools } from "../dist/tools/content.js";
import { registerTrashTools } from "../dist/tools/trash.js";
import { registerPermissionTools } from "../dist/tools/permissions.js";
import { registerCommentTools } from "../dist/tools/comments.js";
import { registerRawTool } from "../dist/tools/raw.js";
import { registerAuthTools } from "../dist/tools/auth.js";

/**
 * Sorted, because every assertion compares it against a sorted tool list. The
 * six onboarding tools come from @a1-x-tech/mcp-google-auth, so this list is
 * also the check that the component is wired into the published binary.
 */
const ALL_TOOLS = [
  "auth_status",
  "copy_file",
  "create_folder",
  "delete_file_forever",
  "download_file",
  "export_file",
  "finish_login",
  "get_file",
  "list_shared_drives",
  "logout",
  "manage_comments",
  "manage_permissions",
  "move_file",
  "raw_request",
  "search_files",
  "set_client",
  "setup_instructions",
  "start_login",
  "trash_file",
  "update_file_metadata",
  "upload_file",
];

/**
 * A throwaway $XDG_CONFIG_HOME for the spawned server. The auth component
 * re-reads $XDG_CONFIG_HOME/mcp-google-drive/credentials.json per call, so
 * without this a real login on the developer's machine would make the
 * "unconfigured" case pass for the wrong reason.
 */
function isolatedConfigDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-drive-dist-smoke-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}


test("dist client rejects foreign-origin paths before sending the Bearer token", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    const client = new GoogleDriveClient({
      accessToken: "SECRET",
      apiBase: "https://www.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await assert.rejects(() => client.request("GET", "https://example.invalid/steal"), /foreign origin/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("dist client sends the Bearer token and JSON bodies", async () => {
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) };
    return new Response('{"id":"folder-1"}', { status: 200 });
  };
  try {
    const client = new GoogleDriveClient({
      accessToken: "SECRET",
      apiBase: "https://www.googleapis.com",
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await client.createFolder({ name: "Smoke" });
    const url = new URL(seen.url);
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.pathname, "/drive/v3/files");
    assert.equal(seen.auth, "Bearer SECRET");
    assert.deepEqual(seen.body, { name: "Smoke", mimeType: "application/vnd.google-apps.folder" });
  } finally {
    globalThis.fetch = original;
  }
});

test("dist registers the expected tools", () => {
  const names = [];
  const server = {
    registerTool(name) {
      names.push(name);
    },
  };
  const client = {};

  registerAuthTools(server, client);
  registerSearchTools(server, client);
  registerFileTools(server, client);
  registerContentTools(server, client);
  registerTrashTools(server, client);
  registerPermissionTools(server, client);
  registerCommentTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), ALL_TOOLS);
});

test("dist binary completes a real MCP handshake over stdio and lists every tool", async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: {
      ...process.env,
      GOOGLE_DRIVE_ACCESS_TOKEN: "test-token",
      XDG_CONFIG_HOME: isolatedConfigDir(t),
      ASKADS_TELEMETRY: "0", // keep the suite offline
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const server = client.getServerVersion();
    assert.equal(server?.name, "mcp-google-drive");
    assert.match(String(server?.version), /^\d+\.\d+\.\d+$/);

    // The instructions the calling model reads before it picks any tool.
    const instructions = client.getInstructions();
    assert.equal(typeof instructions, "string");
    assert.ok(instructions.trim().length > 0, "initialize result carries no instructions");
    assert.match(instructions, /Google Drive API v3/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    const getFile = tools.find((t) => t.name === "get_file");
    assert.equal(getFile.annotations?.readOnlyHint, true);
    assert.ok(getFile.inputSchema?.properties?.file_id, "input schema must reach the client");

    const deleteForever = tools.find((t) => t.name === "delete_file_forever");
    assert.equal(deleteForever.annotations?.destructiveHint, true, "permanent deletion must be flagged");
  } finally {
    await client.close();
  }
});

/**
 * The degraded-start contract: without any credentials the binary must not
 * exit(1) before the handshake, leaving the client a dead server and no reason.
 * It must start, list every tool, open the instructions with the fix, and
 * answer a tool call with the actionable error — offline: the CredentialsError
 * fires before any fetch, so this test never touches the network.
 */
test("dist binary starts without credentials: handshake, tool list, actionable call error", async (t) => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GOOGLE_DRIVE_"),
    ),
  );
  env.ASKADS_TELEMETRY = "0"; // keep the suite offline
  env.XDG_CONFIG_HOME = isolatedConfigDir(t); // ignore any real login on this machine
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "dist-smoke-unconfigured", version: "0.0.0" });
  await client.connect(transport);
  try {
    // The model must read the fix before it picks a tool.
    const instructions = client.getInstructions() ?? "";
    assert.match(instructions, /NOT CONNECTED/);
    assert.match(instructions, /start_login/);
    assert.match(instructions, /GOOGLE_DRIVE_CLIENT_ID/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({ name: "get_file", arguments: { file_id: "smoke-file" } });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /not connected/i);
    assert.match(text, /start_login/);
    assert.match(text, /restart the server/);
  } finally {
    await client.close();
  }
});
