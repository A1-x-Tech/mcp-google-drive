import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { DESTRUCTIVE, fail, fileIdSchema, ok } from "./util.js";

export function registerPermissionTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "manage_permissions",
    {
      title: "Manage sharing & permissions",
      // One tool covers list/share/update/remove; remove revokes access, so the
      // whole tool carries the destructive, non-idempotent hints.
      annotations: DESTRUCTIVE,
      description:
        "Manages who can access a file. action=list shows the grants (id, type, role, emailAddress/domain, expirationTime, pendingOwner). action=share grants access: type=user/group (needs email_address), domain (needs domain), or anyone (link sharing; allow_file_discovery=true also makes it searchable); role=reader, commenter, writer, fileOrganizer/organizer (shared drives only) or owner. Sharing with a user emails them by default — send_notification_email=false suppresses it (not allowed for ownership transfers); email_message adds a note. action=update changes an existing grant's role (needs permission_id from list); action=remove revokes it. Ownership transfer: role=owner with transfer_ownership=true — between personal accounts this only INVITES the new owner (pendingOwner until they accept). Changes are live immediately; removing your own access to someone else's file is irreversible from your side. role=owner/organizer grants full control including permanent deletion — prefer writer or less.",
      inputSchema: {
        file_id: fileIdSchema(),
        action: z.enum(["list", "share", "update", "remove"]).describe("What to do with the file's permissions."),
        role: z
          .enum(["reader", "commenter", "writer", "fileOrganizer", "organizer", "owner"])
          .optional()
          .describe("share/update: the access level. fileOrganizer/organizer exist only on shared drives; owner transfers ownership."),
        type: z
          .enum(["user", "group", "domain", "anyone"])
          .optional()
          .describe("share only: who the grant is for. user/group need email_address; domain needs domain; anyone = link sharing."),
        email_address: z.string().email().optional().describe("share with type=user/group: the grantee's email address."),
        domain: z.string().optional().describe("share with type=domain: the Workspace domain, e.g. example.com."),
        allow_file_discovery: z
          .boolean()
          .optional()
          .describe("share with type=domain/anyone: whether the file can be FOUND by search (default false = link only)."),
        send_notification_email: z
          .boolean()
          .optional()
          .describe("share with type=user/group: send the notification email (API default true; must stay true for ownership transfer)."),
        email_message: z.string().optional().describe("share: a custom note for the notification email."),
        transfer_ownership: z
          .boolean()
          .optional()
          .describe("share with role=owner: confirm the ownership transfer (required by the API for role=owner)."),
        permission_id: z.string().optional().describe("update/remove: the permission id from action=list."),
        expiration_time: z
          .string()
          .optional()
          .describe("update: RFC3339 expiry for the grant, e.g. 2026-12-31T00:00:00Z (not available for owners)."),
        page_token: z.string().optional().describe("list: nextPageToken from the previous page."),
      },
    },
    async (args) => {
      try {
        switch (args.action) {
          case "list":
            return ok(await client.listPermissions(args.file_id, args.page_token));
          case "share": {
            if (!args.role || !args.type) {
              return fail(new Error('action "share" requires role and type.'));
            }
            if ((args.type === "user" || args.type === "group") && !args.email_address) {
              return fail(new Error(`type "${args.type}" requires email_address.`));
            }
            if (args.type === "domain" && !args.domain) {
              return fail(new Error('type "domain" requires domain.'));
            }
            return ok(
              await client.createPermission({
                fileId: args.file_id,
                role: args.role,
                type: args.type,
                emailAddress: args.email_address,
                domain: args.domain,
                allowFileDiscovery: args.allow_file_discovery,
                sendNotificationEmail: args.send_notification_email,
                emailMessage: args.email_message,
                transferOwnership: args.transfer_ownership,
              }),
            );
          }
          case "update":
            if (!args.permission_id || !args.role) {
              return fail(new Error('action "update" requires permission_id and role.'));
            }
            return ok(
              await client.updatePermission({
                fileId: args.file_id,
                permissionId: args.permission_id,
                role: args.role,
                expirationTime: args.expiration_time,
              }),
            );
          case "remove":
            if (!args.permission_id) return fail(new Error('action "remove" requires permission_id.'));
            return ok(await client.deletePermission(args.file_id, args.permission_id));
        }
      } catch (e) {
        return fail(e);
      }
    },
  );
}
