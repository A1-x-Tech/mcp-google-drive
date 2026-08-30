import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESTRUCTIVE,
  fail,
  fileIdSchema,
  folderIdSchema,
  localPathSchema,
  ok,
  READ_ONLY,
  safeLocalPath,
  UPDATE,
  WRITE,
} from "./util.js";

test("localPathSchema accepts absolute paths and rejects relative ones", () => {
  const s = localPathSchema(); // factory → fresh schema
  assert.equal(s.safeParse("/tmp/report.pdf").success, true);
  assert.equal(s.safeParse("report.pdf").success, false);
  assert.equal(s.safeParse("../escape.txt").success, false);
  assert.equal(s.safeParse("/tmp/\0hidden").success, false);
});

test("safeLocalPath resolves .. segments and rejects relative paths", () => {
  assert.equal(safeLocalPath("/tmp/a/../b.txt"), "/tmp/b.txt");
  assert.throws(() => safeLocalPath("relative/path"), /must be absolute/);
  assert.throws(() => safeLocalPath("/tmp/\0"), /must be absolute/);
});

test("schema factories return independent schemas (no $ref dedup)", () => {
  assert.notEqual(fileIdSchema(), fileIdSchema());
  assert.notEqual(folderIdSchema(), folderIdSchema());
  assert.notEqual(localPathSchema(), localPathSchema());
});

test("ok emits compact JSON; fail flags isError", () => {
  assert.equal((ok({ a: 1 }).content[0] as { text: string }).text, '{"a":1}');
  const f = fail(new Error("boom"));
  assert.equal(f.isError, true);
  assert.match((f.content[0] as { text: string }).text, /boom/);
});

test("fail appends the underlying cause when present", () => {
  const err = new Error("timeout", { cause: new Error("ECONNRESET") });
  const f = fail(err);
  assert.match((f.content[0] as { text: string }).text, /timeout \(ECONNRESET\)/);
});

test("the four annotation presets set all four hints explicitly", () => {
  assert.deepEqual(READ_ONLY, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(WRITE, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
  assert.deepEqual(UPDATE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  });
  assert.deepEqual(DESTRUCTIVE, {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});
