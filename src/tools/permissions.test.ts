import { test } from "node:test";
import assert from "node:assert/strict";
import { registerPermissionTools } from "./permissions.js";

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
    listPermissions: make("listPermissions"),
    createPermission: make("createPermission"),
    updatePermission: make("updatePermission"),
    deletePermission: make("deletePermission"),
  };
  const tools: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _cfg: unknown, handler: Handler) => {
      tools[name] = handler;
    },
  };
  registerPermissionTools(server as never, client as never);
  return { calls, tools };
}

test("registers the one grouped permissions tool", () => {
  const { tools } = harness();
  assert.deepEqual(Object.keys(tools), ["manage_permissions"]);
});

test("action=list forwards the file id and page token", async () => {
  const { calls, tools } = harness();
  await tools.manage_permissions({ file_id: "f1", action: "list", page_token: "tok" });
  assert.deepEqual(calls[0], { method: "listPermissions", params: ["f1", "tok"] });
});

test("action=share forwards the full grant and validates per-type requirements", async () => {
  const { calls, tools } = harness();
  await tools.manage_permissions({
    file_id: "f1",
    action: "share",
    role: "writer",
    type: "user",
    email_address: "a@example.com",
    send_notification_email: false,
    email_message: "hi",
  });
  assert.equal(calls[0].method, "createPermission");
  assert.deepEqual(calls[0].params[0], {
    fileId: "f1",
    role: "writer",
    type: "user",
    emailAddress: "a@example.com",
    domain: undefined,
    allowFileDiscovery: undefined,
    sendNotificationEmail: false,
    emailMessage: "hi",
    transferOwnership: undefined,
  });

  let res = await tools.manage_permissions({ file_id: "f1", action: "share", role: "reader" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /requires role and type/);

  res = await tools.manage_permissions({ file_id: "f1", action: "share", role: "reader", type: "user" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /email_address/);

  res = await tools.manage_permissions({ file_id: "f1", action: "share", role: "reader", type: "domain" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /domain/);
  assert.equal(calls.length, 1, "invalid shares must not reach the client");
});

test("action=update and remove need permission_id", async () => {
  const { calls, tools } = harness();
  await tools.manage_permissions({
    file_id: "f1",
    action: "update",
    permission_id: "perm-1",
    role: "reader",
    expiration_time: "2026-12-31T00:00:00Z",
  });
  assert.deepEqual(calls[0].params[0], {
    fileId: "f1",
    permissionId: "perm-1",
    role: "reader",
    expirationTime: "2026-12-31T00:00:00Z",
  });

  await tools.manage_permissions({ file_id: "f1", action: "remove", permission_id: "perm-1" });
  assert.deepEqual(calls[1], { method: "deletePermission", params: ["f1", "perm-1"] });

  const res = await tools.manage_permissions({ file_id: "f1", action: "remove" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /permission_id/);
});

test("a client error is returned as an isError result, not thrown", async () => {
  const { tools } = harness({ throwOn: "listPermissions" });
  const res = await tools.manage_permissions({ file_id: "f1", action: "list" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});
