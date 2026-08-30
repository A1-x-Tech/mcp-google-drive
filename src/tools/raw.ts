import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient, HttpMethod } from "../client.js";
import { DESTRUCTIVE, fail, ok } from "./util.js";

export function registerRawTool(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "raw_request",
    {
      title: "Raw Google Drive API call",
      // Full API surface incl. files.delete and emptyTrash — annotate for the
      // worst case a call can do, not the average.
      annotations: DESTRUCTIVE,
      description:
        'Escape hatch to call any Google Drive API v3 path directly, for requests the typed tools don\'t cover — e.g. revisions ("drive/v3/files/<fileId>/revisions"), changes ("drive/v3/changes?pageToken=..."), shortcut creation (POST "drive/v3/files" with shortcutDetails), emptying the trash (DELETE "drive/v3/files/trash"), generateIds, or starting a resumable upload session (POST "upload/drive/v3/files?uploadType=resumable"). The path is relative to https://www.googleapis.com and may carry a query string (remember supportsAllDrives=true for shared-drive items). The Bearer token is added automatically; the method defaults to GET; the response must be JSON (binary media downloads belong to download_file/export_file).',
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe('API path relative to https://www.googleapis.com, e.g. "drive/v3/files/<fileId>/revisions?fields=*".'),
        method: z
          .enum(["GET", "POST", "PATCH", "DELETE"])
          .optional()
          .describe("HTTP method (the Drive API uses these four). Defaults to GET."),
        body: z.record(z.any()).optional().describe("JSON request body (POST/PATCH only)."),
      },
    },
    async ({ path, method, body }) => {
      try {
        const m = (method ?? "GET") as HttpMethod;
        return ok(await client.request(m, path, body));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
