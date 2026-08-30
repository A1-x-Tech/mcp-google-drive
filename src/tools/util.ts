import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/**
 * Schema factories, not shared consts: reusing one zod object across two fields
 * makes zod-to-json-schema dedupe them into a `$ref`, which some tool-schema
 * consumers (OpenAI Apps review) don't dereference and flag as `any`. A fresh
 * object per field keeps each one inlined with its type + pattern.
 */
export const fileIdSchema = () =>
  z
    .string()
    .min(1)
    .describe(
      "The file id — the long id from the Drive URL (drive.google.com/file/d/<fileId> or docs.google.com/.../d/<fileId>/edit) or from search_files/get_file output. Folders and shared-drive items are files too.",
    );

/** A folder id: a folder is a file with the folder mimeType, addressed the same way. */
export const folderIdSchema = () =>
  z
    .string()
    .min(1)
    .describe("The folder id (folders are files; get it from search_files with only_folders, or from create_folder).");

/** An absolute local filesystem path — relative paths are rejected at the schema level. */
export const localPathSchema = () =>
  z
    .string()
    .min(1)
    .refine((p) => isAbsolute(p) && !p.includes("\0"), "Must be an absolute local path without NUL bytes");

/**
 * Normalizes and validates a local path: absolute, no NUL bytes, fully resolved
 * (so ../ segments cannot dodge a later check). The tool layer never touches
 * the filesystem through anything but this.
 */
export function safeLocalPath(p: string): string {
  if (!isAbsolute(p) || p.includes("\0")) {
    throw new Error(`Local paths must be absolute (got ${JSON.stringify(p.slice(0, 200))}).`);
  }
  return resolve(p);
}

/** Wraps a value as a compact-JSON tool result (compact: the consumer is an LLM). */
export function ok(data: unknown): CallToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return { content: [{ type: "text", text: text ?? "null" }] };
}

export function fail(err: unknown): CallToolResult {
  let message = err instanceof Error ? err.message : String(err);
  // Surface the underlying cause (e.g. the network error behind a timeout) — no
  // secrets live in cause, and it makes failures far easier to diagnose.
  if (err instanceof Error && err.cause instanceof Error) message += ` (${err.cause.message})`;
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

/**
 * MCP tool annotations — hints the consuming client can use to gate or label a
 * tool. All four hints are set explicitly on every tool: some clients (OpenAI
 * Apps review) require readOnlyHint, destructiveHint and openWorldHint on each.
 *
 * The Drive API mixes reads and writes, so each tool picks one of four presets:
 * READ_ONLY (pure reads), WRITE (creates new state; replaying duplicates it),
 * UPDATE (overwrites existing fields; replaying the same update converges) and
 * DESTRUCTIVE (removes existing state; replaying hits different targets).
 */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

export const UPDATE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;
