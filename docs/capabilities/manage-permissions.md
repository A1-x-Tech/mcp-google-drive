# Google Drive: Manage sharing and permissions — MCP tool

**Google Drive MCP tool:** Lists, grants, changes and revokes access to a file — users, groups, domains or anyone with the link.

Technical name: `manage_permissions`

## What task it solves

> I want to control who can access a file.

One tool for the whole sharing lifecycle: `action=list` shows the grants, `share` adds one, `update` changes a role, `remove` revokes it.

## When to use it

Use it to share a file with a teammate, open link access, audit who can see a document, downgrade or revoke access, or transfer ownership.

## What to provide

- `file_id` — **required**; `action` — **required**: `list`, `share`, `update` or `remove`.
- `share`: `role` (reader/commenter/writer/fileOrganizer/organizer/owner) + `type` (user/group/domain/anyone), with `email_address` for user/group, `domain` for domain, `allow_file_discovery` for domain/anyone; optional `send_notification_email` and `email_message`; `transfer_ownership=true` with role=owner.
- `update`/`remove`: `permission_id` from `action=list` (+ `role`, optional `expiration_time` for update).

## What it returns

The permission objects: id, type, role, emailAddress/domain, displayName, expirationTime, pendingOwner.

## What changes in Google Drive

Access changes take effect immediately for real people. `remove` revokes access on the spot; removing your own access to someone else's file cannot be undone from your side — that is why the whole tool is flagged destructive.

## Example request

> Share the roadmap doc in Google Drive with anna@example.com as a commenter, without the notification email.

## Errors and limitations

fileOrganizer/organizer exist only on shared drives. Ownership transfer between personal accounts only invites the new owner (`pendingOwner`) until they accept, and the notification email cannot be suppressed for it. role=owner/organizer grants full control including permanent deletion — prefer writer or less.

## Related MCP tools

- [Get file metadata](./get-file.md) — `capabilities.canShare` says whether sharing is allowed at all.

## Technical details

- **Impact:** destructive operation
- **Group:** Sharing
- **Description source:** `manage_permissions` registration in `src/tools/permissions.ts`
- [Full technical reference](../TOOLS.md)
- [All MCP capabilities](./index.md)
