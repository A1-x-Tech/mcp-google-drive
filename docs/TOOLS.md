# Tools

For task-oriented guidance, open the [MCP capability catalog](./capabilities/index.md). This page remains the technical reference for schemas and API responses.

The Google Drive API mixes reads and writes, so every tool carries explicit MCP
annotations: reads are `readOnlyHint`, updates are idempotent-but-overwriting,
deletes are destructive. Inputs use a normalized snake_case vocabulary; the
client maps them to the API's wire values (query building, `addParents`/
`removeParents`, multipart framing, `supportsAllDrives`) and handles OAuth
entirely on its own.

`file_id` is the long id from a Drive URL (`drive.google.com/file/d/<fileId>` or
`docs.google.com/.../d/<fileId>/edit`) or from `search_files` output. Folders and
shared-drive items are files too; names are **not** unique — always act on ids.

## Search & listing

| Tool | Description |
|---|---|
| `search_files` | `files.list`. Convenience filters (`name_contains`, `full_text_contains`, `mime_type`, `parent_id`, `only_folders`) AND-ed with a raw `query` (Drive q syntax); values are escaped against query injection. Trashed files hidden unless `include_trashed`. Shared drives via `drive_id` (corpora=drive) or `include_all_drives` (corpora=allDrives). `page_size` ≤ 1000, `order_by`, `page_token`. Returns compact per-file fields + `nextPageToken` + `incompleteSearch`. |
| `list_shared_drives` | `drives.list` with an optional `name_contains` filter. `page_size` ≤ 100. My Drive never appears here. |

## Files & organization

| Tool | Description |
|---|---|
| `get_file` | `files.get` with a rich default projection (incl. `exportLinks`, `shortcutDetails`, `capabilities`); `fields` overrides it. Metadata only — content goes through `download_file`/`export_file`. |
| `create_folder` | `files.create` with the folder mimeType. Duplicate names are legal — search before creating. |
| `copy_file` | `files.copy` → a fresh fileId. Folders are not copyable; comments/permissions are not copied. |
| `move_file` | Reads current `parents` (one extra GET), then a single PATCH with `addParents`/`removeParents`. `keep_existing_parents` adds without removing (My Drive only — shared-drive items have exactly one parent). |
| `update_file_metadata` | `files.update` on `name`/`description`/`starred` only; at least one required, empty updates rejected locally. |

## Content

| Tool | Description |
|---|---|
| `upload_file` | Multipart upload (metadata + bytes, ≤ **5 MB**). No `file_id` = create (`name` required, `parent_id` optional); with `file_id` = replace content in place (PATCH on the upload endpoint; `parents` is create-only). Source: exactly one of `content` (inline UTF-8) or `local_path` (absolute). `convert_to` = import into a Google Doc/Sheet/Slides. Larger files → resumable session via `raw_request`. |
| `download_file` | `files.get alt=media`. Google-native files are rejected (→ `export_file`); shortcuts are rejected naming the real target. Inline return: textual content ≤ 100 KB; otherwise `save_path` (absolute; refuses to overwrite without `overwrite=true`, parent dirs created). `acknowledge_abuse` for flagged files. |
| `export_file` | `files.export` with the target `mime_type`. Docs → markdown/plain/html/pdf/docx/rtf; Sheets → csv (first sheet)/pdf/xlsx; Slides → pdf/plain/pptx; Drawings → png/svg/pdf. API cap **10 MB** — beyond it use `exportLinks`. Same inline/save delivery as `download_file`. |

## Trash vs. permanent deletion

| Tool | Description |
|---|---|
| `trash_file` | `files.update {trashed}` — `action=trash` (reversible, auto-purge after ~30 days) or `restore`. The default meaning of "delete". |
| `delete_file_forever` | `files.delete` — permanent, bypasses the trash, folder subtrees included. Deliberately a separate tool so the irreversible path can never be picked by accident. |

## Sharing & comments

| Tool | Description |
|---|---|
| `manage_permissions` | `action`: `list`, `share` (role + type; `email_address` for user/group, `domain` for domain, `allow_file_discovery` for domain/anyone; `send_notification_email`, `email_message`, `transfer_ownership`), `update` (`permission_id` + `role`, optional `expiration_time`), `remove` (`permission_id`). Consumer-account ownership transfer is an invitation (`pendingOwner`) until accepted. |
| `manage_comments` | `action`: `list` (paged, `include_deleted`), `get`, `create` (`content`, optional `quoted_text`/`anchor`), `reply`, `resolve`/`reopen` (via `replies.create` with `action`), `delete`. The comments endpoints require an explicit `fields` — the client always sends one. API-created comments cannot be positionally anchored inside Doc text. |

## Escape hatch

| Tool | Description |
|---|---|
| `raw_request` | Calls any Drive API v3 path (`GET`/`POST`/`PATCH`/`DELETE`, default GET) — revisions, changes feed, shortcuts, `emptyTrash`, `generateIds`, resumable uploads. Paths resolving to a foreign origin are rejected (SSRF guard), so the Bearer token never leaves `www.googleapis.com`. JSON responses only. |

## Notes

- **Retry policy:** 429 is retried with backoff for every method (the request was rejected
  before executing); 5xx and network errors are retried **only for GET** — replaying a write
  after an ambiguous failure could duplicate a copy, upload or folder.
- **OAuth:** access tokens are minted from the refresh token automatically, cached until ~60s
  before expiry, and re-minted once on a 401.
- **Shared drives:** every file call sends `supportsAllDrives=true`; listings opt in via
  `drive_id`/`include_all_drives`.
- **Local paths:** absolute only, `..` resolved, NUL bytes rejected; downloads never
  overwrite without `overwrite=true`; uploads read regular files only.

## OAuth scopes

Request the narrowest scope that covers your use when minting the refresh token:

| Scope | Enables |
|---|---|
| `https://www.googleapis.com/auth/drive.file` | Only files created/opened by this app — enough for upload/organize flows of app-owned files. |
| `https://www.googleapis.com/auth/drive.readonly` | Read-only tools (`search_files`, `get_file`, `download_file`, `export_file`, `list_shared_drives`). |
| `https://www.googleapis.com/auth/drive` | The full tool surface (sharing, trash, deletion, comments on arbitrary files). |

The server never requests scopes itself — it uses whatever the refresh token was minted with;
a call outside the token's scope fails with HTTP 403 `insufficientPermissions`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | yes* | — | OAuth2 client id (refresh flow). |
| `GOOGLE_DRIVE_CLIENT_SECRET` | yes* | — | OAuth2 client secret (refresh flow). Secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | yes* | — | OAuth2 refresh token (refresh flow). Secret. |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | yes* | — | Alternative: static access token (~1 h lifetime). Secret. |
| `GOOGLE_DRIVE_API_BASE` | no | `https://www.googleapis.com` | API root override. |
| `GOOGLE_DRIVE_TIMEOUT_MS` | no | `60000` | Per-request timeout, ms. |
| `GOOGLE_DRIVE_MAX_RETRIES` | no | `3` | Retries on transient errors. |

\* Either the refresh triple together, or the static access token.
