# Google Drive MCP capabilities

This catalog contains 15 public pages—one for every registered MCP tool in `mcp-google-drive`. Each page starts with the user's task, explains the result, and states whether the call changes real data.

Use this catalog to choose a ready-made capability. Full parameter schemas and API response details remain in the [technical reference](../TOOLS.md).

## Search

- [Search and list files](./search-files.md) — Finds files and folders by name, content, type or location, with pagination. **Impact:** read-only.
- [List shared drives](./list-shared-drives.md) — Lists the shared drives the authorized account is a member of. **Impact:** read-only.

## Files

- [Get file metadata](./get-file.md) — One file's full metadata: type, location, links, owners and capabilities. **Impact:** read-only.
- [Create a folder](./create-folder.md) — A new folder in My Drive, inside another folder or in a shared drive. **Impact:** changes data.
- [Copy a file](./copy-file.md) — Duplicates a file into a new independent copy. **Impact:** changes data.
- [Move a file](./move-file.md) — Relocates a file or folder into another folder or shared drive. **Impact:** destructive operation.
- [Rename and update file metadata](./update-file-metadata.md) — Name, description and starred flag, content untouched. **Impact:** destructive operation.

## Content

- [Upload file content](./upload-file.md) — Text or a local file into Drive; create, replace or import into Docs/Sheets/Slides. **Impact:** changes data.
- [Download file content](./download-file.md) — A binary file's bytes, inline or to a local path. **Impact:** read-only.
- [Export a Google Workspace file](./export-file.md) — A Doc/Sheet/Slides as Markdown, CSV, PDF, Office formats and more. **Impact:** read-only.

## Trash & deletion

- [Trash or restore a file](./trash-file.md) — The reversible way to delete (and to undo it). **Impact:** destructive operation.
- [Permanently delete a file](./delete-file-forever.md) — Erases beyond recovery, bypassing the trash. **Impact:** destructive operation.

## Sharing & comments

- [Manage sharing and permissions](./manage-permissions.md) — List, grant, change and revoke access. **Impact:** destructive operation.
- [Manage file comments](./manage-comments.md) — Read, write, resolve and delete comment threads. **Impact:** destructive operation.

## Additional API methods

- [Raw Google Drive API call](./raw-request.md) — Escape hatch to any Drive API v3 endpoint. **Impact:** destructive operation.

## For maintainers and publishers

- [MCP capability documentation contract](../CAPABILITY-DOCUMENTATION.md)
- [Technical tool reference](../TOOLS.md)
- [GitHub repository](https://github.com/A1-x-Tech/mcp-google-drive)
