import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guessMimeType, looksTextual, MAX_INLINE_BYTES, registerContentTools } from "./content.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

interface FakeBehaviour {
  meta?: Record<string, unknown>;
  downloadResult?: { buf: Buffer; contentType: string };
  exportResult?: { buf: Buffer; contentType: string };
}

function harness(behaviour: FakeBehaviour = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const client = {
    async getFile(...params: unknown[]) {
      calls.push({ method: "getFile", params });
      return behaviour.meta ?? { id: "f1", name: "a.txt", mimeType: "text/plain" };
    },
    async download(...params: unknown[]) {
      calls.push({ method: "download", params });
      return behaviour.downloadResult ?? { buf: Buffer.from("hello"), contentType: "text/plain" };
    },
    async exportFile(...params: unknown[]) {
      calls.push({ method: "exportFile", params });
      return behaviour.exportResult ?? { buf: Buffer.from("# md"), contentType: "text/markdown" };
    },
    async uploadFile(...params: unknown[]) {
      calls.push({ method: "uploadFile", params });
      return { id: "new-1" };
    },
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerContentTools(server as never, client as never);
  return { calls, tools };
}

const text = (res: { content: { text: string }[] }) => res.content[0].text;
const parsed = (res: { content: { text: string }[] }) => JSON.parse(text(res));

test("registers the three content tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["download_file", "export_file", "upload_file"]);
});

// ---- helpers ----

test("looksTextual accepts text-ish mimeTypes and rejects binaries", () => {
  for (const mime of ["text/plain", "text/markdown; charset=utf-8", "application/json", "image/svg+xml"]) {
    assert.equal(looksTextual(mime), true, mime);
  }
  for (const mime of ["application/pdf", "image/png", "application/octet-stream"]) {
    assert.equal(looksTextual(mime), false, mime);
  }
});

test("guessMimeType maps common extensions and falls back to octet-stream", () => {
  assert.equal(guessMimeType("/tmp/a.md"), "text/markdown");
  assert.equal(guessMimeType("/tmp/a.CSV"), "text/csv");
  assert.equal(guessMimeType("/tmp/a.unknown-ext"), "application/octet-stream");
});

// ---- upload_file ----

test("upload_file requires exactly one content source and a name on create", async () => {
  const { calls, tools } = harness();
  let res = await tools.upload_file({ name: "a.txt" });
  assert.equal(res.isError, true);
  assert.match(text(res), /exactly one of content/);
  res = await tools.upload_file({ name: "a.txt", content: "x", local_path: "/tmp/x" });
  assert.equal(res.isError, true);
  res = await tools.upload_file({ content: "x" });
  assert.equal(res.isError, true);
  assert.match(text(res), /name is required/);
  assert.equal(calls.length, 0, "validation failures must not reach the client");
});

test("upload_file sends inline content as UTF-8 text/plain by default", async () => {
  const { calls, tools } = harness();
  await tools.upload_file({ name: "a.txt", parent_id: "p1", content: "hi", convert_to: "document" });
  assert.equal(calls[0].method, "uploadFile");
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(p.fileId, undefined);
  assert.equal(p.name, "a.txt");
  assert.equal(p.parentId, "p1");
  assert.equal(p.mediaMimeType, "text/plain");
  assert.equal(p.convertTo, "document");
  assert.deepEqual(p.media, Buffer.from("hi"));
});

test("upload_file reads a local file and guesses the mimeType from its extension", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gdrive-tool-"));
  const path = join(dir, "notes.md");
  writeFileSync(path, "# notes");
  const { calls, tools } = harness();
  await tools.upload_file({ name: "notes.md", local_path: path });
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(p.mediaMimeType, "text/markdown");
  assert.deepEqual(p.media, Buffer.from("# notes"));
});

test("upload_file with file_id updates content in place", async () => {
  const { calls, tools } = harness();
  await tools.upload_file({ file_id: "f1", content: "v2", mime_type: "text/csv" });
  const p = calls[0].params[0] as Record<string, unknown>;
  assert.equal(p.fileId, "f1");
  assert.equal(p.mediaMimeType, "text/csv");
});

test("upload_file reports a missing local file as an actionable error", async () => {
  const { calls, tools } = harness();
  const res = await tools.upload_file({ name: "a", local_path: "/nonexistent/definitely/missing.bin" });
  assert.equal(res.isError, true);
  assert.match(text(res), /Local file not found/);
  assert.equal(calls.length, 0);
});

// ---- download_file ----

