import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { DESTRUCTIVE, fail, fileIdSchema, ok } from "./util.js";

export function registerCommentTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "manage_comments",
    {
      title: "Manage file comments",
      // One tool covers the whole comment lifecycle; delete removes state, so
      // the whole tool carries the destructive, non-idempotent hints.
      annotations: DESTRUCTIVE,
      description:
        "Manages Drive comments on a file (Docs, Sheets, Slides, PDFs, images...). action=list pages through comments with their replies and resolved state (page_token; include_deleted shows tombstones); get fetches one (needs comment_id). create adds a comment (needs content; quoted_text attaches the passage it refers to — display only; positional anchoring inside a Doc's text is not possible through this API, such comments appear file-level). reply answers a thread (needs comment_id + content). resolve / reopen close or reopen a thread (need comment_id; optional content adds a closing note). delete removes a comment and its replies permanently (needs comment_id; author only). Comments carry author, createdTime/modifiedTime, resolved and quotedFileContent. Not for Docs suggestions — those are a Docs feature this API cannot touch.",
      inputSchema: {
        file_id: fileIdSchema(),
        action: z
          .enum(["list", "get", "create", "reply", "resolve", "reopen", "delete"])
          .describe("What to do with the file's comments."),
        comment_id: z.string().optional().describe("get/reply/resolve/reopen/delete: the comment id (from action=list)."),
        content: z
          .string()
          .optional()
          .describe("create/reply: the comment text (plain text). Optional closing note for resolve/reopen."),
        quoted_text: z
          .string()
          .optional()
          .describe("create only: the file passage the comment refers to (shown as a quote; does not position the comment)."),
        anchor: z.string().optional().describe("create only: a Drive anchor JSON string for region-anchorable media (rarely needed)."),
        page_size: z.number().int().min(1).max(100).optional().describe("list: comments per page (1..100; API default 20)."),
        page_token: z.string().optional().describe("list: nextPageToken from the previous page."),
        include_deleted: z.boolean().optional().describe("list: include deleted comments as tombstones (default false)."),
      },
    },
    async (args) => {
      try {
        const need = (field: string) => fail(new Error(`action "${args.action}" requires ${field}.`));
        switch (args.action) {
          case "list":
            return ok(
              await client.listComments({
                fileId: args.file_id,
                pageSize: args.page_size,
                pageToken: args.page_token,
                includeDeleted: args.include_deleted,
              }),
            );
          case "get":
            if (!args.comment_id) return need("comment_id");
            return ok(await client.getComment(args.file_id, args.comment_id));
          case "create":
            if (!args.content) return need("content");
            return ok(
              await client.createComment({
                fileId: args.file_id,
                content: args.content,
                quotedText: args.quoted_text,
                anchor: args.anchor,
              }),
            );
          case "reply":
            if (!args.comment_id) return need("comment_id");
            if (!args.content) return need("content");
            return ok(
              await client.replyToComment({
                fileId: args.file_id,
                commentId: args.comment_id,
                content: args.content,
              }),
            );
          case "resolve":
          case "reopen":
            if (!args.comment_id) return need("comment_id");
            return ok(
              await client.replyToComment({
                fileId: args.file_id,
                commentId: args.comment_id,
                content: args.content,
                action: args.action,
              }),
            );
          case "delete":
            if (!args.comment_id) return need("comment_id");
            return ok(await client.deleteComment(args.file_id, args.comment_id));
        }
      } catch (e) {
        return fail(e);
      }
    },
  );
}
