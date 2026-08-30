# <img src="./assets/a1-logo.svg" alt="A1" width="40"> Google Drive MCP

**English** | [Русский](./README.ru.md)

[![npm](https://img.shields.io/npm/v/%40a1-x-tech%2Fmcp-google-drive)](https://www.npmjs.com/package/@a1-x-tech/mcp-google-drive)
[![CI](https://github.com/A1-x-Tech/mcp-google-drive/actions/workflows/ci.yml/badge.svg)](https://github.com/A1-x-Tech/mcp-google-drive/actions/workflows/ci.yml)
[![Glama](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-drive/badges/score.svg)](https://glama.ai/mcp/servers/A1-x-Tech/mcp-google-drive)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**A1 Google Drive MCP** lets an AI app work with your Google Drive in plain language. Find a file, tidy up folders, upload and download content, export a Doc as Markdown, share it with the right people — and keep the trash between you and permanent deletion.

It uses the Google Drive API with your Google account. It sees My Drive and shared drives alike, treats “delete” as the reversible trash and makes the limits of the Drive API explicit instead of implying that every file task is possible.

- **15 tools.** Search and metadata, folders and moving, upload and download, export of Docs/Sheets/Slides, the trash, sharing and comments.
- **The trash comes first.** “Delete” means the reversible trash; permanent deletion is a deliberately separate tool that cannot be picked by accident.
- **Documents stay intact.** Docs, Sheets and Slides move, copy, export and convert as whole files — the server never edits the text inside them.
- **You choose the scope.** `drive.readonly` covers every read and `drive.file` limits access to app-created files; the full tool surface needs `drive`.

Start with a read-only question:

> Find the project roadmap doc in my Drive, export it to Markdown and summarize it.

[Connect the server](#quick-start) · [Explore use cases](#what-you-can-ask-it-to-do) · [Open technical documentation](#technical-documentation)

---

## See it work in a minute

> **You:** Show me what’s in the “Contracts 2025” folder, newest first.
>
> **Assistant:** Lists the files with their types, owners and modification dates. Nothing changes.
>
> **You:** Prepare an “Archive” subfolder and move everything older than a year into it.
>
> **Assistant:** Shows the folder it would create and the files it would move, then asks for confirmation.
>
> **You:** Confirm.
>
> **Assistant:** Creates the folder and moves the files. Nothing is shared, trashed or deleted unless you ask separately.

## Contents

- [Quick start](#quick-start)
- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [How your Drive changes](#how-your-drive-changes)
- [What can change](#what-can-change)
- [Getting access](#getting-access)
- [Configuration](#configuration)
- [Data, limits and background work](#data-limits-and-background-work)
- [Technical documentation](#technical-documentation)
- [Support](#support)

## Quick start

You need Node.js 20+, a Google account and OAuth credentials from a Google Cloud project with the Google Drive API enabled.

1. [Prepare Google OAuth access](#getting-access).
2. Add the server to your AI app.
3. Ask the read-only question above.

<details open>
<summary><strong>Codex</strong></summary>

<br>

**In the desktop app:** open **Settings → MCP servers**, select **Add server**, choose **STDIO**, and enter the command `npx -y @a1-x-tech/mcp-google-drive@latest` with `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` and `GOOGLE_DRIVE_REFRESH_TOKEN`. Select **Save**, then **Restart**.

**In the IDE extension:** open the **gear menu → MCP servers**, select **Add server**, choose **STDIO**, and enter the same command and environment variables. Select **Save**, then **Restart extension**.

**From the command line:**

```bash
codex mcp add google-drive \
  --env GOOGLE_DRIVE_CLIENT_ID=your_client_id \
  --env GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token \
  -- npx -y @a1-x-tech/mcp-google-drive@latest
```

```bash
codex mcp list
```

[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

```bash
claude mcp add \
  --env GOOGLE_DRIVE_CLIENT_ID=your_client_id \
  --env GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret \
  --env GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token \
  --transport stdio --scope user google-drive \
  -- npx -y @a1-x-tech/mcp-google-drive@latest
```

```bash
claude mcp list
```

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

<br>

The current official path is **Settings → Extensions**. For a custom desktop extension, open **Advanced settings → Extension Developer → Install Extension…**, select a `.mcpb` file and follow the prompts.

This repository currently publishes an npm stdio package and does not contain a `.mcpb` bundle. For Claude Desktop builds that still support local configuration, use the following JSON stdio configuration as a fallback:

```json
{
  "mcpServers": {
    "google-drive": {
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "your_client_id",
        "GOOGLE_DRIVE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

In those builds, save it to `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows.

[Claude Desktop MCP documentation](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)

</details>

<details>
<summary><strong>Cursor</strong></summary>

<br>

Add this to `~/.cursor/mcp.json` on macOS/Linux or `%USERPROFILE%\.cursor\mcp.json` on Windows:

```json
{
  "mcpServers": {
    "google-drive": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "your_client_id",
        "GOOGLE_DRIVE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "your_refresh_token"
      }
    }
  }
}
```

[Cursor MCP documentation](https://cursor.com/docs/mcp)

</details>

<details>
<summary><strong>VS Code</strong></summary>

<br>

Run **MCP: Open User Configuration** and add:

```json
{
  "servers": {
    "google-drive": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@a1-x-tech/mcp-google-drive@latest"],
      "env": {
        "GOOGLE_DRIVE_CLIENT_ID": "${input:drive_client_id}",
        "GOOGLE_DRIVE_CLIENT_SECRET": "${input:drive_client_secret}",
        "GOOGLE_DRIVE_REFRESH_TOKEN": "${input:drive_refresh_token}"
      }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "drive_client_id", "description": "Google OAuth client ID" },
    { "type": "promptString", "id": "drive_client_secret", "description": "Google OAuth client secret", "password": true },
    { "type": "promptString", "id": "drive_refresh_token", "description": "Google OAuth refresh token", "password": true }
  ]
}
```

Check it with **MCP: List Servers**.

[VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

## What you can ask it to do

### Find and read files

- Find last quarter’s budget spreadsheet and show where it lives and who owns it.
- Export the project brief to Markdown and summarize the open questions.
- Download the signed contract PDF into my reports folder.

### Organize and transfer content

- Create a “2026 Reports” folder and move the monthly reports into it.
- Upload these meeting notes and convert them into a Google Doc.
- Copy the proposal template and rename the copy for the new client.

### Share and discuss

- Share the folder with a teammate as a commenter and add a note to the invitation.
- List the open comments on the design doc and resolve the ones we’ve addressed.
- Revoke the external contractor’s access to the archive.

### Clean up deliberately

- Trash the outdated drafts — and restore the one deleted by mistake.
- Permanently delete the folder of test uploads once I confirm.
- Show what’s in the trash before anything is purged.

## How your Drive changes

1. Everything in Drive — folders and shared-drive items included — is a **file** with an id. Names are not unique, so tools act on ids, and duplicate names are legal: it pays to search before creating.
2. “Delete” means the **trash**: reversible, auto-purged by Google after about 30 days. Permanent deletion bypasses the trash, takes folder subtrees with it and lives in a deliberately separate tool.
3. Google Docs, Sheets and Slides are moved, copied, shared, exported and converted as whole units. The server has no tool that edits text inside a Doc or cells inside a Sheet.
4. A write is never replayed after an uncertain failure: retries after network and `5xx` errors apply to reads only, so a copy, upload or new folder cannot be duplicated behind your back.

Built-in uploads are capped at 5 MB (larger files go through a resumable session via `raw_request`), exports at 10 MB per the Drive API. Comments created through the API cannot be anchored to a specific passage inside a Doc.

## What can change

| Operation | What happens | Confirmation boundary |
|---|---|---|
| Search, metadata, download, export | Reads files and folders | No change |
| Create a folder, copy or upload | Adds files or replaces content | Changes Drive |
| Move, rename, update metadata | Changes a file’s location or properties | Changes a file |
| Manage permissions | Grants, changes or revokes access | Changes who can open a file |
| Manage comments | Creates, resolves or deletes comment threads | Can destroy a discussion |
| Trash or restore a file | Moves it into or out of the trash | Reversible for ~30 days |
| Delete forever | Erases past the trash, subtrees included | Destructive |
| Raw API request | Can call API methods without a dedicated tool | Potentially destructive |

The AI client controls confirmation prompts. The server marks reads, writes and destructive tools so the client can distinguish an inspection from a live change.

## Getting access

Google Drive requires OAuth 2.0; an API key is not enough.

1. Create or select a Google Cloud project and enable **Google Drive API**.
2. Configure the OAuth consent screen and create a **Desktop app** OAuth client.
3. Authorize the Google account whose files the server should work with. The [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) can obtain the refresh token when **Use your own OAuth credentials** is enabled.
4. Request the narrowest scope that covers your use:

   | Scope | Enables |
   |---|---|
   | `https://www.googleapis.com/auth/drive.readonly` | The read-only tools: search, metadata, download, export and shared-drive listing. |
   | `https://www.googleapis.com/auth/drive.file` | Only files created or opened by this app — enough for upload-and-organize flows on app-owned files. |
   | `https://www.googleapis.com/auth/drive` | The full tool surface: sharing, trash, deletion and comments on arbitrary files. |

The server uses whatever scope the refresh token was minted with; a call outside it fails with an `insufficientPermissions` error.

Testing-mode OAuth refresh tokens can expire after seven days. Publish the OAuth app, or use an Internal app in a Workspace domain, when you need long-lived access. Treat the client secret and refresh token as passwords.

## Configuration

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | Yes* | OAuth client ID. |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Yes* | OAuth client secret. |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Yes* | OAuth refresh token. |
| `GOOGLE_DRIVE_ACCESS_TOKEN` | Yes* | Short-lived (~1 hour) alternative to the OAuth trio. |
| `GOOGLE_DRIVE_API_BASE` | No | Google APIs base URL override. |
| `GOOGLE_DRIVE_TIMEOUT_MS` | No | Per-request timeout; default `60000` ms. |
| `GOOGLE_DRIVE_MAX_RETRIES` | No | Temporary-error retries; default `3`. |

\* Provide either the OAuth trio or an access token.

Without any credentials the server still starts and completes the MCP handshake; the first tool call replies with the exact variables to set instead of a dead server.

## Data, limits and background work

- **Requests go to Google Drive.** The local server refreshes Google OAuth tokens and calls the Drive API. Its anonymous telemetry contains an installation ID, package version, AI client and platform versions, and tool names — never OAuth tokens, file content, tool arguments or prompts. Set `ASKADS_TELEMETRY=0` to opt out.
- **Google applies quotas and size caps.** Uploads through the built-in tool are limited to 5 MB and exports to 10 MB. On `429`, the server uses backoff; reads also retry after network and `5xx` errors, while writes are not replayed after an uncertain failure.
- **Local files are handled cautiously.** Downloads save only to absolute paths and refuse to overwrite an existing file unless asked; inline returns cap at 100 KB of textual content.
- **There is no background polling.** The server runs only when called; nothing watches your Drive between requests. If your AI app supports scheduled tasks, it can check for changes periodically.

## Technical documentation

- [MCP capability catalog](./docs/capabilities/index.md) — task-oriented pages for every tool.
- [All tools and inputs](./docs/TOOLS.md)
- [Development documentation](./docs/DEVELOPMENT.md)
- [Publishing documentation](./docs/PUBLISHING.md)
- [Google Drive API reference](https://developers.google.com/drive/api)

## Support

Found a bug or need a scenario? [Create an issue](https://github.com/A1-x-Tech/mcp-google-drive/issues) or write in [Telegram](https://t.me/a1_mcp).

<br>

<p align="center">
  <img src="https://github.com/ztemerbekov/a1-yandex-kit-skills/raw/main/assets/images/mona-hifive-yandex-kit-warm.gif" alt="Две Моны дают пять" width="256">
</p>

<p align="center">
  You made it to the end!
</p>