test("download_file returns small textual content inline", async () => {
  const { calls, tools } = harness();
  const res = await tools.download_file({ file_id: "f1" });
  assert.equal(res.isError, undefined);
  const out = parsed(res);
  assert.equal(out.content, "hello");
  assert.equal(out.name, "a.txt");
  assert.equal(out.bytes, 5);
  assert.equal(calls[0].method, "getFile");
  assert.deepEqual(calls[1], { method: "download", params: ["f1", { acknowledgeAbuse: undefined }] });
});

test("download_file rejects Google-native files and points to export_file", async () => {
  const { calls, tools } = harness({
    meta: { id: "d1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
  });
  const res = await tools.download_file({ file_id: "d1" });
  assert.equal(res.isError, true);
  assert.match(text(res), /export_file/);
  assert.equal(calls.filter((c) => c.method === "download").length, 0, "must not attempt the download");
});

test("download_file resolves shortcuts to their target instead of downloading", async () => {
  const { tools } = harness({
    meta: {
      id: "s1",
      name: "Link",
      mimeType: "application/vnd.google-apps.shortcut",
      shortcutDetails: { targetId: "real-1", targetMimeType: "application/pdf" },
    },
  });
  const res = await tools.download_file({ file_id: "s1" });
  assert.equal(res.isError, true);
  assert.match(text(res), /real-1/);
});

test("download_file refuses binary content inline but writes it with save_path", async () => {
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
  const behaviour = {
    meta: { id: "f1", name: "doc.pdf", mimeType: "application/pdf" },
    downloadResult: { buf: bytes, contentType: "application/pdf" },
  };
  let { tools } = harness(behaviour);
  const inline = await tools.download_file({ file_id: "f1" });
  assert.equal(inline.isError, true);
  assert.match(text(inline), /save_path/);

  ({ tools } = harness(behaviour));
  const dir = mkdtempSync(join(tmpdir(), "gdrive-tool-"));
  const path = join(dir, "out", "doc.pdf");
  const saved = await tools.download_file({ file_id: "f1", save_path: path });
  assert.equal(saved.isError, undefined);
  assert.equal(parsed(saved).saved_to, path);
  assert.deepEqual(readFileSync(path), bytes);
});

test("download_file refuses to overwrite unless asked", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gdrive-tool-"));
  const path = join(dir, "a.txt");
  writeFileSync(path, "old");
  const { tools } = harness();
  const res = await tools.download_file({ file_id: "f1", save_path: path });
  assert.equal(res.isError, true);
  assert.match(text(res), /overwrite=true/);
  assert.equal(readFileSync(path, "utf8"), "old", "the existing file must be untouched");

  const forced = await tools.download_file({ file_id: "f1", save_path: path, overwrite: true });
  assert.equal(forced.isError, undefined);
  assert.equal(readFileSync(path, "utf8"), "hello");
});

test("download_file rejects a relative save_path", async () => {
  const { tools } = harness();
  const res = await tools.download_file({ file_id: "f1", save_path: "relative/out.txt" });
  assert.equal(res.isError, true);
  assert.match(text(res), /absolute/);
});

test("download_file caps inline content at MAX_INLINE_BYTES", async () => {
  const { tools } = harness({
    downloadResult: { buf: Buffer.alloc(MAX_INLINE_BYTES + 1, 97), contentType: "text/plain" },
  });
  const res = await tools.download_file({ file_id: "f1" });
  assert.equal(res.isError, true);
  assert.match(text(res), /inline cap/);
});

// ---- export_file ----

test("export_file returns small textual exports inline", async () => {
  const { calls, tools } = harness();
  const res = await tools.export_file({ file_id: "d1", mime_type: "text/markdown" });
  assert.equal(res.isError, undefined);
  const out = parsed(res);
  assert.equal(out.content, "# md");
  assert.equal(out.export_mime_type, "text/markdown");
  assert.deepEqual(calls[0], { method: "exportFile", params: ["d1", "text/markdown"] });
});

test("export_file writes binary exports to save_path", async () => {
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
  const { tools } = harness({ exportResult: { buf: bytes, contentType: "application/pdf" } });
  const dir = mkdtempSync(join(tmpdir(), "gdrive-tool-"));
  const path = join(dir, "doc.pdf");
  const res = await tools.export_file({ file_id: "d1", mime_type: "application/pdf", save_path: path });
  assert.equal(res.isError, undefined);
  assert.deepEqual(readFileSync(path), bytes);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const tools: Record<string, Handler> = {};
  registerContentTools(
    {
      registerTool: (name: string, _cfg: unknown, handler: Handler) => {
        tools[name] = handler;
      },
    } as never,
    {
      async exportFile() {
        throw new Error("boom");
      },
    } as never,
  );
  const res = await tools.export_file({ file_id: "d1", mime_type: "text/plain" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
