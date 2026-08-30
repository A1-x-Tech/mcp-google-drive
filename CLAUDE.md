# CLAUDE.md — mcp-google-drive

MCP server for the Google Drive API v3 (TypeScript, stdio). Mixed read/write:
tools cover search/listing (incl. shared drives), file metadata and organization
(folders, copy, move, rename), content transfer (multipart upload with Workspace
import, binary download, export of Google-native files), the reversible trash
explicitly separated from permanent deletion, permissions/sharing and Drive
comments; `raw_request` is the escape hatch. The server talks to
`https://www.googleapis.com` (`drive/v3` + `upload/drive/v3`) with a Bearer
token; the token is minted from an OAuth2 refresh token via
`https://oauth2.googleapis.com/token` (or a static `GOOGLE_DRIVE_ACCESS_TOKEN`,
mostly for testing). Docs/Sheets/Slides content is never edited — those files
are moved, shared, exported and converted as opaque units.

## Commands

```bash
npm run dev        # run from source (tsx watch)
npm test           # unit tests + dist smoke, no network
npm run typecheck  # types for src + tests
npm run build      # emit dist/
npm run smoke      # live check: read-only by default (about + optional GOOGLE_DRIVE_SMOKE_FILE_ID);
                   # GOOGLE_DRIVE_SMOKE_WRITE=1 = disposable write scenario with cleanup in finally
```

## Architecture

- `src/config.ts` — env → config. Credentials: either the refresh triple
  `GOOGLE_DRIVE_CLIENT_ID` + `GOOGLE_DRIVE_CLIENT_SECRET` + `GOOGLE_DRIVE_REFRESH_TOKEN`
  (all three or `ConfigError` `incomplete_oauth_config`) or `GOOGLE_DRIVE_ACCESS_TOKEN`;
  optional `GOOGLE_DRIVE_API_BASE`, `GOOGLE_DRIVE_TIMEOUT_MS`, `GOOGLE_DRIVE_MAX_RETRIES`.
  No credentials at all is NOT an error: the fields stay `undefined` and the server starts
  degraded. Also home to `CredentialsError` / `MISSING_CREDENTIALS_MESSAGE` (opens with the
  historical startup error verbatim, then names the variables and the restart) and
  `hasCredentials()`.
- `src/client.ts` — all HTTP and all wire mapping. Token lifecycle (cache until ~60s before
  expiry, dedupe concurrent refreshes, one forced re-mint + replay on 401). Every call —
  JSON, multipart upload, binary download — goes through the private `send()`: it resolves
  the path against the base and rejects foreign origins (SSRF guard), enforces an
  AbortController timeout that also covers reading the body (read as **bytes**, never text —
  downloads are binary), retries 429 always but 5xx/network errors **only for GET** — replaying
  a write after an ambiguous failure would duplicate it — and throws
  `GoogleDriveError(status, body)`. Typed per-endpoint methods own the wire vocabulary:
  `buildSearchQuery()` escapes user values into the Drive q syntax, `moveFile()` computes
  `addParents`/`removeParents` from the current parents, `buildMultipartBody()` frames
  metadata + media, `supportsAllDrives` rides on every file call, and the comments endpoints
  always get the explicit `fields` they require.
- `src/tools/search.ts` — `search_files`, `list_shared_drives`.
  `src/tools/files.ts` — `get_file`, `create_folder`, `copy_file`, `move_file`,
  `update_file_metadata`. `src/tools/content.ts` — `upload_file`, `download_file`,
  `export_file` + the local-path/inline-delivery helpers (absolute paths only, no silent
  overwrite, 100 KB inline cap, extension→mimeType guessing).
  `src/tools/trash.ts` — `trash_file` (trash/restore) and `delete_file_forever`, deliberately
  two tools. `src/tools/permissions.ts` — `manage_permissions` (list/share/update/remove).
  `src/tools/comments.ts` — `manage_comments` (list/get/create/reply/resolve/reopen/delete).
  `src/tools/raw.ts` — `raw_request` (GET/POST/PATCH/DELETE). `src/tools/util.ts` —
  `ok`/`fail`, the four annotation presets (`READ_ONLY`/`WRITE`/`UPDATE`/`DESTRUCTIVE`),
  `safeLocalPath` and shared zod schema factories (`fileIdSchema`, `folderIdSchema`,
  `localPathSchema`).
- `src/index.ts` — wires every `register*` into the McpServer. `loadConfigOrDegraded()`
  catches `ConfigError`, pings `startup_failed` (fire-and-forget) and degrades the config to
  "no credentials"; an unconfigured start prepends `UNCONFIGURED_PREFIX` — plus
  `Configuration problem: <message>` when a ConfigError was caught — to the initialize
  `instructions`, and `oninitialized` sends `server_start` for a configured install or
  `unconfigured_start` (with the reason) otherwise.
- `src/telemetry.ts` — anonymous usage pings (ids/names/versions only, never data or
  arguments; fire-and-forget, must never block or throw; opt-out `ASKADS_TELEMETRY=0`).
  `server_start` means "a usable install started"; `unconfigured_start` is a degraded start
  and `startup_failed` a malformed config caught at load — both carry a `reason` from a
  closed vocabulary (`missing_credentials`, `incomplete_oauth_config`) — never a variable's
  name or value.

