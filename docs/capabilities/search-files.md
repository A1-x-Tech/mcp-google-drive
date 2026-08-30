# Google Drive: Search and list files — MCP tool

**Google Drive MCP tool:** Finds files and folders by name, content, type or location, with pagination.

Technical name: `search_files`

## What task it solves

> I want to find files and folders in Google Drive.

Searches and lists Drive files with convenience filters (name, full text, mimeType, parent folder, folders-only) that combine with a raw Drive query expression.

## When to use it

Use it before any other operation: everything in Drive is addressed by file id, and names are not unique, so search first and act on ids. It also lists a folder's children (`parent_id`) and browses shared drives (`drive_id` / `include_all_drives`).

## What to provide

- `query` — **optional**. Raw Drive `q` expression, AND-ed with the filters below.
- `name_contains` / `full_text_contains` / `mime_type` / `parent_id` / `only_folders` — **optional** convenience filters.
- `include_trashed` — **optional**. Trashed files are hidden by default.
- `order_by`, `page_size` (1..1000), `page_token` — **optional** ordering and pagination.
- `drive_id` or `include_all_drives` — **optional** shared-drive scope.

## What it returns

A compact JSON page: `files[]` with id, name, mimeType, size, parents, driveId, modifiedTime, trashed, starred, webViewLink and shortcutDetails, plus `nextPageToken` and `incompleteSearch`.

## What changes in Google Drive

Nothing — this is a pure read.

## Example request

> Find the latest PDF reports in the "Finance" folder in Google Drive and show me their links.

## Errors and limitations

Values inside the filters are escaped automatically, but a malformed raw `query` fails with HTTP 400. `incompleteSearch=true` means some corpora were skipped — narrow the search. Shared-drive items appear only with `drive_id` or `include_all_drives`.

## Related MCP tools

- [Get file metadata](./get-file.md) — full details for one id.
- [List shared drives](./list-shared-drives.md) — find a `drive_id` to search in.

## Technical details

- **Impact:** read-only
- **Group:** Search
- **Description source:** `search_files` registration in `src/tools/search.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
