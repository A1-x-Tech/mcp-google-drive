import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { DESTRUCTIVE, fail, fileIdSchema, ok, UPDATE } from "./util.js";

export function registerTrashTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "trash_file",
    {
      title: "Trash or restore a file",
      annotations: UPDATE,
      description:
        "action=trash moves a file (or folder, with everything inside) to the Drive trash; action=restore brings it back. Trashing is REVERSIBLE — the file stays recoverable until the trash auto-purges it after ~30 days — and is the safe default whenever a user asks to 'delete' something: only use delete_file_forever when they explicitly want it gone beyond recovery. Trashed files disappear from search_files unless include_trashed=true. Only the owner (or a shared-drive member with the right role) can trash; restore puts the file back at its old parent. Returns id, name, trashed and explicitlyTrashed.",
      inputSchema: {
        file_id: fileIdSchema(),
        action: z.enum(["trash", "restore"]).describe("trash = move to the trash (reversible); restore = take it back out."),
      },
    },
    async ({ file_id, action }) => {
      try {
        return ok(await client.setTrashed(file_id, action === "trash"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "delete_file_forever",
    {
      title: "Permanently delete a file",
      annotations: DESTRUCTIVE,
      description:
        "PERMANENTLY deletes a file, BYPASSING the trash — there is no undo, no 30-day grace period, and a folder takes every descendant with it. This is NOT the same as trash_file: when a user says 'delete', they almost always mean the reversible trash — use trash_file unless they explicitly confirmed permanent, unrecoverable deletion. Requires ownership (or organizer on a shared drive). Returns {ok:true} on success (the API responds with an empty 204).",
      inputSchema: {
        file_id: fileIdSchema(),
      },
    },
    async ({ file_id }) => {
      try {
        return ok(await client.deleteForever(file_id));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
