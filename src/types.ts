/**
 * The server talks to the Google Drive API v3 (https://www.googleapis.com,
 * REST over JSON; uploads go through the /upload/drive/v3 media endpoints on
 * the same host). Auth is Google OAuth 2.0: a Bearer access token, minted on
 * demand from a refresh token via https://oauth2.googleapis.com/token (or a
 * static short-lived access token, mostly for testing).
 */

/** The mimeType Drive uses for folders — a folder is just a file with this type. */
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** Prefix of every Google-native type (Docs, Sheets, Slides, folders, shortcuts, ...). */
export const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

/**
 * Normalized conversion targets for upload_file's convert_to; the client maps
 * them to the Google-native wire mimeTypes. Importing converts the uploaded
 * bytes into an editable Google Workspace file.
 */
export type ConvertTarget = "document" | "spreadsheet" | "presentation";

/** Permission roles (API wire values, passed through). */
export type PermissionRole = "reader" | "commenter" | "writer" | "fileOrganizer" | "organizer" | "owner";

/** Permission grantee types (API wire values, passed through). */
export type PermissionType = "user" | "group" | "domain" | "anyone";

export interface GoogleDriveConfig {
  /** OAuth2 client id (refresh flow). */
  clientId?: string;
  /** OAuth2 client secret (refresh flow). Treated as a secret. */
  clientSecret?: string;
  /** OAuth2 refresh token, exchanged for access tokens. Treated as a secret. */
  refreshToken?: string;
  /** Static access token (short-lived, ~1h). Used only when the refresh triple is absent. Treated as a secret. */
  accessToken?: string;
  /** API root. Defaults to https://www.googleapis.com. */
  apiBase: string;
  /** Per-request timeout in milliseconds. Defaults to 60_000. */
  timeoutMs?: number;
  /** Max retries for transient errors (429 always; 5xx/network for reads). Defaults to 3. */
  maxRetries?: number;
  /** Base backoff in milliseconds, doubled each retry. Defaults to 500. */
  retryBaseMs?: number;
}

/**
 * Google APIs report failures as a non-2xx HTTP status with a JSON envelope
 * ({ error: { code, message, status, details } }); the OAuth token endpoint
 * uses { error, error_description }. The parsed body is kept alongside the
 * status and a short readable message is derived.
 */
export class GoogleDriveError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${formatErrorBody(body)}`);
    this.name = "GoogleDriveError";
    this.status = status;
    this.body = body;
  }
}

/** Turns a parsed Google API error body into a short, readable message. */
function formatErrorBody(body: unknown): string {
  if (body == null) return "(no body)";
  if (typeof body === "string") return body.slice(0, 500);
  if (typeof body !== "object") return String(body);
  const obj = body as Record<string, unknown>;

  // OAuth token endpoint style: { error: "invalid_grant", error_description: "..." }
  if (typeof obj.error === "string") {
    const description = typeof obj.error_description === "string" ? `: ${obj.error_description}` : "";
    return `${obj.error}${description}`.slice(0, 500);
  }

  // Google API envelope: { error: { code, message, status, details } }
  const err = (typeof obj.error === "object" && obj.error !== null ? obj.error : obj) as Record<string, unknown>;
  if (typeof err.message === "string") {
    const status = typeof err.status === "string" ? `[${err.status}] ` : "";
    return `${status}${err.message}`.slice(0, 500);
  }

  return JSON.stringify(obj).slice(0, 500);
}
