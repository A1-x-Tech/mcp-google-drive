<p align="center">
  <img src="assets/a1-logo.svg" alt="A1 x Tech" width="72" />
</p>

# mcp-google-drive

MCP server for the **Google Drive API v3** (TypeScript, stdio). Search and organize
files and folders (incl. shared drives), upload/download content, export
Docs/Sheets/Slides to Markdown/CSV/PDF/Office formats, manage the trash separately
from permanent deletion, and control sharing and comments — from Claude, Cursor,
Codex and other MCP clients.

> Technical README for the development handoff. Full user-facing documentation,
> marketing copy and publication are the next task.

## Quick start

```jsonc
// MCP client config (Claude Desktop / Cursor / ...)
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "…",
        "GOOGLE_DRIVE_CLIENT_SECRET": "…",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "…"
      }
    }
  }
}
```

Alternative for a quick session: `GOOGLE_DRIVE_ACCESS_TOKEN` with a short-lived token
(e.g. `gcloud auth print-access-token`). Without any credentials the server still starts,
completes the MCP handshake and explains exactly which variables to set — the first tool
call fails with that same actionable message instead of a dead server.

Minimal OAuth scopes: `drive.file` (app-created files), `drive.readonly` (reads only) or
`drive` (full surface) — see [docs/TOOLS.md](docs/TOOLS.md#oauth-scopes).

## Tools (15)

| Group | Tools |
|---|---|
| Search | `search_files`, `list_shared_drives` |
| Files | `get_file`, `create_folder`, `copy_file`, `move_file`, `update_file_metadata` |
| Content | `upload_file` (≤5 MB multipart, Workspace import), `download_file`, `export_file` |
| Trash / deletion | `trash_file` (reversible), `delete_file_forever` (permanent — separate on purpose) |
| Sharing & comments | `manage_permissions`, `manage_comments` |
| Escape hatch | `raw_request` (any Drive v3 path, SSRF-guarded) |

Task-oriented pages: [docs/capabilities/](docs/capabilities/index.md) ·
Technical reference: [docs/TOOLS.md](docs/TOOLS.md)

## Engineering notes

- **Degraded start** — configuration problems never kill the process before the handshake.
- **Write safety** — 429 retried with backoff for every method; 5xx/network retries only for
  GET, so a copy/upload/delete is never replayed after an ambiguous failure.
- **Token lifecycle** — refresh-token flow with caching, concurrent-refresh dedup and a
  single forced re-mint + replay on 401.
- **SSRF guard** — every path resolves against `https://www.googleapis.com`; foreign origins
  are rejected before the Bearer token is attached.
- **Local path safety** — absolute paths only, no silent overwrites, 100 KB inline cap.
- **No secrets in logs** — credentials, tokens and file content never reach stdout, stderr
  or telemetry.

## Development

```bash
npm install
npm run typecheck && npm test   # offline: mocked fetch + dist MCP handshake smoke
npm run smoke                   # live read-only check; GOOGLE_DRIVE_SMOKE_WRITE=1 = disposable write scenario
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), [docs/PUBLISHING.md](docs/PUBLISHING.md)
and [CLAUDE.md](CLAUDE.md) (architecture & conventions).

## Telemetry

Anonymous usage pings (event/tool names, versions, random instance id — never data,
arguments or credentials) to `usage.gistrec.cloud`. Opt out: `ASKADS_TELEMETRY=0`.

## License

[MIT](LICENSE) © A1 x Tech
