# Development

## Requirements

- Node.js 20+ (the published package ships compiled `dist/`; `npx` needs no separate
  install). CI runs the suite on Node 20, 22 and 24.

## Commands

```bash
npm install
npm run dev        # run from source with tsx watch
npm test           # unit tests (node:test) + dist smoke, no network
npm run typecheck  # type-check src + tests (no emit)
npm run build      # clean dist/ and compile with tsc
npm run smoke      # live check (see below)
```

## Local run

```bash
npm run build
GOOGLE_DRIVE_CLIENT_ID=... GOOGLE_DRIVE_CLIENT_SECRET=... GOOGLE_DRIVE_REFRESH_TOKEN=... \
  node dist/index.js
# or, for a quick session with a short-lived token:
GOOGLE_DRIVE_ACCESS_TOKEN=$(gcloud auth print-access-token) node dist/index.js
# optional: GOOGLE_DRIVE_API_BASE, GOOGLE_DRIVE_TIMEOUT_MS, GOOGLE_DRIVE_MAX_RETRIES
```

## Live smoke

`npm run smoke` is READ-ONLY by default: it calls `about` (who the token belongs to)
and, with a file id (first argv or `GOOGLE_DRIVE_SMOKE_FILE_ID`), fetches that file's
metadata — nothing is written.

`GOOGLE_DRIVE_SMOKE_WRITE=1` opts into the full write scenario on **disposable
resources only**: a uniquely named folder is created, a small file is uploaded,
renamed, copied, downloaded, trashed and restored inside it, and the folder is
permanently deleted in a `finally` block — cleanup runs after success and failure
alike, and only ever touches the resources that run created.

## Tests

Unit tests mock `globalThis.fetch` (client) or use a fake server + fake client (tools), so
the whole suite runs offline — including the OAuth refresh flow, whose token endpoint is
served by the same fetch stub, and the local-path handling, which uses per-test temp dirs.
`test/dist-smoke.test.js` additionally spawns the built `dist/index.js` and performs a real
MCP handshake over stdio through the official SDK, asserting the server identity and the
full tool list. Put a `*.test.ts` next to the code it covers; `npm run typecheck && npm test`
is the gate (also run by `prepublishOnly`).

## Usage telemetry

The server sends anonymous events to `usage.gistrec.cloud` (`server_start` when a client
connects to a configured install, `unconfigured_start` when a client connects to a server
without credentials, `tool_call` with the tool **name**, and `startup_failed` with a
fixed-vocabulary reason code when the configuration is malformed) to count active installs
and tool demand. An event carries only impersonal technical fields: a random installation id
(`~/.config/mcp-google-drive/instance-id`), the package version, the AI client's name and
version from the MCP handshake, the Node.js version and the OS.

OAuth credentials, file data and names, tool arguments and prompts are never sent or stored
(implementation: `src/telemetry.ts`). Sends run in the background with a 2 s timeout and are
silently skipped on any error. Opt out for all servers of this line at once:
`ASKADS_TELEMETRY=0`.
