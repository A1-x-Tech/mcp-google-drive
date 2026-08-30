import { ConfigError, CredentialsError, loadConfig } from "./config.js";
import { GoogleDriveClient } from "./client.js";

/**
 * Live smoke check against the real Drive API.
 *
 * Default mode is READ-ONLY: it calls about() (who the token belongs to) and,
 * when a file id is given (argv or GOOGLE_DRIVE_SMOKE_FILE_ID), fetches that
 * file's metadata — the credentials are exercised for real and nothing is
 * written.
 *
 * GOOGLE_DRIVE_SMOKE_WRITE=1 opts into the full write scenario on DISPOSABLE
 * resources only: it creates a uniquely-named folder, uploads a small text file
 * into it, exercises rename / copy / download / trash / restore on that file,
 * and permanently deletes the folder (which removes everything inside) in a
 * finally block — cleanup runs after success and failure alike, and only ever
 * targets the resources this run created.
 */
async function main(): Promise<void> {
  const client = new GoogleDriveClient(loadConfig());
  const fileId = process.argv[2] ?? process.env.GOOGLE_DRIVE_SMOKE_FILE_ID;

  const about = (await client.about()) as { user?: { emailAddress?: string; displayName?: string } };
  console.log(JSON.stringify({ about: about.user }, null, 2));

  if (fileId) {
    const file = (await client.getFile(fileId, "id,name,mimeType,size,modifiedTime")) as Record<string, unknown>;
    console.log(JSON.stringify({ file }, null, 2));
  }

  if (process.env.GOOGLE_DRIVE_SMOKE_WRITE !== "1") {
    console.log("Read-only smoke passed. Set GOOGLE_DRIVE_SMOKE_WRITE=1 for the disposable write scenario.");
    return;
  }

  const stamp = `mcp-drive-smoke-${Date.now()}`;
  const folder = (await client.createFolder({ name: stamp })) as { id: string };
  console.log(`created disposable folder ${stamp} (${folder.id})`);
  try {
    const uploaded = (await client.uploadFile({
      name: `${stamp}.txt`,
      parentId: folder.id,
      media: Buffer.from("mcp-google-drive live smoke\n", "utf8"),
      mediaMimeType: "text/plain",
    })) as { id: string };

    await client.updateFileMetadata({ fileId: uploaded.id, name: `${stamp}-renamed.txt` });
    const copy = (await client.copyFile({ fileId: uploaded.id, parentId: folder.id })) as { id: string };
    const { buf } = await client.download(uploaded.id);
    if (!buf.toString("utf8").includes("live smoke")) throw new Error("downloaded content mismatch");
    await client.setTrashed(copy.id, true);
    await client.setTrashed(copy.id, false);
    console.log("write scenario passed (upload, rename, copy, download, trash, restore)");
  } finally {
    // The folder subtree holds every resource this run created; deleting it is
    // the cleanup for success and failure alike.
    await client.deleteForever(folder.id).then(
      () => console.log(`cleaned up ${stamp}`),
      (err) => console.error(`cleanup of ${stamp} (${folder.id}) failed — delete it manually:`, err?.message ?? err),
    );
  }
}

main().catch((err) => {
  // Missing or malformed credentials are a user error, not a bug: no stack.
  const userError = err instanceof ConfigError || err instanceof CredentialsError;
  console.error("smoke failed:", userError ? err.message : err);
  process.exit(1);
});
