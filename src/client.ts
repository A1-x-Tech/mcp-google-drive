import { randomBytes } from "node:crypto";
import type { ConvertTarget, GoogleDriveConfig, PermissionRole, PermissionType } from "./types.js";
import { FOLDER_MIME_TYPE, GoogleDriveError } from "./types.js";
import { CredentialsError } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** Google's OAuth2 token endpoint — refresh tokens are exchanged here. */
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Simple/multipart uploads are capped by Google at 5 MB; anything larger needs
 * a resumable upload session, which this server leaves to raw_request.
 */
export const MAX_MULTIPART_BYTES = 5 * 1024 * 1024;

/** Maps upload_file's normalized convert_to target to the Google-native wire mimeType. */
export const CONVERT_TARGET_MIME: Record<ConvertTarget, string> = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
};

/** Rich single-file metadata set — get_file, copy_file and upload_file responses. */
const FILE_FIELDS =
  "id,name,mimeType,size,parents,driveId,createdTime,modifiedTime,trashed,starred,description," +
  "md5Checksum,webViewLink,webContentLink,exportLinks,owners(displayName,emailAddress)," +
  "lastModifyingUser(displayName,emailAddress),shortcutDetails," +
  "capabilities(canEdit,canComment,canShare,canTrash,canDelete,canDownload)";

/** Compact per-file set for listings — the consumer is an LLM, so keep pages lean. */
const LIST_FIELDS = "id,name,mimeType,size,parents,driveId,modifiedTime,trashed,starred,webViewLink,shortcutDetails";

/** Permission shape returned by every manage_permissions action. */
const PERMISSION_FIELDS =
  "id,type,role,emailAddress,domain,displayName,expirationTime,deleted,pendingOwner,allowFileDiscovery";

/** Comment shape (the Drive comments endpoints return nothing without an explicit fields). */
const COMMENT_FIELDS =
  "id,content,author(displayName,me),createdTime,modifiedTime,resolved,quotedFileContent(value),anchor,deleted," +
  "replies(id,content,author(displayName,me),createdTime,action,deleted)";

/** Reply shape for replyToComment (resolve/reopen ride on replies too). */
const REPLY_FIELDS = "id,content,author(displayName,me),createdTime,action";

/**
 * Escapes a value for the Drive search query language: backslashes and single
 * quotes would otherwise terminate the term and let user input inject
 * arbitrary query clauses.
 */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Normalized inputs for search_files. */
export interface SearchFilesParams {
  /** Raw Drive q expression, AND-ed with the convenience filters below. */
  query?: string;
  nameContains?: string;
  fullTextContains?: string;
  mimeType?: string;
  parentId?: string;
  onlyFolders?: boolean;
  /** Trashed files are hidden unless this is true. */
  includeTrashed?: boolean;
  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
  /** Search one shared drive (corpora=drive). */
  driveId?: string;
  /** Search My Drive + every shared drive at once (corpora=allDrives; slower). */
  includeAllDrives?: boolean;
}

/**
 * Builds the Drive `q` expression from the normalized search vocabulary. Every
 * user-provided value is escaped; a raw `query` is parenthesized so its OR
 * clauses cannot leak into the AND chain. Trashed files are excluded unless
 * asked for — that mirrors the Drive UI, where the trash is a separate view.
 */
export function buildSearchQuery(p: SearchFilesParams): string {
  const terms: string[] = [];
  if (p.query) terms.push(`(${p.query})`);
  if (p.nameContains) terms.push(`name contains '${escapeQueryValue(p.nameContains)}'`);
  if (p.fullTextContains) terms.push(`fullText contains '${escapeQueryValue(p.fullTextContains)}'`);
  if (p.mimeType) terms.push(`mimeType = '${escapeQueryValue(p.mimeType)}'`);
  if (p.onlyFolders) terms.push(`mimeType = '${FOLDER_MIME_TYPE}'`);
  if (p.parentId) terms.push(`'${escapeQueryValue(p.parentId)}' in parents`);
  if (!p.includeTrashed) terms.push("trashed = false");
  return terms.join(" and ");
}

