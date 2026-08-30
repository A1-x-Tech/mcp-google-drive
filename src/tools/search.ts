import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { fail, folderIdSchema, ok, READ_ONLY } from "./util.js";

export function registerSearchTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "search_files",
    {
      title: "Search and list files",
      annotations: READ_ONLY,
      description:
        "Searches and lists files and folders: id, name, mimeType, size, parents, driveId, modifiedTime, trashed, starred, webViewLink and shortcutDetails per file, plus nextPageToken. The convenience filters (name_contains, full_text_contains, mime_type, parent_id, only_folders) are AND-ed together and with the raw Drive `query` expression (q syntax, e.g. \"modifiedTime > '2026-01-01T00:00:00'\"). Trashed files are hidden unless include_trashed=true. Names are NOT unique in Drive — expect several hits and pick by id. parent_id lists a folder's direct children (use 'root' for My Drive's top level). Shared drives: pass drive_id to search one drive, or include_all_drives=true to search everything at once. Paginate with page_token; order_by e.g. 'modifiedTime desc,name'. incompleteSearch=true in the result means some corpora were skipped — narrow the search.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            "Raw Drive search expression (q syntax), AND-ed with the other filters, e.g. \"modifiedTime > '2026-01-01T00:00:00' and not name contains 'draft'\".",
          ),
        name_contains: z.string().optional().describe("Substring match on the file name (case-insensitive prefix matching per word)."),
        full_text_contains: z.string().optional().describe("Full-text match over the file's content and description."),
        mime_type: z
          .string()
          .optional()
          .describe(
            "Exact mimeType, e.g. application/pdf, application/vnd.google-apps.document (Google Doc), application/vnd.google-apps.spreadsheet (Google Sheet).",
          ),
        parent_id: folderIdSchema().optional().describe("Only direct children of this folder ('root' = My Drive top level)."),
        only_folders: z.boolean().optional().describe("Only folders (mimeType application/vnd.google-apps.folder)."),
        include_trashed: z.boolean().optional().describe("Include trashed files (default false — the trash is a separate view, as in the Drive UI)."),
        order_by: z
          .string()
          .optional()
          .describe("Sort keys: createdTime, folder, modifiedTime, name, quotaBytesUsed, recency, starred; add ' desc' to reverse, e.g. 'modifiedTime desc,name'."),
        page_size: z.number().int().min(1).max(1000).optional().describe("Files per page (1..1000; API default 100)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
        drive_id: z.string().optional().describe("Search only this shared drive."),
        include_all_drives: z
          .boolean()
          .optional()
          .describe("Search My Drive and every shared drive together (slower; ignored when drive_id is set)."),
      },
    },
    async (args) => {
      try {
        return ok(
          await client.listFiles({
            query: args.query,
            nameContains: args.name_contains,
            fullTextContains: args.full_text_contains,
            mimeType: args.mime_type,
            parentId: args.parent_id,
            onlyFolders: args.only_folders,
            includeTrashed: args.include_trashed,
            orderBy: args.order_by,
            pageSize: args.page_size,
            pageToken: args.page_token,
            driveId: args.drive_id,
            includeAllDrives: args.include_all_drives,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_shared_drives",
    {
      title: "List shared drives",
      annotations: READ_ONLY,
      description:
        "Lists the shared drives (formerly Team Drives) the authorized user is a member of: id, name, createdTime, plus nextPageToken. Use a drive's id as drive_id in search_files to browse its contents, or as parent_id to list its root. name_contains filters by name. My Drive is not a shared drive and never appears here.",
      inputSchema: {
        name_contains: z.string().optional().describe("Only shared drives whose name contains this substring."),
        page_size: z.number().int().min(1).max(100).optional().describe("Drives per page (1..100; API default 10)."),
        page_token: z.string().optional().describe("nextPageToken from the previous page."),
      },
    },
    async ({ name_contains, page_size, page_token }) => {
      try {
        return ok(
          await client.listSharedDrives({ nameContains: name_contains, pageSize: page_size, pageToken: page_token }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
