import { test } from "node:test";
import assert from "node:assert/strict";
import { registerTrashTools } from "./trash.js";

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
    setTrashed: make("setTrashed"),
    deleteForever: make("deleteForever"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerTrashTools(server as never, client as never);
  return { calls, tools };
}

test("registers the two trash tools — trash and permanent delete stay separate", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools).sort(), ["delete_file_forever", "trash_file"]);
});

test("trash_file maps trash/restore onto setTrashed", async () => {
  const { calls, tools } = harness();
  await tools.trash_file({ file_id: "f1", action: "trash" });
  assert.deepEqual(calls[0], { method: "setTrashed", params: ["f1", true] });
  await tools.trash_file({ file_id: "f1", action: "restore" });
  assert.deepEqual(calls[1], { method: "setTrashed", params: ["f1", false] });
});

test("trash_file never calls deleteForever — only the explicit tool does", async () => {
  const { calls, tools } = harness();
  await tools.trash_file({ file_id: "f1", action: "trash" });
  assert.equal(calls.filter((c) => c.method === "deleteForever").length, 0);

  await tools.delete_file_forever({ file_id: "f1" });
  assert.deepEqual(calls.at(-1), { method: "deleteForever", params: ["f1"] });
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "deleteForever" });
  const res = await tools.delete_file_forever({ file_id: "f1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