/**
 * Builds the multipart/related body for a metadata + media upload: part one is
 * the JSON file metadata, part two the raw bytes. The boundary is random so
 * file content can never collide with it in practice.
 */
export function buildMultipartBody(
  metadata: Record<string, unknown>,
  media: Buffer,
  mediaMimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = `mcp_gdrive_${randomBytes(12).toString("hex")}`;
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mediaMimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    body: Buffer.concat([Buffer.from(head, "utf8"), media, Buffer.from(tail, "utf8")]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

interface SendOptions {
  jsonBody?: Record<string, unknown>;
  rawBody?: Buffer;
  contentType?: string;
  query?: Record<string, string | number | boolean | undefined>;
}

export class GoogleDriveClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  /** Cached access token from the refresh flow, with its expiry. */
  private cachedToken?: { value: string; expiresAt: number };
  /** In-flight refresh, deduping concurrent token requests. */
  private refreshInFlight?: Promise<string>;

  constructor(private readonly config: GoogleDriveConfig) {
    this.base = config.apiBase.endsWith("/") ? config.apiBase : config.apiBase + "/";
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
  }

  private canRefresh(): boolean {
    return Boolean(this.config.refreshToken && this.config.clientId && this.config.clientSecret);
  }

  /**
   * Returns a valid Bearer token. With the refresh triple configured, mints an
   * access token from the refresh token and caches it until shortly before it
   * expires (concurrent callers share one in-flight refresh); otherwise the
   * static GOOGLE_DRIVE_ACCESS_TOKEN is used as-is. With neither configured,
   * throws {@link CredentialsError} BEFORE any fetch — a missing setup must
   * never enter the retry/backoff loop or trigger the 401 re-mint, because no
   * amount of retrying mints credentials.
   */
  private async accessToken(forceRefresh = false): Promise<string> {
    if (!this.canRefresh()) {
      if (!this.config.accessToken) throw new CredentialsError();
      return this.config.accessToken;
    }
    if (!forceRefresh && this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.value;
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshAccessToken().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  /** Exchanges the refresh token for a fresh access token at Google's token endpoint. */
  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.clientId as string,
      client_secret: this.config.clientSecret as string,
      refresh_token: this.config.refreshToken as string,
      grant_type: "refresh_token",
    }).toString();

    const { res, buf } = await this.fetchWithTimeout(
      TOKEN_URL,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "oauth2 token refresh",
    );

    const text = buf.toString("utf8");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) throw new GoogleDriveError(res.status, data);

    const token = (data as { access_token?: unknown }).access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OAuth2 token endpoint returned no access_token.");
    }
    const expiresIn = Number((data as { expires_in?: unknown }).expires_in);
    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
    // Refresh 60s ahead of the real expiry so requests never race a dying token.
    this.cachedToken = { value: token, expiresAt: Date.now() + Math.max(ttl - 60, 30) * 1000 };
    return token;
  }

  /** Verifies the OAuth credentials by minting a fresh access token (refresh flow only). */
  async authCheck(): Promise<unknown> {
    if (!this.canRefresh()) {
      throw new Error(
        "authCheck needs the refresh flow (GOOGLE_DRIVE_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN); with a static GOOGLE_DRIVE_ACCESS_TOKEN call about() instead.",
      );
    }
    await this.accessToken(true);
    return { ok: true, auth: "refresh_token" };
  }

  /** Backoff before a retry: honors Retry-After when present, else exponential (capped at 30s). */
  private backoffMs(attempt: number, res?: Response): number {
    const retryAfter = res ? Number(res.headers.get("Retry-After")) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 30) * 1000;
    return Math.min(this.retryBaseMs * 2 ** attempt, 30_000);
  }

  /**
   * fetch with an AbortController timeout. Reads the response body inside the
   * guarded zone so the timeout also covers a slow or drip-feeding body, not
   * just the initial headers. The body is read as bytes, not text — downloads
   * and exports return binary content that a text decode would corrupt.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<{ res: Response; buf: Buffer }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const buf = Buffer.from(await res.arrayBuffer());
      return { res, buf };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Request to "${label}" timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The one transport for every call — JSON, multipart uploads and binary
   * downloads all go through here, so the auth, SSRF guard, timeout and retry
   * gates cannot be bypassed. Auth is a Bearer token (refreshed transparently;
   * a 401 forces one re-mint + retry). 429 is always retried with backoff; 5xx
   * and network errors/timeouts are retried only for GET — the Drive API has
   * real writes, and replaying a POST/PATCH/DELETE after an ambiguous failure
   * could duplicate a copy or upload. Any non-2xx throws {@link GoogleDriveError}.
   */
  private async send(method: HttpMethod, path: string, opts: SendOptions = {}): Promise<{ res: Response; buf: Buffer }> {
    // Guard method !== "GET" keeps undici from crashing on a GET-with-body.
    const hasBody = (opts.jsonBody !== undefined || opts.rawBody !== undefined) && method !== "GET";

    // Resolve the path against the API base, then reject anything that escaped
    // to a foreign origin (an absolute "https://evil/x" or a "\\evil/x" slipped
    // through raw_request) so the Bearer token can never leak to another host.
    const url = new URL(path.replace(/^\//, ""), this.base);
    if (url.origin !== new URL(this.base).origin) {
      throw new Error(`raw_request path must be a relative API path (resolved to foreign origin ${url.origin})`);
    }
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const target = url.toString();

    // Writes must not be replayed on ambiguous failures (see the retry gate below).
    const idempotent = method === "GET";
    let refreshedOn401 = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (hasBody) headers["Content-Type"] = opts.contentType ?? "application/json";

      let res: Response;
      let buf: Buffer;
      try {
        ({ res, buf } = await this.fetchWithTimeout(
          target,
          {
            method,
            headers,
            body: hasBody ? (opts.rawBody ?? JSON.stringify(opts.jsonBody)) : undefined,
          },
          path,
        ));
      } catch (err) {
        // Network error or timeout: the request may or may not have reached the
        // API, so only reads are retried; writes rethrow immediately.
        if (idempotent && attempt < this.maxRetries) {
          await delay(this.backoffMs(attempt));
          continue;
        }
        throw err;
      }

      // An expired/revoked access token: re-mint once and replay. The request
      // never executed, so this is safe for writes too. The replay is not a
      // transient retry — undo the loop's increment so it never spends a slot
      // of the maxRetries budget meant for 429/5xx/network failures.
      if (res.status === 401 && this.canRefresh() && !refreshedOn401) {
        refreshedOn401 = true;
        await this.accessToken(true);
        attempt--;
        continue;
      }

      // 429 means the request was rejected before executing — safe to retry for
      // any method. 5xx is ambiguous (the write may have committed), so it is
      // gated to idempotent requests.
      const transient = res.status === 429 || (idempotent && res.status >= 500 && res.status < 600);
      if (transient && attempt < this.maxRetries) {
        await delay(this.backoffMs(attempt, res));
        continue;
      }

      if (!res.ok) {
        const text = buf.toString("utf8");
        let data: unknown = undefined;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
        }
        throw new GoogleDriveError(res.status, data);
      }
      return { res, buf };
    }
  }

  /**
   * Low-level JSON request to a Drive API path (e.g. "drive/v3/files/abc").
   * The raw_request tool calls this directly; typed methods build on it.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const { buf } = await this.send(method, path, { jsonBody: body, query });
    const text = buf.toString("utf8");
    if (!text) return { ok: true } as T; // 204s (deletes) have no body
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  // ---- Search & listing ----

  /** files.list with the computed q expression; shared-drive support is always on. */
  async listFiles(p: SearchFilesParams): Promise<unknown> {
    return this.request("GET", "drive/v3/files", undefined, compact({
      q: buildSearchQuery(p),
      orderBy: p.orderBy,
      pageSize: p.pageSize,
      pageToken: p.pageToken,
      corpora: p.driveId ? "drive" : p.includeAllDrives ? "allDrives" : undefined,
      driveId: p.driveId,
      includeItemsFromAllDrives: p.driveId || p.includeAllDrives ? true : undefined,
      supportsAllDrives: true,
      fields: `nextPageToken,incompleteSearch,files(${LIST_FIELDS})`,
    }));
  }

  /** drives.list — the shared drives the caller is a member of. */
  async listSharedDrives(p: { pageSize?: number; pageToken?: string; nameContains?: string } = {}): Promise<unknown> {
    return this.request("GET", "drive/v3/drives", undefined, compact({
      pageSize: p.pageSize,
      pageToken: p.pageToken,
      q: p.nameContains ? `name contains '${escapeQueryValue(p.nameContains)}'` : undefined,
      fields: "nextPageToken,drives(id,name,createdTime)",
    }));
  }

  /** about.get — who the token belongs to and the storage quota (read-only). */
  async about(): Promise<unknown> {
    return this.request("GET", "drive/v3/about", undefined, {
      fields: "user(displayName,emailAddress,permissionId),storageQuota",
    });
  }

  // ---- File metadata & organization ----

  /** files.get — rich metadata by default, or the caller's own fields selection. */
  async getFile(fileId: string, fields?: string): Promise<unknown> {
    return this.request("GET", `drive/v3/files/${encodeURIComponent(fileId)}`, undefined, {
      fields: fields || FILE_FIELDS,
      supportsAllDrives: true,
    });
  }

  /** files.create with the folder mimeType — folders are just files in Drive. */
  async createFolder(p: { name: string; parentId?: string }): Promise<unknown> {
    return this.request(
      "POST",
      "drive/v3/files",
      compact({ name: p.name, mimeType: FOLDER_MIME_TYPE, parents: p.parentId ? [p.parentId] : undefined }),
      { supportsAllDrives: true, fields: "id,name,mimeType,parents,driveId,webViewLink" },
    );
  }

  /** files.copy — a new fileId; Google-native files are copyable, folders are not. */
  async copyFile(p: { fileId: string; name?: string; parentId?: string }): Promise<unknown> {
    return this.request(
      "POST",
      `drive/v3/files/${encodeURIComponent(p.fileId)}/copy`,
      compact({ name: p.name, parents: p.parentId ? [p.parentId] : undefined }),
      { supportsAllDrives: true, fields: FILE_FIELDS },
    );
  }

  /**
   * Re-parents a file: reads the current parents first (one extra GET), then a
   * single PATCH with addParents/removeParents. keepExistingParents leaves the
   * old parents in place — note that ordinary My Drive files hold a single
   * parent slot, and shared-drive items exactly one.
   */
  async moveFile(p: { fileId: string; newParentId: string; keepExistingParents?: boolean }): Promise<unknown> {
    const id = encodeURIComponent(p.fileId);
    let removeParents: string | undefined;
    if (!p.keepExistingParents) {
      const current = await this.request<{ parents?: string[] }>("GET", `drive/v3/files/${id}`, undefined, {
        fields: "parents",
        supportsAllDrives: true,
      });
      const old = (current.parents ?? []).filter((parent) => parent !== p.newParentId);
      removeParents = old.length > 0 ? old.join(",") : undefined;
    }
    return this.request("PATCH", `drive/v3/files/${id}`, {}, compact({
      addParents: p.newParentId,
      removeParents,
      supportsAllDrives: true,
      fields: "id,name,parents,driveId",
    }));
  }

  /** files.update on metadata only — rename, description, starred. */
  async updateFileMetadata(p: {
    fileId: string;
    name?: string;
    description?: string;
    starred?: boolean;
  }): Promise<unknown> {
    const body = compact({ name: p.name, description: p.description, starred: p.starred });
    if (Object.keys(body).length === 0) {
      throw new Error("At least one of name, description or starred is required.");
    }
    return this.request("PATCH", `drive/v3/files/${encodeURIComponent(p.fileId)}`, body, {
      supportsAllDrives: true,
      fields: "id,name,description,starred,modifiedTime",
    });
  }

  // ---- Trash vs. permanent deletion (deliberately separate methods) ----

  /** files.update trashed — reversible; the trash auto-purges after 30 days. */
  async setTrashed(fileId: string, trashed: boolean): Promise<unknown> {
    return this.request("PATCH", `drive/v3/files/${encodeURIComponent(fileId)}`, { trashed }, {
      supportsAllDrives: true,
      fields: "id,name,trashed,explicitlyTrashed",
    });
  }

  /** files.delete — permanent, skips the trash entirely; a folder takes its descendants with it. */
  async deleteForever(fileId: string): Promise<unknown> {
    return this.request("DELETE", `drive/v3/files/${encodeURIComponent(fileId)}`, undefined, {
      supportsAllDrives: true,
    });
  }

  // ---- Content: upload / download / export ----

  /**
   * Multipart upload (metadata + bytes in one request, ≤ 5 MB). Without fileId
   * a new file is created; with fileId the existing file's content is replaced
   * (PATCH on the upload endpoint) and name/parentId are ignored — renames and
   * re-parenting are separate operations. convertTo imports the bytes into an
   * editable Google Workspace file (Doc/Sheet/Slides).
   */
  async uploadFile(p: {
    fileId?: string;
    name?: string;
    parentId?: string;
    media: Buffer;
    mediaMimeType: string;
    convertTo?: ConvertTarget;
  }): Promise<unknown> {
    if (p.media.byteLength > MAX_MULTIPART_BYTES) {
      throw new Error(
        `The content is ${p.media.byteLength} bytes, over the ${MAX_MULTIPART_BYTES}-byte multipart upload cap — ` +
          "start a resumable upload session via raw_request (POST upload/drive/v3/files?uploadType=resumable) instead.",
      );
    }
    const metadata = compact({
      // name is create-only too — the tool contract says a content replacement
      // never renames; renames go through updateFileMetadata.
      name: p.fileId ? undefined : p.name,
      mimeType: p.convertTo ? CONVERT_TARGET_MIME[p.convertTo] : undefined,
      // parents is create-only; on update re-parenting goes through moveFile.
      parents: !p.fileId && p.parentId ? [p.parentId] : undefined,
    });
    const { body, contentType } = buildMultipartBody(metadata, p.media, p.mediaMimeType);
    const path = p.fileId ? `upload/drive/v3/files/${encodeURIComponent(p.fileId)}` : "upload/drive/v3/files";
    const { buf } = await this.send(p.fileId ? "PATCH" : "POST", path, {
      rawBody: body,
      contentType,
      query: { uploadType: "multipart", supportsAllDrives: true, fields: FILE_FIELDS },
    });
    return JSON.parse(buf.toString("utf8"));
  }

  /**
   * files.get alt=media — the raw bytes of a binary file. Google-native files
   * (Docs/Sheets/Slides) have no bytes and must be exported instead; the tool
   * layer checks the mimeType first so this call fails only on races.
   */
  async download(fileId: string, opts: { acknowledgeAbuse?: boolean } = {}): Promise<{ buf: Buffer; contentType: string }> {
    const { res, buf } = await this.send("GET", `drive/v3/files/${encodeURIComponent(fileId)}`, {
      query: compact({ alt: "media", supportsAllDrives: true, acknowledgeAbuse: opts.acknowledgeAbuse }),
    });
    return { buf, contentType: res.headers.get("Content-Type") ?? "application/octet-stream" };
  }

  /** files.export — converts a Google Workspace file on the fly (export cap: 10 MB). */
  async exportFile(fileId: string, mimeType: string): Promise<{ buf: Buffer; contentType: string }> {
    const { res, buf } = await this.send("GET", `drive/v3/files/${encodeURIComponent(fileId)}/export`, {
      query: { mimeType },
    });
    return { buf, contentType: res.headers.get("Content-Type") ?? mimeType };
  }

  // ---- Permissions (sharing) ----

  /** permissions.list — who can access the file and how. */
  async listPermissions(fileId: string, pageToken?: string): Promise<unknown> {
    return this.request("GET", `drive/v3/files/${encodeURIComponent(fileId)}/permissions`, undefined, compact({
      supportsAllDrives: true,
      pageToken,
      fields: `nextPageToken,permissions(${PERMISSION_FIELDS})`,
    }));
  }

  /** permissions.create — grants access to a user, group, domain or anyone with the link. */
  async createPermission(p: {
    fileId: string;
    role: PermissionRole;
    type: PermissionType;
    emailAddress?: string;
    domain?: string;
    allowFileDiscovery?: boolean;
    sendNotificationEmail?: boolean;
    emailMessage?: string;
    transferOwnership?: boolean;
  }): Promise<unknown> {
    return this.request(
      "POST",
      `drive/v3/files/${encodeURIComponent(p.fileId)}/permissions`,
      compact({
        role: p.role,
        type: p.type,
        emailAddress: p.emailAddress,
        domain: p.domain,
        allowFileDiscovery: p.allowFileDiscovery,
      }),
      compact({
        supportsAllDrives: true,
        sendNotificationEmail: p.sendNotificationEmail,
        emailMessage: p.emailMessage,
        transferOwnership: p.transferOwnership,
        fields: PERMISSION_FIELDS,
      }),
    );
  }

  /** permissions.update — change the role (or expiration) of an existing grant. */
  async updatePermission(p: {
    fileId: string;
    permissionId: string;
    role: PermissionRole;
    expirationTime?: string;
  }): Promise<unknown> {
    return this.request(
      "PATCH",
      `drive/v3/files/${encodeURIComponent(p.fileId)}/permissions/${encodeURIComponent(p.permissionId)}`,
      compact({ role: p.role, expirationTime: p.expirationTime }),
      { supportsAllDrives: true, fields: PERMISSION_FIELDS },
    );
  }

  /** permissions.delete — revokes a grant. */
  async deletePermission(fileId: string, permissionId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `drive/v3/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}`,
      undefined,
      { supportsAllDrives: true },
    );
  }

  // ---- Comments ----

  /** comments.list — anchored and unanchored comments with their replies. */
  async listComments(p: {
    fileId: string;
    pageSize?: number;
    pageToken?: string;
    includeDeleted?: boolean;
  }): Promise<unknown> {
    return this.request("GET", `drive/v3/files/${encodeURIComponent(p.fileId)}/comments`, undefined, compact({
      pageSize: p.pageSize,
      pageToken: p.pageToken,
      includeDeleted: p.includeDeleted,
      fields: `nextPageToken,comments(${COMMENT_FIELDS})`,
    }));
  }

  /** comments.get — one comment with its replies. */
  async getComment(fileId: string, commentId: string): Promise<unknown> {
    return this.request(
      "GET",
      `drive/v3/files/${encodeURIComponent(fileId)}/comments/${encodeURIComponent(commentId)}`,
      undefined,
      { fields: COMMENT_FIELDS },
    );
  }

  /** comments.create — a new (unanchored, unless quoted/anchored) comment on the file. */
  async createComment(p: {
    fileId: string;
    content: string;
    quotedText?: string;
    anchor?: string;
  }): Promise<unknown> {
    return this.request(
      "POST",
      `drive/v3/files/${encodeURIComponent(p.fileId)}/comments`,
      compact({
        content: p.content,
        quotedFileContent: p.quotedText ? { value: p.quotedText } : undefined,
        anchor: p.anchor,
      }),
      { fields: COMMENT_FIELDS },
    );
  }

  /**
   * replies.create — a reply on a comment thread. Resolve/reopen ride the same
   * endpoint via `action`; content is optional for those two.
   */
  async replyToComment(p: {
    fileId: string;
    commentId: string;
    content?: string;
    action?: "resolve" | "reopen";
  }): Promise<unknown> {
    return this.request(
      "POST",
      `drive/v3/files/${encodeURIComponent(p.fileId)}/comments/${encodeURIComponent(p.commentId)}/replies`,
      compact({ content: p.content, action: p.action }),
      { fields: REPLY_FIELDS },
    );
  }

  /** comments.delete — removes the comment and its replies. */
  async deleteComment(fileId: string, commentId: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `drive/v3/files/${encodeURIComponent(fileId)}/comments/${encodeURIComponent(commentId)}`,
    );
  }
}

/** Drops keys whose value is `undefined` so they are not sent to the API. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
