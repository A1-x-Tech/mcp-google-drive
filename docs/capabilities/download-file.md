# Google Drive: Download file content — MCP tool

**Google Drive MCP tool:** Fetches a binary file's bytes — inline for small text, to a local path for everything else.

Technical name: `download_file`

## What task it solves

> I want to read or save a file's content.

Downloads the raw bytes of a regular (non-Google-native) Drive file. Small textual files come back inline; anything binary or large is written to a local file.

## When to use it

Use it to read a text/CSV/JSON file's content directly in the conversation, or to save a PDF/image/archive to disk. For Google Docs/Sheets/Slides use `export_file` — they have no bytes to download.

## What to provide

- `file_id` — **required**.
- `save_path` — **optional**. Absolute local path; required for binary or >100 KB content.
- `overwrite` — **optional**. Allow replacing an existing local file (default: refuse).
- `acknowledge_abuse` — **optional**. Download a file Drive flagged as malware/abuse (owner only).

## What it returns

With `save_path`: `saved_to`, `bytes`, `content_type`. Inline: `content` (UTF-8 text) plus name, bytes and content type.

## What changes in Google Drive

Nothing in Drive. Locally a file may be written — never over an existing one unless `overwrite=true`.

## Example request

> Download the latest export.csv from Google Drive and show me the first rows.

## Errors and limitations

Google-native files are rejected with a pointer to `export_file`; shortcuts are rejected with the real target's id. Inline return is capped at 100 KB and textual content types. Relative save paths are rejected.

## Related MCP tools

- [Export a Google Workspace file](./export-file.md) — for Docs/Sheets/Slides.
- [Get file metadata](./get-file.md) — check mimeType and size first.

## Technical details

- **Impact:** read-only
- **Group:** Content
- **Description source:** `download_file` registration in `src/tools/content.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
