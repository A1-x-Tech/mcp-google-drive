import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMultipartBody,
  buildSearchQuery,
  escapeQueryValue,
  GoogleDriveClient,
  MAX_MULTIPART_BYTES,
} from "./client.js";
import { CredentialsError, MISSING_CREDENTIALS_MESSAGE } from "./config.js";
import type { GoogleDriveConfig } from "./types.js";

const BASE = "https://www.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type Call = {
  url: string;
  method: string;
  auth: unknown;
  contentType: unknown;
  body: string | Buffer | undefined;
};

/** A client on a static access token — no token-endpoint traffic expected. */
function staticConfig(extra: Partial<GoogleDriveConfig> = {}): GoogleDriveConfig {
  return { accessToken: "STATIC", apiBase: BASE, maxRetries: 0, retryBaseMs: 0, ...extra };
}

/** A client on the refresh flow. */
function refreshConfig(extra: Partial<GoogleDriveConfig> = {}): GoogleDriveConfig {
  return {
    clientId: "cid",
    clientSecret: "csec",
    refreshToken: "rtok",
    apiBase: BASE,
    maxRetries: 0,
    retryBaseMs: 0,
    ...extra,
  };
}

/** Installs a recording fetch stub; the handler decides each response. */
function mockFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as RequestInit & { headers?: Record<string, string> };
    calls.push({
      url: String(url),
      method: String(i.method),
      auth: i.headers?.Authorization,
      contentType: i.headers?.["Content-Type"],
      body:
        typeof i.body === "string" ? i.body : i.body instanceof Uint8Array ? Buffer.from(i.body) : undefined,
    });
    return handler(String(url), i, calls.length);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const okJson = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

/** Default handler: token endpoint mints TOK-1, everything else returns { ok: true }. */
function defaultHandler(url: string): Response {
  if (url === TOKEN_URL) return okJson({ access_token: "TOK-1", expires_in: 3600 });
  return okJson({ ok: true });
}

function bodyJson(call: Call): unknown {
  return JSON.parse(typeof call.body === "string" ? call.body : call.body!.toString("utf8"));
}

// ---- Auth ----

/**
 * The degraded-start contract: a server without credentials still runs, so the
 * client must fail the call itself — with the exact actionable message, before
 * any fetch. Zero fetch calls proves the error skips the retry/backoff loop
 * and the forced 401 re-mint alike (maxRetries is deliberately non-zero here).
 */
test("no credentials at all: CredentialsError with the exact text, fetch never called", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleDriveClient({ apiBase: BASE, maxRetries: 3, retryBaseMs: 0 });
    await assert.rejects(
      () => client.getFile("abc"),
      (err: unknown) => {
        assert.ok(err instanceof CredentialsError, "must be a CredentialsError");
        assert.equal(err.message, MISSING_CREDENTIALS_MESSAGE);
        // The historical startup error, verbatim — the message is the product.
        assert.ok(
          err.message.startsWith(
            "Google OAuth credentials are required: set GOOGLE_DRIVE_CLIENT_ID + " +
              "GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN (recommended), " +
              "or GOOGLE_DRIVE_ACCESS_TOKEN with a short-lived access token.",
          ),
          "the message must open with the historical startup error, verbatim",
        );
        assert.match(err.message, /restart the server/, "the fix must mention the restart");
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "must not fetch at all — no retries, no token mint, no replay");
  } finally {
    mock.restore();
  }
});

test("static access token: Bearer header, no token-endpoint traffic", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).getFile("abc");
    assert.equal(mock.calls.length, 1);
    const url = new URL(mock.calls[0].url);
    assert.equal(url.origin, BASE);
    assert.equal(url.pathname, "/drive/v3/files/abc");
    assert.equal(mock.calls[0].method, "GET");
    assert.equal(mock.calls[0].auth, "Bearer STATIC");
  } finally {
    mock.restore();
  }
});

