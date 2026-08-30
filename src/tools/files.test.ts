import { test } from "node:test";
import assert from "node:assert/strict";
import { registerFileTools } from "./files.js";

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
    getFile: make("getFile"),
    createFolder: make("createFolder"),
    copyFile: make("copyFile"),
    moveFile: make("moveFile"),
    updateFileMetadata: make("updateFileMetadata"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerFileTools(server as never, client as never);
  return { calls, tools };
}

test("registers the five file tools", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), [
    "copy_file",
    "create_folder",
    "get_file",
    "move_file",
    "update_file_metadata",
  ]);
});

test("get_file forwards the id and the optional fields projection", async () => {
  const { calls, tools } = harness();
  await tools.get_file({ file_id: "f1" });
  assert.deepEqual(calls[0], { method: "getFile", params: ["f1", undefined] });
  await tools.get_file({ file_id: "f1", fields: "id,name" });
  assert.deepEqual(calls[1], { method: "getFile", params: ["f1", "id,name"] });
});

test("create_folder and copy_file forward normalized params", async () => {
  const { calls, tools } = harness();
  await tools.create_folder({ name: "Reports", parent_id: "p1" });
  assert.deepEqual(calls[0].params[0], { name: "Reports", parentId: "p1" });
  await tools.copy_file({ file_id: "f1", name: "Copy", parent_id: "p2" });
  assert.deepEqual(calls[1].params[0], { fileId: "f1", name: "Copy", parentId: "p2" });
});

test("move_file forwards the destination and the keep flag", async () => {
  const { calls, tools } = harness();
  await tools.move_file({ file_id: "f1", new_parent_id: "p9", keep_existing_parents: true });
  assert.deepEqual(calls[0].params[0], { fileId: "f1", newParentId: "p9", keepExistingParents: true });
});

test("update_file_metadata forwards name/description/starred", async () => {
  const { calls, tools } = harness();
  await tools.update_file_metadata({ file_id: "f1", name: "New", description: "d", starred: false });
  assert.deepEqual(calls[0].params[0], { fileId: "f1", name: "New", description: "d", starred: false });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "copyFile" });
  const res = await tools.copy_file({ file_id: "f1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
