import assert from "node:assert/strict";
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

const ALL_TOOLS = [
  "copy_file",
  "create_folder",
  "delete_file_forever",
  "download_file",
  "export_file",
  "get_file",
  "list_shared_drives",
  "manage_comments",
  "manage_permissions",
  "move_file",
  "raw_request",
  "search_files",
  "trash_file",
  "update_file_metadata",
  "upload_file",
];

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

  registerSearchTools(server, client);
  registerFileTools(server, client);
  registerContentTools(server, client);
  registerTrashTools(server, client);
  registerPermissionTools(server, client);
  registerCommentTools(server, client);
  registerRawTool(server, client);

  assert.deepEqual(names.sort(), ALL_TOOLS);
});

test("dist binary completes a real MCP handshake over stdio and lists every tool", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
    env: {
      ...process.env,
      GOOGLE_DRIVE_ACCESS_TOKEN: "test-token",
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
test("dist binary starts without credentials: handshake, tool list, actionable call error", async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("GOOGLE_DRIVE_"),
    ),
  );
  env.ASKADS_TELEMETRY = "0"; // keep the suite offline
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
    assert.match(instructions, /not connected/);
    assert.match(instructions, /GOOGLE_DRIVE_CLIENT_ID/);
    assert.match(instructions, /restart/);

    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ALL_TOOLS);

    // A tool call fails with the exact message instead of killing the server.
    const result = await client.callTool({ name: "get_file", arguments: { file_id: "smoke-file" } });
    assert.equal(result.isError, true);
    const text = result.content.map((c) => c.text ?? "").join(" ");
    assert.match(text, /Google OAuth credentials are required: set GOOGLE_DRIVE_CLIENT_ID/);
    assert.match(text, /restart the server/);
  } finally {
    await client.close();
  }
});
