# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-24

### Changed

- First stable release. The code is unchanged from 0.2.0; the version now states
  what was already true of it — the tool surface, tool argument shapes,
  environment variable names and response envelopes are settled, and breaking any
  of them from here on requires a major bump.

## [0.2.0] - 2026-09-20

### Added

- In-chat Google login via `@a1-x-tech/mcp-google-auth` — 6 new onboarding
  tools: `auth_status`, `setup_instructions`, `set_client`, `start_login`
  (deliberately not read-only), `finish_login`, `logout`. The flow is loopback
  `127.0.0.1` + PKCE against a user-owned Desktop OAuth client; the code is
  exchanged locally and the client secret never passes through the chat. Each
  tool has a capability page under `docs/capabilities/`.
- Tokens from a login are stored per server in
  `~/.config/mcp-google-drive/credentials.json` (0600) and re-read on every
  call, so a login finished mid-session works without restarting the AI client.
  `GOOGLE_DRIVE_OAUTH_PORT` pins the loopback listener port for SSH forwarding.
- `finish_login` verifies a fresh login against **Google Drive API** itself rather than
  Google's identity endpoint: OIDC answers even when the API is switched off in
  the Cloud project, which would make a broken setup look connected. A 403 that
  says the API is disabled is translated into the actual fix — enable it in the
  same project as the OAuth client.

### Changed

- The client accepts the component's `TokenProvider` as a fallback token
  source: environment credentials (the refresh triple or `GOOGLE_DRIVE_ACCESS_TOKEN`)
  keep absolute priority and behave exactly as before; the stored in-chat login
  is used only when the environment carries no credentials. The single 401
  re-mint + replay works for provider-backed tokens too, and is skipped when
  nothing can be re-minted.
- The unconfigured `initialize` instructions lead with the in-chat login
  (`setup_instructions` → `set_client` → `start_login` → `finish_login`, no
  restart needed); setting the environment variables + restart remains the
  documented alternative.

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

[1.0.0]: https://github.com/A1-x-Tech/mcp-google-drive/releases/tag/v1.0.0
[0.2.0]: https://github.com/A1-x-Tech/mcp-google-drive/releases/tag/v0.2.0
[0.1.0]: https://github.com/A1-x-Tech/mcp-google-drive/releases/tag/v0.1.0
