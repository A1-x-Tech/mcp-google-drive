# Google Drive: Create a folder — MCP tool

**Google Drive MCP tool:** Creates a new folder in My Drive, inside another folder or in a shared drive.

Technical name: `create_folder`

## What task it solves

> I want to create a folder to organize files.

Creates a folder (a Drive file with the folder mimeType) and returns its id for immediate use as a parent.

## When to use it

Use it when building a folder structure before uploading or moving files into it. Search first: Drive happily allows several folders with the same name in the same parent, so check with `search_files` (`only_folders`) and reuse an existing id instead of duplicating.

## What to provide

- `name` — **required**. The folder name.
- `parent_id` — **optional**. Parent folder or shared-drive id; omitted = My Drive root.

## What it returns

The new folder's id, name, mimeType, parents and webViewLink.

## What changes in Google Drive

A new folder appears at the chosen location. Creation is a real write: retrying after an unclear failure would create a second folder with the same name.

## Example request

> Create a "2026 Reports" folder inside the Finance folder in Google Drive.

## Errors and limitations

Folder names are not unique — this tool never "finds or creates", it always creates. Writing into a shared drive requires at least contributor access there.

## Related MCP tools

- [Search and list files](./search-files.md) — check for an existing folder first.
- [Move a file](./move-file.md) / [Upload file content](./upload-file.md) — fill the folder.

## Technical details

- **Impact:** changes data
- **Group:** Files
- **Description source:** `create_folder` registration in `src/tools/files.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
