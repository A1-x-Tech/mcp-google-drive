# Google Drive: Get file metadata — MCP tool

**Google Drive MCP tool:** Fetches one file's full metadata — type, location, links, owners and capabilities.

Technical name: `get_file`

## What task it solves

> I want to inspect a file before working with it.

Returns everything Drive knows about a file except its content: identity, placement, timestamps, share links and what the current credentials are allowed to do with it.

## When to use it

Use it to check a file's mimeType before download/export, to read `capabilities` before mutating, to resolve a shortcut's real target (`shortcutDetails`), or to grab `webViewLink` for a human.

## What to provide

- `file_id` — **required**. The id from a Drive URL or from `search_files`.
- `fields` — **optional**. A custom Drive fields projection when the rich default set is too much or too little.

## What it returns

id, name, mimeType, size, parents, driveId, createdTime/modifiedTime, trashed, starred, description, md5Checksum, webViewLink, webContentLink, exportLinks, owners, lastModifyingUser, shortcutDetails and capabilities.

## What changes in Google Drive

Nothing — this is a pure read; file content is never fetched here.

## Example request

> Show me who owns this Google Drive file and whether I can edit it.

## Errors and limitations

HTTP 404 usually means the id is wrong or the account has no access at all. Google-native files (Docs/Sheets/Slides) report no size or checksum — that is normal, not data loss.

## Related MCP tools

- [Download file content](./download-file.md) / [Export a Google Workspace file](./export-file.md) — the content itself.
- [Search and list files](./search-files.md) — find the id first.

## Technical details

- **Impact:** read-only
- **Group:** Files
- **Description source:** `get_file` registration in `src/tools/files.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
