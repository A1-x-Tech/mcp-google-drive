import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GoogleDriveClient } from "../client.js";
import { GOOGLE_APPS_PREFIX } from "../types.js";
import { fail, fileIdSchema, folderIdSchema, localPathSchema, ok, READ_ONLY, safeLocalPath, WRITE } from "./util.js";

/**
 * Cap for returning file content inline in a tool result. The consumer is an
 * LLM: anything bigger burns context without being readable in one piece, so
 * larger content must go to a local file via save_path.
 */
export const MAX_INLINE_BYTES = 100_000;

/** True when a mimeType is safe to return as UTF-8 text in a tool result. */
export function looksTextual(mimeType: string): boolean {
  const mime = mimeType.split(";")[0]!.trim().toLowerCase();
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** Best-effort mimeType from a file extension; octet-stream when unknown. */
export function guessMimeType(path: string): string {
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Reads a local file for upload; a clear error instead of ENOENT/EISDIR noise. */
async function readLocalFile(path: string): Promise<Buffer> {
  const resolved = safeLocalPath(path);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error(`Local file not found: ${resolved}`);
  }
  if (!info.isFile()) throw new Error(`Not a regular file: ${resolved}`);
  return readFile(resolved);
}

/**
 * Writes downloaded/exported bytes to a local file. Refuses to overwrite an
 * existing file unless asked — a download must never silently destroy local
 * data; the parent directory is created when missing.
 */
async function writeLocalFile(path: string, buf: Buffer, overwrite: boolean | undefined): Promise<string> {
  const resolved = safeLocalPath(path);
  await mkdir(dirname(resolved), { recursive: true });
  try {
    await writeFile(resolved, buf, { flag: overwrite ? "w" : "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`${resolved} already exists — pass overwrite=true to replace it.`);
    }
    throw err;
  }
  return resolved;
}

/** Either saves the bytes locally or returns them inline (small textual content only). */
async function deliverBytes(
  buf: Buffer,
  contentType: string,
  meta: Record<string, unknown>,
  savePath: string | undefined,
  overwrite: boolean | undefined,
): Promise<Record<string, unknown>> {
  if (savePath) {
    const saved = await writeLocalFile(savePath, buf, overwrite);
    return { ...meta, saved_to: saved, bytes: buf.byteLength, content_type: contentType };
  }
  if (!looksTextual(contentType)) {
    throw new Error(
      `The content is binary (${contentType}) and cannot be returned inline — pass save_path (an absolute local path) to write it to disk.`,
    );
  }
  if (buf.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      `The content is ${buf.byteLength} bytes — over the ${MAX_INLINE_BYTES}-byte inline cap. Pass save_path (an absolute local path) to write it to disk instead.`,
    );
  }
  return { ...meta, bytes: buf.byteLength, content_type: contentType, content: buf.toString("utf8") };
}

export function registerContentTools(server: McpServer, client: GoogleDriveClient): void {
  server.registerTool(
    "upload_file",
    {
      title: "Upload file content",
      annotations: WRITE,
      description:
        "Uploads content to Drive and returns the file's metadata. Without file_id it CREATES a new file (name required; parent_id places it); with file_id it REPLACES that file's content in place (same id, new bytes) — name/parent_id are ignored then. The bytes come from exactly one of `content` (inline UTF-8 text) or `local_path` (absolute path to a local file). mime_type describes the uploaded bytes (default: text/plain for content, guessed from the extension for local_path). convert_to=document|spreadsheet|presentation imports the bytes into an editable Google Doc/Sheet/Slides (e.g. a .docx or .csv becomes native; export back with export_file). Cap: 5 MB per upload (multipart) — larger files need a resumable session via raw_request. A retry after an ambiguous failure without file_id would create a duplicate — search_files first.",
      inputSchema: {
        name: z.string().min(1).optional().describe("File name in Drive — required when creating (no file_id)."),
        parent_id: folderIdSchema().optional().describe("Folder for the new file (create only; omitted = My Drive root)."),
        content: z.string().optional().describe("Inline UTF-8 text content — for small text files. Exactly one of content/local_path."),
        local_path: localPathSchema().optional().describe("Absolute local path to read the bytes from. Exactly one of content/local_path."),
        mime_type: z.string().optional().describe("mimeType of the uploaded bytes (default: text/plain for content, extension-based for local_path)."),
        convert_to: z
          .enum(["document", "spreadsheet", "presentation"])
          .optional()
          .describe("Import into a Google-native editable file: document (Doc), spreadsheet (Sheet), presentation (Slides)."),
        file_id: fileIdSchema().optional().describe("Existing file whose CONTENT to replace (omit to create a new file)."),
      },
    },
    async ({ name, parent_id, content, local_path, mime_type, convert_to, file_id }) => {
      try {
        if ((content === undefined) === (local_path === undefined)) {
          return fail(new Error("Provide exactly one of content (inline text) or local_path (absolute path)."));
        }
        if (!file_id && !name) {
          return fail(new Error("name is required when creating a new file (no file_id)."));
        }
        const media = local_path !== undefined ? await readLocalFile(local_path) : Buffer.from(content as string, "utf8");
        const mediaMimeType = mime_type ?? (local_path !== undefined ? guessMimeType(local_path) : "text/plain");
        return ok(
          await client.uploadFile({
            fileId: file_id,
            name,
            parentId: parent_id,
            media,
            mediaMimeType,
            convertTo: convert_to,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "download_file",
    {
      title: "Download file content",
      annotations: READ_ONLY,
      description:
        "Downloads a binary file's bytes. With save_path (absolute local path) the file is written to disk (refuses to overwrite unless overwrite=true) and the result reports saved_to/bytes; without save_path small textual files (≤100 KB, text/JSON/XML) are returned inline as `content`. Google-native files (Docs/Sheets/Slides — mimeType application/vnd.google-apps.*) have no bytes: this tool rejects them, use export_file; for a shortcut it names the real target to download instead. acknowledge_abuse=true downloads a file Drive flagged as malware/abuse (owner only).",
      inputSchema: {
        file_id: fileIdSchema(),
        save_path: localPathSchema().optional().describe("Absolute local path to write the file to (required for binary or >100 KB content)."),
        overwrite: z.boolean().optional().describe("Replace save_path if it already exists (default false)."),
        acknowledge_abuse: z.boolean().optional().describe("Download even though Drive flagged the file as abusive (owner only)."),
      },
    },
    async ({ file_id, save_path, overwrite, acknowledge_abuse }) => {
      try {
        const meta = (await client.getFile(file_id, "id,name,mimeType,size,shortcutDetails")) as {
          id?: string;
          name?: string;
          mimeType?: string;
          shortcutDetails?: { targetId?: string; targetMimeType?: string };
        };
        const mime = meta.mimeType ?? "";
        if (mime === `${GOOGLE_APPS_PREFIX}shortcut`) {
          return fail(
            new Error(
              `This is a shortcut, not the file itself — download its target instead: file_id ${meta.shortcutDetails?.targetId} (${meta.shortcutDetails?.targetMimeType}).`,
            ),
          );
        }
        if (mime.startsWith(GOOGLE_APPS_PREFIX)) {
          return fail(
            new Error(
              `${mime} is a Google-native file with no binary content — use export_file with a target mime_type (e.g. text/markdown, text/csv, application/pdf).`,
            ),
          );
        }
        const { buf, contentType } = await client.download(file_id, { acknowledgeAbuse: acknowledge_abuse });
        return ok(
          await deliverBytes(buf, contentType, { id: meta.id, name: meta.name, mime_type: mime }, save_path, overwrite),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "export_file",
    {
      title: "Export a Google Workspace file",
      annotations: READ_ONLY,
      description:
        "Exports (converts) a Google-native file — Doc, Sheet, Slides, Drawing — to a regular format. mime_type picks the target: Docs → text/markdown, text/plain, text/html, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx), application/rtf; Sheets → text/csv (FIRST sheet only), application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (.xlsx); Slides → application/pdf, text/plain, application/vnd.openxmlformats-officedocument.presentationml.presentation (.pptx); Drawings → image/png, image/svg+xml, application/pdf. With save_path the result is written to disk; without it small textual exports (≤100 KB) come back inline as `content`. Export is capped at 10 MB by the API — use the file's exportLinks (get_file) for bigger documents. Binary (non-Google) files are not exportable — use download_file.",
      inputSchema: {
        file_id: fileIdSchema(),
        mime_type: z
          .string()
          .min(1)
          .describe("Target format, e.g. text/markdown, text/csv, application/pdf (see the description for what each Google type supports)."),
        save_path: localPathSchema().optional().describe("Absolute local path to write the export to (required for binary or >100 KB output)."),
        overwrite: z.boolean().optional().describe("Replace save_path if it already exists (default false)."),
      },
    },
    async ({ file_id, mime_type, save_path, overwrite }) => {
      try {
        const { buf, contentType } = await client.exportFile(file_id, mime_type);
        return ok(await deliverBytes(buf, contentType, { id: file_id, export_mime_type: mime_type }, save_path, overwrite));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
