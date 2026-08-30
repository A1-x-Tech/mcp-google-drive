import { test } from "node:test";
import assert from "node:assert/strict";
import { registerCommentTools } from "./comments.js";

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
    listComments: make("listComments"),
    getComment: make("getComment"),
    createComment: make("createComment"),
    replyToComment: make("replyToComment"),
    deleteComment: make("deleteComment"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerCommentTools(server as never, client as never);
  return { calls, tools };
}

test("registers the one grouped comments tool", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["manage_comments"]);
});

test("action=list forwards pagination and include_deleted", async () => {
  const { calls, tools } = harness();
  await tools.manage_comments({ file_id: "f1", action: "list", page_size: 10, page_token: "t", include_deleted: true });
  assert.deepEqual(calls[0].params[0], { fileId: "f1", pageSize: 10, pageToken: "t", includeDeleted: true });
});

test("action=create needs content; quoted_text becomes quotedText", async () => {
  const { calls, tools } = harness();
  await tools.manage_comments({ file_id: "f1", action: "create", content: "Nice", quoted_text: "intro" });
  assert.deepEqual(calls[0].params[0], { fileId: "f1", content: "Nice", quotedText: "intro", anchor: undefined });

  const res = await tools.manage_comments({ file_id: "f1", action: "create" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /requires content/);
});

test("reply/resolve/reopen ride replyToComment with the right action", async () => {
  const { calls, tools } = harness();
  await tools.manage_comments({ file_id: "f1", action: "reply", comment_id: "c1", content: "Agreed" });
  assert.deepEqual(calls[0].params[0], { fileId: "f1", commentId: "c1", content: "Agreed" });

  await tools.manage_comments({ file_id: "f1", action: "resolve", comment_id: "c1" });
  assert.deepEqual(calls[1].params[0], { fileId: "f1", commentId: "c1", content: undefined, action: "resolve" });

  await tools.manage_comments({ file_id: "f1", action: "reopen", comment_id: "c1", content: "not done" });
  assert.deepEqual(calls[2].params[0], { fileId: "f1", commentId: "c1", content: "not done", action: "reopen" });

  const res = await tools.manage_comments({ file_id: "f1", action: "reply", comment_id: "c1" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /requires content/);
});

test("get and delete need comment_id", async () => {
  const { calls, tools } = harness();
  await tools.manage_comments({ file_id: "f1", action: "get", comment_id: "c1" });
  assert.deepEqual(calls[0], { method: "getComment", params: ["f1", "c1"] });

  await tools.manage_comments({ file_id: "f1", action: "delete", comment_id: "c1" });
  assert.deepEqual(calls[1], { method: "deleteComment", params: ["f1", "c1"] });

  const res = await tools.manage_comments({ file_id: "f1", action: "delete" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /comment_id/);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "listComments" });
  const res = await tools.manage_comments({ file_id: "f1", action: "list" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
