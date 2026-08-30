# Google Drive: Move a file — MCP tool

**Google Drive MCP tool:** Relocates a file or folder into another folder or shared drive.

Technical name: `move_file`

## What task it solves

> I want to move a file to a different folder.

Re-parents a file: by default it leaves all current parents (a real move); optionally it only adds the new parent.

## When to use it

Use it to organize existing files — the file keeps its id, sharing and comments, only its location changes. For a duplicate in the new place use `copy_file` instead.

## What to provide

- `file_id` — **required**. The file or folder to move.
- `new_parent_id` — **required**. Destination folder or shared-drive id (`root` = My Drive top level).
- `keep_existing_parents` — **optional**. Add the new parent without removing the old ones (My Drive only).

## What it returns

id, name and the new `parents` (plus driveId when it landed in a shared drive).

## What changes in Google Drive

The file disappears from its old folder and appears in the new one for everyone it is shared with. The old location is overwritten — that is why the tool is flagged as overwriting existing state.

## Example request

> Move last month's invoices into the "Archive/2026-07" folder in Google Drive.

## Errors and limitations

Shared-drive items always have exactly one parent, so `keep_existing_parents` fails there. Moving between My Drive and a shared drive changes ownership rules and can be rejected by the drive's settings. The move costs one extra read (current parents are fetched first).

## Related MCP tools

- [Copy a file](./copy-file.md) — duplicate instead of relocating.
- [Create a folder](./create-folder.md) — make the destination first.

## Technical details

- **Impact:** destructive operation
- **Group:** Files
- **Description source:** `move_file` registration in `src/tools/files.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
