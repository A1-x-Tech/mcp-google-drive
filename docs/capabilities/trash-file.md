# Google Drive: Trash or restore a file — MCP tool

**Google Drive MCP tool:** Moves a file to the Drive trash or brings it back — the reversible way to delete.

Technical name: `trash_file`

## What task it solves

> I want to delete a file safely (or undo that).

Moves a file or folder to the trash (`action=trash`) or restores it (`action=restore`). This is what "delete" means in the Drive UI.

## When to use it

Use it whenever a user asks to delete something — trashing is reversible for ~30 days, so a mistake costs nothing. Reach for `delete_file_forever` only when the user has explicitly confirmed permanent, unrecoverable deletion.

## What to provide

- `file_id` — **required**. A folder goes to the trash with everything inside it.
- `action` — **required**: `trash` or `restore`.

## What it returns

id, name, `trashed` and `explicitlyTrashed`.

## What changes in Google Drive

The file moves in or out of the trash. Trashed files disappear from `search_files` (unless `include_trashed=true`) and from other users' views, but stay recoverable until the trash auto-purges them after about 30 days — that pending purge is why the operation is flagged as overwriting state.

## Example request

> Move the outdated drafts to the trash in Google Drive.

## Errors and limitations

Only the owner (or a shared-drive member with sufficient role) can trash a file. Restore puts the file back at its previous parent. After ~30 days in the trash the file is purged by Google and cannot be restored.

## Related MCP tools

- [Permanently delete a file](./delete-file-forever.md) — the irreversible counterpart; never confuse the two.
- [Search and list files](./search-files.md) — find trashed files with `include_trashed=true`.

## Technical details

- **Impact:** destructive operation
- **Group:** Trash & deletion
- **Description source:** `trash_file` registration in `src/tools/trash.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
