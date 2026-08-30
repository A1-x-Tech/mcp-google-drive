# Google Drive: Rename and update file metadata — MCP tool

**Google Drive MCP tool:** Renames a file or updates its description and starred flag without touching content.

Technical name: `update_file_metadata`

## What task it solves

> I want to rename a file or edit its details.

Changes a file's name, description and/or starred state — metadata only; the bytes inside stay exactly as they were.

## When to use it

Use it to rename files and folders, keep searchable descriptions, or star/unstar. To replace a file's content use `upload_file` with `file_id`; to relocate use `move_file`; to trash use `trash_file`.

## What to provide

- `file_id` — **required**.
- `name` / `description` / `starred` — at least one. The extension is part of the name — keep it unless you mean to change it.

## What it returns

id, name, description, starred and the new modifiedTime.

## What changes in Google Drive

The provided fields are overwritten for everyone the file is shared with; omitted fields stay untouched. The old name/description is not recoverable from here, which is why the tool is flagged as overwriting existing state.

## Example request

> Rename the draft to "Q3 report — final.docx" in Google Drive and star it.

## Errors and limitations

At least one field is required — an empty update is rejected locally, before the API. Renaming needs write access (`capabilities.canEdit` from `get_file`).

## Related MCP tools

- [Move a file](./move-file.md) — location, not name.
- [Upload file content](./upload-file.md) — replace the bytes.

## Technical details

- **Impact:** destructive operation
- **Group:** Files
- **Description source:** `update_file_metadata` registration in `src/tools/files.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
