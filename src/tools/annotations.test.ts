import { test } from "node:test";
import assert from "node:assert/strict";
import { registerSearchTools } from "./search.js";
import { registerFileTools } from "./files.js";
import { registerContentTools } from "./content.js";
import { registerTrashTools } from "./trash.js";
import { registerPermissionTools } from "./permissions.js";
import { registerCommentTools } from "./comments.js";
import { registerRawTool } from "./raw.js";
import { DESTRUCTIVE, READ_ONLY, UPDATE, WRITE } from "./util.js";

interface Annotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Registers every tool against a fake server, capturing each tool's annotations. */
function collectAnnotations(): Record<string, Annotations | undefined> {
  const annotations: Record<string, Annotations | undefined> = {};
  const server = {
    registerTool: (name: string, cfg: { annotations?: Annotations }) => {
      annotations[name] = cfg.annotations;
    },
  };
  // Registration reads the client only inside handlers, so a stub is fine here.
  registerSearchTools(server as never, {} as never);
  registerFileTools(server as never, {} as never);
  registerContentTools(server as never, {} as never);
  registerTrashTools(server as never, {} as never);
  registerPermissionTools(server as never, {} as never);
  registerCommentTools(server as never, {} as never);
  registerRawTool(server as never, {} as never);
  return annotations;
}

const ANN = collectAnnotations();

/**
 * The Drive API mixes reads and writes, so instead of one blanket invariant the
 * expected hints are pinned per tool. Changing a tool's annotation must be a
 * conscious decision that updates this map.
 */
const EXPECTED: Record<string, Annotations> = {
  search_files: READ_ONLY,
  list_shared_drives: READ_ONLY,
  get_file: READ_ONLY,
  create_folder: WRITE,
  copy_file: WRITE,
  move_file: UPDATE,
  update_file_metadata: UPDATE,
  upload_file: WRITE,
  download_file: READ_ONLY,
  export_file: READ_ONLY,
  trash_file: UPDATE,
  delete_file_forever: DESTRUCTIVE,
  manage_permissions: DESTRUCTIVE,
  manage_comments: DESTRUCTIVE,
  raw_request: DESTRUCTIVE,
};

test("registers all fifteen tools with annotations", () => {
  assert.deepEqual(Object.keys(ANN).sort(), Object.keys(EXPECTED).sort());
  for (const [name, a] of Object.entries(ANN)) {
    assert.ok(a, `${name} is missing annotations`);
  }
});

test("every tool carries exactly its pinned hints (all four set)", () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(ANN[name], expected, `${name} annotations drifted`);
  }
});

test("permanent deletion is never presented as a safe update", () => {
  assert.equal(ANN.delete_file_forever?.destructiveHint, true);
  assert.equal(ANN.delete_file_forever?.idempotentHint, false);
  // And the reversible counterpart must NOT look as dangerous as the permanent one.
  assert.equal(ANN.trash_file?.idempotentHint, true, "trash/restore converges — it is the recoverable path");
});

test("reads stay read-only — Drive state is never touched by them", () => {
  for (const name of ["search_files", "list_shared_drives", "get_file", "download_file", "export_file"]) {
    assert.equal(ANN[name]?.readOnlyHint, true, `${name} must be read-only`);
  }
});