test("refresh flow: mints a token first, then caches it across requests", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleDriveClient(refreshConfig());
    await client.getFile("abc");
    await client.getFile("def");

    const tokenCalls = mock.calls.filter((c) => c.url === TOKEN_URL);
    assert.equal(tokenCalls.length, 1, "the second request must reuse the cached token");
    assert.equal(tokenCalls[0].method, "POST");
    const params = new URLSearchParams(String(tokenCalls[0].body));
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("client_id"), "cid");
    assert.equal(params.get("client_secret"), "csec");
    assert.equal(params.get("refresh_token"), "rtok");

    const apiCalls = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`));
    assert.equal(apiCalls.length, 2);
    for (const call of apiCalls) assert.equal(call.auth, "Bearer TOK-1");
  } finally {
    mock.restore();
  }
});

test("a 401 forces one re-mint and replays the request", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleDriveClient(refreshConfig()).getFile("abc");
    assert.deepEqual(result, { ok: true });
    assert.equal(minted, 2, "the 401 must force a second mint");
    const lastApi = mock.calls.filter((c) => c.url.startsWith(`${BASE}/`)).at(-1);
    assert.equal(lastApi?.auth, "Bearer TOK-2");
  } finally {
    mock.restore();
  }
});

test("a persistent 401 throws instead of looping", async () => {
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) return okJson({ access_token: "TOK", expires_in: 3600 });
    apiHits++;
    return new Response('{"error":{"message":"nope","status":"UNAUTHENTICATED"}}', { status: 401 });
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(refreshConfig()).getFile("abc"),
      /HTTP 401: \[UNAUTHENTICATED\] nope/,
    );
    assert.equal(apiHits, 2, "exactly one replay after the forced re-mint");
  } finally {
    mock.restore();
  }
});

test("the 401 replay does not consume a slot of the transient-retry budget", async () => {
  let minted = 0;
  let apiHits = 0;
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      minted++;
      return okJson({ access_token: `TOK-${minted}`, expires_in: 3600 });
    }
    apiHits++;
    if (apiHits === 1) return new Response('{"error":{"message":"expired"}}', { status: 401 });
    if (apiHits === 2) return new Response("slow down", { status: 429 });
    return okJson({ ok: true });
  });
  try {
    // maxRetries=1: the 429 after the 401 replay needs the full budget — if
    // the replay ate a slot, this request would surface HTTP 429 instead.
    const result = await new GoogleDriveClient(refreshConfig({ maxRetries: 1 })).getFile("abc");
    assert.deepEqual(result, { ok: true });
    assert.equal(apiHits, 3, "401 replay + one transient retry must both happen");
    assert.equal(minted, 2, "still exactly one forced re-mint");
  } finally {
    mock.restore();
  }
});

test("a failed token exchange surfaces the OAuth error", async () => {
  const mock = mockFetch((url) => {
    if (url === TOKEN_URL) {
      return new Response('{"error":"invalid_grant","error_description":"Token has been revoked."}', {
        status: 400,
      });
    }
    return okJson({ ok: true });
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(refreshConfig()).getFile("abc"),
      /HTTP 400: invalid_grant: Token has been revoked\./,
    );
  } finally {
    mock.restore();
  }
});

// ---- Search query building ----

test("escapeQueryValue neutralizes quotes and backslashes", () => {
  assert.equal(escapeQueryValue("O'Brien"), "O\\'Brien");
  assert.equal(escapeQueryValue("a\\b"), "a\\\\b");
  assert.equal(escapeQueryValue("plain"), "plain");
});

test("buildSearchQuery ANDs the filters, escapes values and hides trash by default", () => {
  const q = buildSearchQuery({
    query: "modifiedTime > '2026-01-01T00:00:00'",
    nameContains: "O'Brien report",
    mimeType: "application/pdf",
    parentId: "folder-1",
  });
  assert.equal(
    q,
    "(modifiedTime > '2026-01-01T00:00:00') and name contains 'O\\'Brien report' and " +
      "mimeType = 'application/pdf' and 'folder-1' in parents and trashed = false",
  );
});

test("buildSearchQuery maps only_folders/full_text and can include trash", () => {
  assert.equal(
    buildSearchQuery({ onlyFolders: true, includeTrashed: true }),
    "mimeType = 'application/vnd.google-apps.folder'",
  );
  assert.equal(
    buildSearchQuery({ fullTextContains: "budget" }),
    "fullText contains 'budget' and trashed = false",
  );
});

// ---- Endpoint mapping ----

test("listFiles sends q, pagination and always supportsAllDrives", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).listFiles({
      nameContains: "plan",
      pageSize: 25,
      pageToken: "tok",
      orderBy: "modifiedTime desc",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files");
    assert.equal(url.searchParams.get("q"), "name contains 'plan' and trashed = false");
    assert.equal(url.searchParams.get("pageSize"), "25");
    assert.equal(url.searchParams.get("pageToken"), "tok");
    assert.equal(url.searchParams.get("orderBy"), "modifiedTime desc");
    assert.equal(url.searchParams.get("supportsAllDrives"), "true");
    assert.equal(url.searchParams.get("corpora"), null, "no corpora without a drive filter");
    assert.match(String(url.searchParams.get("fields")), /nextPageToken,incompleteSearch,files\(/);
    assert.equal(mock.calls[0].body, undefined);
  } finally {
    mock.restore();
  }
});

test("listFiles targets one shared drive with corpora=drive", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).listFiles({ driveId: "drv-1" });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.searchParams.get("corpora"), "drive");
    assert.equal(url.searchParams.get("driveId"), "drv-1");
    assert.equal(url.searchParams.get("includeItemsFromAllDrives"), "true");
  } finally {
    mock.restore();
  }
});

test("listFiles searches everything with corpora=allDrives", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).listFiles({ includeAllDrives: true });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.searchParams.get("corpora"), "allDrives");
    assert.equal(url.searchParams.get("includeItemsFromAllDrives"), "true");
  } finally {
    mock.restore();
  }
});

test("listSharedDrives escapes the name filter", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).listSharedDrives({ nameContains: "Ops'22", pageSize: 5 });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/drives");
    assert.equal(url.searchParams.get("q"), "name contains 'Ops\\'22'");
    assert.equal(url.searchParams.get("pageSize"), "5");
  } finally {
    mock.restore();
  }
});

test("getFile requests rich fields by default and honors a custom projection", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleDriveClient(staticConfig());
    await client.getFile("f1");
    let url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/f1");
    assert.equal(url.searchParams.get("supportsAllDrives"), "true");
    assert.match(String(url.searchParams.get("fields")), /shortcutDetails/);
    await client.getFile("f1", "id,name");
    url = new URL(mock.calls[1].url);
    assert.equal(url.searchParams.get("fields"), "id,name");
  } finally {
    mock.restore();
  }
});

test("createFolder posts the folder mimeType and optional parent", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).createFolder({ name: "Reports", parentId: "p1" });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files");
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(bodyJson(mock.calls[0]), {
      name: "Reports",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["p1"],
    });
  } finally {
    mock.restore();
  }
});

test("copyFile posts name/parents to the copy endpoint", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).copyFile({ fileId: "f1", name: "Copy", parentId: "p2" });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/f1/copy");
    assert.equal(mock.calls[0].method, "POST");
    assert.deepEqual(bodyJson(mock.calls[0]), { name: "Copy", parents: ["p2"] });
  } finally {
    mock.restore();
  }
});

test("moveFile reads the current parents, then PATCHes addParents/removeParents", async () => {
  const mock = mockFetch((url) => {
    if (new URL(url).searchParams.get("fields") === "parents") return okJson({ parents: ["old-1", "old-2"] });
    return okJson({ id: "f1", parents: ["new-1"] });
  });
  try {
    await new GoogleDriveClient(staticConfig()).moveFile({ fileId: "f1", newParentId: "new-1" });
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[0].method, "GET");
    const patch = new URL(mock.calls[1].url);
    assert.equal(mock.calls[1].method, "PATCH");
    assert.equal(patch.pathname, "/drive/v3/files/f1");
    assert.equal(patch.searchParams.get("addParents"), "new-1");
    assert.equal(patch.searchParams.get("removeParents"), "old-1,old-2");
  } finally {
    mock.restore();
  }
});

test("moveFile with keep_existing_parents skips the read and removes nothing", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).moveFile({
      fileId: "f1",
      newParentId: "new-1",
      keepExistingParents: true,
    });
    assert.equal(mock.calls.length, 1, "no extra read when old parents are kept");
    const patch = new URL(mock.calls[0].url);
    assert.equal(patch.searchParams.get("addParents"), "new-1");
    assert.equal(patch.searchParams.get("removeParents"), null);
  } finally {
    mock.restore();
  }
});

test("moveFile never removes the destination it is adding", async () => {
  const mock = mockFetch((url) => {
    if (new URL(url).searchParams.get("fields") === "parents") return okJson({ parents: ["new-1"] });
    return okJson({ id: "f1" });
  });
  try {
    await new GoogleDriveClient(staticConfig()).moveFile({ fileId: "f1", newParentId: "new-1" });
    const patch = new URL(mock.calls[1].url);
    assert.equal(patch.searchParams.get("removeParents"), null);
  } finally {
    mock.restore();
  }
});

test("updateFileMetadata patches only the provided fields and requires at least one", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const client = new GoogleDriveClient(staticConfig());
    await client.updateFileMetadata({ fileId: "f1", name: "New", starred: true });
    assert.equal(mock.calls[0].method, "PATCH");
    assert.deepEqual(bodyJson(mock.calls[0]), { name: "New", starred: true });
    await assert.rejects(() => client.updateFileMetadata({ fileId: "f1" }), /At least one of/);
    assert.equal(mock.calls.length, 1, "the empty update must not reach the API");
  } finally {
    mock.restore();
  }
});

test("setTrashed and deleteForever hit different endpoints — trash is not delete", async () => {
  const mock = mockFetch((url, init) =>
    init.method === "DELETE" ? new Response(null, { status: 204 }) : okJson({ id: "f1", trashed: true }),
  );
  try {
    const client = new GoogleDriveClient(staticConfig());
    await client.setTrashed("f1", true);
    assert.equal(mock.calls[0].method, "PATCH");
    assert.deepEqual(bodyJson(mock.calls[0]), { trashed: true });
    await client.setTrashed("f1", false);
    assert.deepEqual(bodyJson(mock.calls[1]), { trashed: false });

    const result = await client.deleteForever("f1");
    assert.equal(mock.calls[2].method, "DELETE");
    assert.equal(new URL(mock.calls[2].url).pathname, "/drive/v3/files/f1");
    assert.deepEqual(result, { ok: true }, "an empty 204 maps to {ok:true}");
  } finally {
    mock.restore();
  }
});

// ---- Content: upload / download / export ----

test("buildMultipartBody frames metadata and media between one boundary", () => {
  const { body, contentType } = buildMultipartBody({ name: "a.txt" }, Buffer.from("hello"), "text/plain");
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  assert.ok(boundary, "contentType must carry the boundary");
  const text = body.toString("utf8");
  const parts = text.split(`--${boundary}`);
  assert.equal(parts.length, 4, "prologue, two parts, closing marker");
  assert.match(parts[1]!, /Content-Type: application\/json; charset=UTF-8/);
  assert.match(parts[1]!, /\{"name":"a\.txt"\}/);
  assert.match(parts[2]!, /Content-Type: text\/plain/);
  assert.match(parts[2]!, /hello/);
  assert.equal(parts[3], "--\r\n");
});

test("uploadFile creates via multipart POST with parents and fields", async () => {
  const mock = mockFetch(() => okJson({ id: "new-1", name: "a.txt" }));
  try {
    const result = await new GoogleDriveClient(staticConfig()).uploadFile({
      name: "a.txt",
      parentId: "p1",
      media: Buffer.from("hello"),
      mediaMimeType: "text/plain",
    });
    assert.deepEqual(result, { id: "new-1", name: "a.txt" });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/upload/drive/v3/files");
    assert.equal(url.searchParams.get("uploadType"), "multipart");
    assert.equal(url.searchParams.get("supportsAllDrives"), "true");
    assert.equal(mock.calls[0].method, "POST");
    assert.match(String(mock.calls[0].contentType), /^multipart\/related; boundary=/);
    const text = (mock.calls[0].body as Buffer).toString("utf8");
    assert.match(text, /\{"name":"a\.txt","parents":\["p1"\]\}/);
    assert.match(text, /hello/);
  } finally {
    mock.restore();
  }
});

test("uploadFile with file_id PATCHes the upload endpoint and drops name and parents", async () => {
  const mock = mockFetch(() => okJson({ id: "f1" }));
  try {
    await new GoogleDriveClient(staticConfig()).uploadFile({
      fileId: "f1",
      name: "ignored.txt",
      parentId: "ignored",
      media: Buffer.from("v2"),
      mediaMimeType: "text/plain",
    });
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/upload/drive/v3/files/f1");
    assert.equal(mock.calls[0].method, "PATCH");
    const text = (mock.calls[0].body as Buffer).toString("utf8");
    assert.doesNotMatch(text, /parents/, "parents is create-only");
    // The tool contract: a content replacement never renames the file.
    assert.doesNotMatch(text, /name/, "name is create-only — renames go through updateFileMetadata");
  } finally {
    mock.restore();
  }
});

test("uploadFile with convert_to imports into the Google-native mimeType", async () => {
  const mock = mockFetch(() => okJson({ id: "doc-1" }));
  try {
    await new GoogleDriveClient(staticConfig()).uploadFile({
      name: "notes.md",
      media: Buffer.from("# hi"),
      mediaMimeType: "text/markdown",
      convertTo: "document",
    });
    const text = (mock.calls[0].body as Buffer).toString("utf8");
    assert.match(text, /"mimeType":"application\/vnd\.google-apps\.document"/);
    assert.match(text, /Content-Type: text\/markdown/);
  } finally {
    mock.restore();
  }
});

test("uploadFile rejects content over the multipart cap before any fetch", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await assert.rejects(
      () =>
        new GoogleDriveClient(staticConfig()).uploadFile({
          name: "big.bin",
          media: Buffer.alloc(MAX_MULTIPART_BYTES + 1),
          mediaMimeType: "application/octet-stream",
        }),
      /resumable upload/,
    );
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("download fetches alt=media and returns the exact bytes", async () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const mock = mockFetch(
    () => new Response(new Uint8Array(bytes), { status: 200, headers: { "Content-Type": "image/png" } }),
  );
  try {
    const { buf, contentType } = await new GoogleDriveClient(staticConfig()).download("f1");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/f1");
    assert.equal(url.searchParams.get("alt"), "media");
    assert.equal(url.searchParams.get("supportsAllDrives"), "true");
    assert.deepEqual(buf, bytes, "binary bytes must survive untouched");
    assert.equal(contentType, "image/png");
  } finally {
    mock.restore();
  }
});

test("exportFile hits the export endpoint with the target mimeType", async () => {
  const mock = mockFetch(
    () => new Response("# markdown", { status: 200, headers: { "Content-Type": "text/markdown" } }),
  );
  try {
    const { buf, contentType } = await new GoogleDriveClient(staticConfig()).exportFile("doc-1", "text/markdown");
    const url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/doc-1/export");
    assert.equal(url.searchParams.get("mimeType"), "text/markdown");
    assert.equal(buf.toString("utf8"), "# markdown");
    assert.equal(contentType, "text/markdown");
  } finally {
    mock.restore();
  }
});

// ---- Permissions ----

test("permission methods map to list/create/update/delete", async () => {
  const mock = mockFetch((url, init) =>
    init.method === "DELETE" ? new Response(null, { status: 204 }) : okJson({ id: "perm-1" }),
  );
  try {
    const client = new GoogleDriveClient(staticConfig());
    await client.listPermissions("f1", "tok");
    let url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/f1/permissions");
    assert.equal(url.searchParams.get("pageToken"), "tok");
    assert.match(String(url.searchParams.get("fields")), /permissions\(/);

    await client.createPermission({
      fileId: "f1",
      role: "writer",
      type: "user",
      emailAddress: "a@example.com",
      sendNotificationEmail: false,
    });
    url = new URL(mock.calls[1].url);
    assert.equal(mock.calls[1].method, "POST");
    assert.equal(url.searchParams.get("sendNotificationEmail"), "false");
    assert.deepEqual(bodyJson(mock.calls[1]), { role: "writer", type: "user", emailAddress: "a@example.com" });

    await client.updatePermission({ fileId: "f1", permissionId: "perm-1", role: "reader" });
    assert.equal(mock.calls[2].method, "PATCH");
    assert.equal(new URL(mock.calls[2].url).pathname, "/drive/v3/files/f1/permissions/perm-1");
    assert.deepEqual(bodyJson(mock.calls[2]), { role: "reader" });

    await client.deletePermission("f1", "perm-1");
    assert.equal(mock.calls[3].method, "DELETE");
    assert.equal(new URL(mock.calls[3].url).pathname, "/drive/v3/files/f1/permissions/perm-1");
  } finally {
    mock.restore();
  }
});

test("createPermission for anyone carries allowFileDiscovery in the body", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    await new GoogleDriveClient(staticConfig()).createPermission({
      fileId: "f1",
      role: "reader",
      type: "anyone",
      allowFileDiscovery: false,
    });
    assert.deepEqual(bodyJson(mock.calls[0]), { role: "reader", type: "anyone", allowFileDiscovery: false });
  } finally {
    mock.restore();
  }
});

// ---- Comments ----

test("comment methods always pass an explicit fields selection", async () => {
  const mock = mockFetch((url, init) =>
    init.method === "DELETE" ? new Response(null, { status: 204 }) : okJson({ id: "c1" }),
  );
  try {
    const client = new GoogleDriveClient(staticConfig());
    await client.listComments({ fileId: "f1", pageSize: 10 });
    let url = new URL(mock.calls[0].url);
    assert.equal(url.pathname, "/drive/v3/files/f1/comments");
    assert.match(String(url.searchParams.get("fields")), /comments\(/);

    await client.createComment({ fileId: "f1", content: "Looks good", quotedText: "the intro" });
    url = new URL(mock.calls[1].url);
    assert.equal(mock.calls[1].method, "POST");
    assert.ok(url.searchParams.get("fields"), "comments.create returns nothing without fields");
    assert.deepEqual(bodyJson(mock.calls[1]), {
      content: "Looks good",
      quotedFileContent: { value: "the intro" },
    });

    await client.replyToComment({ fileId: "f1", commentId: "c1", action: "resolve" });
    url = new URL(mock.calls[2].url);
    assert.equal(url.pathname, "/drive/v3/files/f1/comments/c1/replies");
    assert.deepEqual(bodyJson(mock.calls[2]), { action: "resolve" });

    await client.getComment("f1", "c1");
    assert.equal(new URL(mock.calls[3].url).pathname, "/drive/v3/files/f1/comments/c1");

    await client.deleteComment("f1", "c1");
    assert.equal(mock.calls[4].method, "DELETE");
  } finally {
    mock.restore();
  }
});

// ---- Retry / timeout / SSRF behavior ----

test("request() retries a 429 for reads and writes alike", async () => {
  for (const run of [
    () => new GoogleDriveClient(staticConfig({ maxRetries: 3 })).getFile("f"),
    () => new GoogleDriveClient(staticConfig({ maxRetries: 3 })).deleteForever("f"),
  ]) {
    let n = 0;
    const mock = mockFetch(() => {
      n++;
      if (n === 1) return new Response("slow down", { status: 429 });
      return okJson({ ok: true });
    });
    try {
      assert.deepEqual(await run(), { ok: true });
      assert.equal(n, 2);
    } finally {
      mock.restore();
    }
  }
});

test("request() retries a 5xx only for GET — a write is never replayed", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) return new Response("unavailable", { status: 503 });
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleDriveClient(staticConfig({ maxRetries: 3 })).getFile("f");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2, "the read is retried");
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("unavailable", { status: 503 });
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(staticConfig({ maxRetries: 3 })).deleteForever("f"),
      /HTTP 503/,
    );
    assert.equal(n, 1, "a 503 on a write must not be replayed — the delete may have committed");
  } finally {
    mock2.restore();
  }
});

test("request() retries a network error only for GET", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    if (n === 1) throw new Error("ECONNRESET");
    return okJson({ ok: true });
  });
  try {
    const result = await new GoogleDriveClient(staticConfig({ maxRetries: 2 })).getFile("f");
    assert.deepEqual(result, { ok: true });
    assert.equal(n, 2);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    throw new Error("ECONNRESET");
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(staticConfig({ maxRetries: 2 })).copyFile({ fileId: "f" }),
      /ECONNRESET/,
    );
    assert.equal(n, 1, "a network error on a write must not be replayed");
  } finally {
    mock2.restore();
  }
});

test("request() does not retry a 400 and gives up after maxRetries on 429", async () => {
  let n = 0;
  const mock = mockFetch(() => {
    n++;
    return new Response('{"error":{"message":"bad","status":"INVALID_ARGUMENT"}}', { status: 400 });
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(staticConfig({ maxRetries: 3 })).getFile("f"),
      /HTTP 400: \[INVALID_ARGUMENT\] bad/,
    );
    assert.equal(n, 1);
  } finally {
    mock.restore();
  }

  n = 0;
  const mock2 = mockFetch(() => {
    n++;
    return new Response("slow down", { status: 429 });
  });
  try {
    await assert.rejects(
      () => new GoogleDriveClient(staticConfig({ maxRetries: 2 })).getFile("f"),
      /HTTP 429/,
    );
    assert.equal(n, 3); // initial + 2 retries
  } finally {
    mock2.restore();
  }
});

test("request() aborts and reports a timeout when the request hangs", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_url: unknown, init: unknown) =>
    new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal as AbortSignal;
      signal.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  try {
    const client = new GoogleDriveClient(staticConfig({ timeoutMs: 10, maxRetries: 0 }));
    await client.getFile("f").then(
      () => assert.fail("must reject"),
      (err) => assert.match(String(err), /timed out after 10ms/),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("request() rejects an absolute path (SSRF) and never fetches a foreign origin", async () => {
  for (const evil of ["https://evil.example/steal", "http://evil.example/x", "\\\\evil.example/x"]) {
    const mock = mockFetch(() => okJson({}));
    try {
      await assert.rejects(
        () => new GoogleDriveClient(staticConfig()).request("GET", evil),
        /foreign origin/,
      );
      assert.equal(mock.calls.length, 0, `must not fetch for ${JSON.stringify(evil)}`);
    } finally {
      mock.restore();
    }
  }
});

test("request() still accepts a relative API path with a query string", async () => {
  const mock = mockFetch(defaultHandler);
  try {
    const result = await new GoogleDriveClient(staticConfig()).request(
      "GET",
      "drive/v3/files?pageSize=10",
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(mock.calls[0].url, `${BASE}/drive/v3/files?pageSize=10`);
  } finally {
    mock.restore();
  }
});
