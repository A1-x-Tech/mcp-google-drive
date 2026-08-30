# Google Drive: Permanently delete a file — MCP tool

**Google Drive MCP tool:** Erases a file beyond recovery, bypassing the trash entirely.

Technical name: `delete_file_forever`

## What task it solves

> I want to permanently erase a file with no way back.

Deletes a file immediately and irreversibly — no trash, no 30-day grace period, no undo.

## When to use it

Only when the user has explicitly confirmed permanent deletion (cleaning up sensitive data, purging disposable test resources). For an ordinary "delete this" request use `trash_file` — that is what the Drive UI does.

## What to provide

- `file_id` — **required**. A folder takes every descendant with it.

## What it returns

`{ok:true}` — the API responds with an empty 204.

## What changes in Google Drive

The file (or the whole folder subtree) ceases to exist for every collaborator, instantly and permanently. Nothing about this call is recoverable.

## Example request

> I confirm: permanently delete the temporary export folder from Google Drive, bypassing the trash.

## Errors and limitations

Requires ownership (or organizer on a shared drive) — otherwise HTTP 403. A failed call is safe to inspect with `get_file` (404 = it is gone) before considering a retry.

## Related MCP tools

- [Trash or restore a file](./trash-file.md) — the reversible default for "delete".

## Technical details

- **Impact:** destructive operation
- **Group:** Trash & deletion
- **Description source:** `delete_file_forever` registration in `src/tools/trash.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