## Conventions (do not break)

- **Never exit because of configuration.** A server that dies before the MCP handshake leaves
  the user with a red cross and no reason — telemetry across this line of servers showed that
  state accounted for nearly every unconfigured install, and almost none of them recovered.
  Missing credentials are a survivable state: start, answer initialize (with the unconfigured
  prefix in `instructions`) and tools/list, and let the first tool call fail with
  `CredentialsError` — its message names the variables to set and says to restart, because
  credentials come only from the environment. `config.test.ts`, `client.test.ts` and
  `test/dist-smoke.test.js` pin this.
- **Credential failures are not transport failures.** `CredentialsError` is thrown in
  `accessToken()` before any fetch — before the retry/backoff loop, the token mint and the
  401 replay — because retrying it burns seconds of backoff before the user sees the one
  message that helps. Pinned by the "fetch never called" assertion in `client.test.ts`.
- **Never retry a write on 5xx/network errors.** Only 429 (rejected before executing) and GET
  are safe; the gate lives in `send()` and is pinned by tests. A replayed copy/upload/create
  duplicates real files.
- **Trash and permanent deletion never merge.** `trash_file` (reversible) and
  `delete_file_forever` (bypasses the trash) are separate tools with separate hints, and
  `trash_file` must never call `deleteForever` — pinned in `trash.test.ts`. "Delete" from a
  user means trash unless they explicitly confirmed permanence.
- **Wire mapping lives in the client, not the tools.** Tools accept the normalized snake_case
  vocabulary and must not know the wire params (`q` escaping, `addParents`/`removeParents`,
  `corpora`, multipart boundaries, `supportsAllDrives`, comment `fields`) — add any mapping in
  `client.ts`.
- **Auth is the client's job.** Tools never see tokens; the Bearer header, refresh, caching
  and the 401 replay all live in `send()`/`accessToken()`.
- **Local paths are absolute, resolved and overwrite-safe.** Everything filesystem goes
  through `safeLocalPath` + the helpers in `content.ts`: relative paths and NUL bytes are
  rejected, downloads refuse to overwrite without `overwrite=true`, inline returns cap at
  100 KB of textual content. Pinned in `content.test.ts` / `util.test.ts`.
- **Bodies are read as bytes inside the timeout window.** `fetchWithTimeout` returns a
  Buffer — a text decode would corrupt downloads, and reading outside the guarded zone would
  let a drip-feeding body hang forever.
- **Validate inputs with zod** in `inputSchema`; reuse the shared schema **factories** in
  `util.ts` (a fresh schema per field avoids `$ref` dedup in the JSON schema).
- **Annotations are pinned per tool** in `annotations.test.ts` — changing one is a conscious
  decision that updates the map, with all four hints always set.
- **Output compact JSON via `ok`** — the consumer is an LLM; pretty-printing burns tokens.
  Responses pass through verbatim (describe the fields in the tool `description`, the only
  place the external model reads).

## Adding a tool

Before changing the tool registry, read [the MCP capability documentation contract](docs/CAPABILITY-DOCUMENTATION.md). Every registered tool must have exactly one task-oriented page in `docs/capabilities/`; update that page, the index, and the coverage test in the same change.

1. Add (or extend) `src/tools/<name>.ts` with `register<Name>Tools(server, client)`.
2. If it hits a new endpoint, add a method to `src/client.ts` with the wire mapping.
3. Import and call the register fn in `src/index.ts`.
4. Add a `*.test.ts` using the mock-fetch (client) / fake-client (tools) harness — no
   network — and add the tool + hints to `annotations.test.ts` and `test/dist-smoke.test.js`.
5. `npm run typecheck && npm test`.

## Releasing

Keep the version in sync across **all** channels in one go (`git push --follow-tags` pushes
the tag but does **not** create a GitHub Release; the registry is immutable per version):

1. Bump `version` in **three places, identically**: `package.json`, and in `server.json`
   **both** the root `version` **and** `packages[0].version`. `mcpName` in `package.json` must
   match `name` in `server.json` (`io.github.A1-x-Tech/mcp-google-drive`). Verify:
   `grep -n '"version"' package.json server.json`.
   > ⚠️ `mcp-publisher` publishes the **root** `server.json.version`. A stale root makes
   > `mcp-publisher publish` fail with a misleading `400 cannot publish duplicate version`
   > while `npm publish` succeeds.
2. Update `CHANGELOG.md`, then `npm publish` (runs typecheck + tests + build via
   `prepublishOnly` / `prepare`; the package is scoped, `publishConfig.access` is already
   `public`).
3. `git commit`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main --follow-tags`.
4. **GitHub Release:** `gh release create vX.Y.Z --title vX.Y.Z --generate-notes --verify-tag`.
5. **Official MCP registry:** `mcp-publisher publish` (login with
   `mcp-publisher login github --token "$(gh auth token)"`).
