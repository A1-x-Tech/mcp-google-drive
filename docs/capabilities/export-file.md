# Google Drive: Export a Google Workspace file — MCP tool

**Google Drive MCP tool:** Converts a Google Doc, Sheet, Slides or Drawing into Markdown, CSV, PDF, Office formats and more.

Technical name: `export_file`

## What task it solves

> I want to get a Google Doc or Sheet in a usable format.

Exports a Google-native file to a regular format on the fly — the original stays untouched.

## When to use it

Use it to read a Doc as Markdown/plain text in the conversation, pull a Sheet as CSV, or save a PDF/DOCX/XLSX/PPTX to disk. Regular binary files are not exportable — use `download_file` for them.

## What to provide

- `file_id` — **required**. A Google-native file (Doc, Sheet, Slides, Drawing).
- `mime_type` — **required**. The target format: Docs → text/markdown, text/plain, text/html, application/pdf, .docx, application/rtf; Sheets → text/csv (first sheet only), application/pdf, .xlsx; Slides → application/pdf, text/plain, .pptx; Drawings → image/png, image/svg+xml, application/pdf.
- `save_path` / `overwrite` — **optional**. Absolute local path for binary or >100 KB output.

## What it returns

With `save_path`: `saved_to`, `bytes`, `content_type`. Inline (small textual exports): `content` plus the export mime type.

## What changes in Google Drive

Nothing — export is a read-time conversion; the source file is not modified.

## Example request

> Export the project plan Doc from Google Drive as Markdown and summarize it.

## Errors and limitations

The API caps exports at 10 MB — for bigger documents use the file's `exportLinks` from `get_file`. text/csv exports only the first sheet of a spreadsheet. An unsupported source/target pairing fails with HTTP 400.

## Related MCP tools

- [Download file content](./download-file.md) — for regular binary files.
- [Upload file content](./upload-file.md) — convert in the opposite direction.

## Technical details

- **Impact:** read-only
- **Group:** Content
- **Description source:** `export_file` registration in `src/tools/content.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
