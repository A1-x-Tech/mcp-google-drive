import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { fail, fileIdSchema, folderIdSchema, ok, READ_ONLY, UPDATE, WRITE } from "./util.js";

export function registerFileTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "get_file",
    {
      title: "Get file metadata",
      annotations: READ_ONLY,
      description:
        "Returns a file's metadata (never its content — that is download_file/export_file): id, name, mimeType, size, parents, driveId, createdTime/modifiedTime, trashed, starred, description, md5Checksum, webViewLink, webContentLink, exportLinks (for Google-native files), owners, lastModifyingUser, shortcutDetails (a shortcut's real target id/mimeType) and capabilities (canEdit/canShare/canTrash/canDelete/canDownload — check before mutating). Google-native files (mimeType application/vnd.google-apps.*) report no size and no md5Checksum. Pass fields to select a custom projection (Drive fields syntax) when the default set is too much or too little.",
      inputSchema: {
        file_id: fileIdSchema(),
        fields: z
          .string()
          .optional()
          .describe('Custom Drive fields projection, e.g. "id,name,permissions(id,role,emailAddress)". Defaults to a rich metadata set.'),
      },
    },
    async ({ file_id, fields }) => {
      try {
        return ok(await client.getFile(file_id, fields));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_folder",
    {
      title: "Create a folder",
      annotations: WRITE,
      description:
        "Creates a folder (a Drive file with mimeType application/vnd.google-apps.folder) and returns its id, name, parents and webViewLink. parent_id places it inside a folder or a shared drive ('root' or omitted = My Drive top level). Drive allows several folders with the same name in the same parent — search_files first if the folder might already exist, and reuse its id instead of creating a duplicate.",
      inputSchema: {
        name: z.string().min(1).describe("The folder name (not required to be unique, even within one parent)."),
        parent_id: folderIdSchema().optional().describe("Parent folder or shared-drive id; omitted = My Drive root."),
      },
    },
    async ({ name, parent_id }) => {
      try {
        return ok(await client.createFolder({ name, parentId: parent_id }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "copy_file",
    {
      title: "Copy a file",
      annotations: WRITE,
      description:
        "Copies a file and returns the new copy's metadata (a fresh fileId — the original is untouched). name renames the copy (default: same name as the original, NOT 'Copy of ...'); parent_id places it in a folder (default: same parent as the original for My Drive files). Works on Google-native files (Docs/Sheets/Slides) and binaries alike, but folders cannot be copied — recreate the tree with create_folder + copy_file per file. Comments and permissions are not copied. Each retry would create another copy, so after an ambiguous failure check with search_files before calling again.",
      inputSchema: {
        file_id: fileIdSchema(),
        name: z.string().optional().describe("Name for the copy (defaults to the original's name)."),
        parent_id: folderIdSchema().optional().describe("Folder for the copy (defaults to the original's parent)."),
      },
    },
    async ({ file_id, name, parent_id }) => {
      try {
        return ok(await client.copyFile({ fileId: file_id, name, parentId: parent_id }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "move_file",
    {
      title: "Move a file",
      annotations: UPDATE,
      description:
        "Moves a file or folder into another folder (or shared drive) and returns id, name and the new parents. By default the file leaves all its current parents (a plain move); keep_existing_parents=true only adds the new parent — note that files in shared drives always have exactly one parent, so keeping old parents fails there. Moving between My Drive and a shared drive changes ownership rules and may be rejected by the drive's settings. The move costs one extra read (the current parents are fetched first).",
      inputSchema: {
        file_id: fileIdSchema(),
        new_parent_id: folderIdSchema().describe("Destination folder or shared-drive id ('root' = My Drive top level)."),
        keep_existing_parents: z
          .boolean()
          .optional()
          .describe("Add the new parent without removing the old ones (My Drive only; default false = a real move)."),
      },
    },
    async ({ file_id, new_parent_id, keep_existing_parents }) => {
      try {
        return ok(
          await client.moveFile({
            fileId: file_id,
            newParentId: new_parent_id,
            keepExistingParents: keep_existing_parents,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_file_metadata",
    {
      title: "Rename / update file metadata",
      annotations: UPDATE,
      description:
        "Renames a file and/or updates its description and starred flag — metadata only, the content is untouched (that is upload_file with file_id). Only the provided fields change; at least one is required. Works on folders too (folders are files). Returns id, name, description, starred and the new modifiedTime. Moving lives in move_file, trashing in trash_file.",
      inputSchema: {
        file_id: fileIdSchema(),
        name: z.string().min(1).optional().describe("New file name (the extension is part of the name — keep it unless you mean to change it)."),
        description: z.string().optional().describe("New description (shown in the Drive details pane; searchable via full text)."),
        starred: z.boolean().optional().describe("Star or unstar the file."),
      },
    },
    async ({ file_id, name, description, starred }) => {
      try {
        return ok(await client.updateFileMetadata({ fileId: file_id, name, description, starred }));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
