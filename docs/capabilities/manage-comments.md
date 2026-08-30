# Google Drive: Manage file comments — MCP tool

**Google Drive MCP tool:** Reads, writes, resolves and deletes the comment threads on a Drive file.

Technical name: `manage_comments`

## What task it solves

> I want to work with the comments on a file.

One tool for the Drive comment lifecycle: `list`/`get` read threads, `create` starts one, `reply` answers, `resolve`/`reopen` close or reopen, `delete` removes.

## When to use it

Use it to review feedback on a Doc/Sheet/PDF, answer review comments, close finished threads, or leave a note on a file for collaborators.

## What to provide

- `file_id` — **required**; `action` — **required**: `list`, `get`, `create`, `reply`, `resolve`, `reopen` or `delete`.
- `create`: `content` (plus optional `quoted_text` / `anchor`); `reply`: `comment_id` + `content`; `resolve`/`reopen`: `comment_id` (optional closing `content`); `get`/`delete`: `comment_id`.
- `list`: optional `page_size`, `page_token`, `include_deleted`.

## What it returns

Comment objects: id, content, author, createdTime/modifiedTime, resolved, quotedFileContent and the replies (with their resolve/reopen actions).

## What changes in Google Drive

`create`/`reply`/`resolve`/`reopen` add visible activity that notifies collaborators; `delete` permanently removes a comment and all its replies — the reason the whole tool is flagged destructive. `list`/`get` change nothing.

## Example request

> List the unresolved comments on the design doc in Google Drive and reply to the first one that it is fixed.

## Errors and limitations

Comments created through the API cannot be positionally anchored inside a Doc's text — `quoted_text` displays the passage but the comment appears at file level. Docs "suggestions" are out of reach. Deleting is author-only.

## Related MCP tools

- [Get file metadata](./get-file.md) — `capabilities.canComment` says whether commenting is allowed.

## Technical details

- **Impact:** destructive operation
- **Group:** Comments
- **Description source:** `manage_comments` registration in `src/tools/comments.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
