# Google Drive: List shared drives — MCP tool

**Google Drive MCP tool:** Lists the shared drives the authorized account is a member of.

Technical name: `list_shared_drives`

## What task it solves

> I want to see which shared drives I can work with.

Lists shared drives (formerly Team Drives) with their ids, so their contents can be searched and organized.

## When to use it

Use it when a file lives in a team space rather than in My Drive: take a drive's id and pass it as `drive_id` to `search_files`, or as `parent_id` to list/create at the drive's root.

## What to provide

- `name_contains` — **optional**. Filter by drive name.
- `page_size` (1..100), `page_token` — **optional** pagination.

## What it returns

`drives[]` with id, name and createdTime, plus `nextPageToken`.

## What changes in Google Drive

Nothing — this is a pure read.

## Example request

> List my shared drives in Google Drive and find the one for the marketing team.

## Errors and limitations

My Drive is not a shared drive and never appears here. An empty list means the account is not a member of any shared drive — it is not proof that none exist in the organization.

## Related MCP tools

- [Search and list files](./search-files.md) — browse a drive's contents with `drive_id`.

## Technical details

- **Impact:** read-only
- **Group:** Search
- **Description source:** `list_shared_drives` registration in `src/tools/search.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
