# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-30

### Added

- First release: a full MCP server for the Google Drive API v3 (stdio, TypeScript,
  `@modelcontextprotocol/sdk` + `zod`).
- Tools (15):
  - `search_files` — files.list with escaped convenience filters AND-ed with a raw
    Drive q expression, shared-drive scopes and pagination;
  - `list_shared_drives` — the shared drives the account is a member of;
  - `get_file` — rich metadata incl. exportLinks, shortcutDetails and capabilities;
  - `create_folder`, `copy_file`, `move_file` (addParents/removeParents with the
    current parents fetched first), `update_file_metadata` (rename/description/starred);
  - `upload_file` — multipart create/replace-in-place (≤ 5 MB) from inline text or an
    absolute local path, with optional import into Docs/Sheets/Slides (`convert_to`);
  - `download_file` — binary bytes to a local path or small textual content inline;
    rejects Google-native files (→ export) and resolves shortcuts to their target;
  - `export_file` — Docs/Sheets/Slides/Drawings to Markdown, CSV, PDF, Office formats;
  - `trash_file` (trash/restore — the reversible path) explicitly separated from
    `delete_file_forever` (permanent, bypasses the trash);
  - `manage_permissions` — list/share/update/remove grants incl. link sharing, domain
    sharing and ownership transfer;
  - `manage_comments` — list/get/create/reply/resolve/reopen/delete comment threads;
  - `raw_request` — escape hatch to any Drive API v3 path (SSRF-guarded).
- Degraded start: without credentials the server still completes the MCP handshake,
  serves the tool list, opens the instructions with the fix, and fails the first tool
  call with an actionable `CredentialsError` naming the environment variables.
- OAuth2 refresh flow: access tokens minted from
  `GOOGLE_DRIVE_CLIENT_ID`/`_CLIENT_SECRET`/`_REFRESH_TOKEN`, cached until just before
  expiry, deduped across concurrent requests and re-minted once on a 401; a static
  `GOOGLE_DRIVE_ACCESS_TOKEN` works as an alternative.
- Resilience: request timeout covering body reads (binary-safe), `Retry-After`-aware
  backoff, 429 retried for every method, 5xx/network retries gated to reads so writes
  are never replayed.
- Safe local paths: absolute-only, resolved, NUL-free; downloads never overwrite
  without `overwrite=true`; uploads read regular files only.
- Anonymous usage telemetry (event/tool names and versions only; opt out with
  `ASKADS_TELEMETRY=0`), including the `startup_failed`/`unconfigured_start` funnel.
- Offline test suite (120+ tests): mocked-fetch client tests incl. the OAuth flow and
  multipart upload framing, fake-server tool tests with temp-dir filesystem checks,
  pinned per-tool annotations, capability-docs coverage, plus a dist smoke test that
  spawns the built binary and performs a real MCP handshake over stdio.
- Live smoke: read-only by default (`about` + optional file metadata); opt-in
  `GOOGLE_DRIVE_SMOKE_WRITE=1` write scenario on disposable resources with cleanup in
  `finally` after success and failure alike.
- CI (Node 20/22/24: typecheck + build + tests) and a daily live health check that
  skips itself when repo secrets are absent.

[0.1.0]: https://github.com/A1-x-Tech/mcp-google-drive/releases/tag/v0.1.0
