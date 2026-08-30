# Google Drive: Upload file content — MCP tool

**Google Drive MCP tool:** Uploads text or a local file to Drive — as a new file, a content replacement, or an import into Docs/Sheets/Slides.

Technical name: `upload_file`

## What task it solves

> I want to put content into Google Drive.

Creates a Drive file from inline text or a local file, replaces an existing file's content in place, or imports the bytes into an editable Google Workspace file.

## When to use it

Use it to save generated text, push a local document to the cloud, update a file without changing its id and sharing (`file_id`), or turn a `.docx`/`.csv`/Markdown file into a native Doc/Sheet (`convert_to`).

## What to provide

- Exactly one of `content` (inline UTF-8 text) or `local_path` (absolute local file path).
- `name` — **required when creating** (no `file_id`).
- `parent_id` — **optional**, create only.
- `mime_type` — **optional**. Defaults to text/plain for `content`, extension-based for `local_path`.
- `convert_to` — **optional**: `document`, `spreadsheet` or `presentation` (import).
- `file_id` — **optional**. Replace this file's content instead of creating.

## What it returns

The uploaded file's full metadata (id, name, mimeType, size, parents, webViewLink, ...).

## What changes in Google Drive

Without `file_id` a new file appears — a retry after an unclear failure would create a duplicate, so verify with `search_files` first. With `file_id` the previous content is replaced (older bytes survive only as revisions, reachable via `raw_request`).

## Example request

> Upload this meeting summary to the "Notes" folder in Google Drive as a Google Doc.

## Errors and limitations

Uploads are capped at 5 MB per call (multipart) — larger files need a resumable session via `raw_request`. Relative local paths are rejected; a missing local file is a clear error. Conversion quality depends on Google's importers.

## Related MCP tools

- [Download file content](./download-file.md) / [Export a Google Workspace file](./export-file.md) — the opposite direction.
- [Create a folder](./create-folder.md) — make a home for the upload.

## Technical details

- **Impact:** changes data
- **Group:** Content
- **Description source:** `upload_file` registration in `src/tools/content.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
