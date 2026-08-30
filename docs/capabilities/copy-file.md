# Google Drive: Copy a file — MCP tool

**Google Drive MCP tool:** Duplicates a file into a new independent copy, optionally renamed and re-homed.

Technical name: `copy_file`

## What task it solves

> I want to duplicate a file.

Creates a copy with a fresh fileId — the original stays untouched. Works on binaries and Google-native files (Docs/Sheets/Slides) alike.

## When to use it

Use it to clone a template document, snapshot a file before edits, or duplicate a file into another folder while keeping the original in place (unlike `move_file`).

## What to provide

- `file_id` — **required**. The file to copy.
- `name` — **optional**. Name for the copy (default: the original's name, not "Copy of ...").
- `parent_id` — **optional**. Folder for the copy.

## What it returns

The copy's full metadata, including its new id and webViewLink.

## What changes in Google Drive

A new file appears; comments and permissions are NOT copied. Each call creates another copy — after an ambiguous failure verify with `search_files` before retrying, or you will end up with duplicates.

## Example request

> Copy the contract template into the "Clients/Acme" folder in Google Drive as "Acme contract draft".

## Errors and limitations

Folders cannot be copied — recreate the tree with `create_folder` and copy files one by one. Copying needs at least read access to the original and write access to the destination.

## Related MCP tools

- [Move a file](./move-file.md) — relocate instead of duplicating.
- [Upload file content](./upload-file.md) — create a file from new content.

## Technical details

- **Impact:** changes data
- **Group:** Files
- **Description source:** `copy_file` registration in `src/tools/files.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
