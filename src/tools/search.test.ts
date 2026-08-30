import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSearchTools } from "./search.js";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function harness(opts: { throwOn?: string } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const make =
    (method: string) =>
    async (...params: unknown[]) => {
      calls.push({ method, params });
      if (opts.throwOn === method) throw new Error("boom");
      return { ok: true };
    };
  const client = {
    listFiles: make("listFiles"),
    listSharedDrives: make("listSharedDrives"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerSearchTools(server as never, client as never);
  return { calls, tools };
}

test("registers the two search tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["list_shared_drives", "search_files"]);
});

test("search_files forwards every filter under normalized names", async () => {
  const { calls, tools } = harness();
  await tools.search_files({
    query: "starred = true",
    name_contains: "plan",
    full_text_contains: "budget",
    mime_type: "application/pdf",
    parent_id: "root",
    only_folders: true,
    include_trashed: true,
    order_by: "modifiedTime desc",
    page_size: 50,
    page_token: "tok",
    drive_id: "drv",
    include_all_drives: true,
  });
  assert.equal(calls[0].method, "listFiles");
  assert.deepEqual(calls[0].params[0], {
    query: "starred = true",
    nameContains: "plan",
    fullTextContains: "budget",
    mimeType: "application/pdf",
    parentId: "root",
    onlyFolders: true,
    includeTrashed: true,
    orderBy: "modifiedTime desc",
    pageSize: 50,
    pageToken: "tok",
    driveId: "drv",
    includeAllDrives: true,
  });
});

test("list_shared_drives forwards the name filter and pagination", async () => {
  const { calls, tools } = harness();
  await tools.list_shared_drives({ name_contains: "Ops", page_size: 5, page_token: "t" });
  assert.equal(calls[0].method, "listSharedDrives");
  assert.deepEqual(calls[0].params[0], { nameContains: "Ops", pageSize: 5, pageToken: "t" });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "listFiles" });
  const res = await tools.search_files({});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
