# Google Drive: Raw API call — MCP tool

**Google Drive MCP tool:** Escape hatch to any Google Drive API v3 endpoint the typed tools do not cover.

Technical name: `raw_request`

## What task it solves

> I want to call a Drive API endpoint that has no dedicated tool.

Sends an authenticated request to any Drive API v3 path — revisions, the changes feed, shortcut creation, emptying the trash, resumable upload sessions and everything else.

## When to use it

Use it only when no typed tool covers the need: e.g. `drive/v3/files/<fileId>/revisions`, `drive/v3/changes?pageToken=...`, POST `drive/v3/files` with `shortcutDetails`, DELETE `drive/v3/files/trash`, or POST `upload/drive/v3/files?uploadType=resumable`.

## What to provide

- `path` — **required**. Relative to `https://www.googleapis.com`, query string allowed (remember `supportsAllDrives=true` for shared-drive items).
- `method` — **optional**: GET (default), POST, PATCH or DELETE.
- `body` — **optional** JSON body for POST/PATCH.

## What it returns

The endpoint's JSON response verbatim. Binary media does not belong here — `download_file`/`export_file` handle bytes.

## What changes in Google Drive

Whatever the chosen endpoint does — including permanent deletion and trash purging. The tool is annotated for the worst case a call can perform; treat every non-GET call as a real write.

## Example request

> Use a raw Drive API call to list the revisions of this file.

## Errors and limitations

The path must stay on the API host: anything resolving to a foreign origin is rejected before the request is sent, so the OAuth token cannot leak. Writes are never retried after a 5xx or timeout.

## Related MCP tools

- Every typed tool in [the catalog](./index.md) — prefer them when one fits.

## Technical details

- **Impact:** destructive operation
- **Group:** Additional API methods
- **Description source:** `raw_request` registration in `src/tools/raw.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
