# Pagecran OpenCode Microsoft 365 Bundle

Microsoft 365 / Graph bundle for the Pagecran OpenCode bundles monorepo.

## What is included

- `package/plugins/m365.ts` - OpenCode plugin for Microsoft 365 / Microsoft Graph
- `package/runtime/*` - reusable auth, Graph, dispatcher and validation helpers
- `package/methods/*` - method manifests used as the public tool source of truth
- `package/skills/pagecran-m365-*` - on-demand skills for auth, files, sites, Excel, Teams, Outlook and OpenWork workflows
- `package/bin/pagecran_m365_cli.mjs` - manual CLI for auth and Graph requests
- `install.ps1` - installer for the global OpenCode config

## Current tool surface

Low-level:

- `m365_auth_status`
- `m365_auth_device_start`
- `m365_auth_device_poll`
- `m365_auth_logout`
- `m365_ping`
- `m365_graph_request`

High-level:

- `m365_search_workspace`
- `m365_batch_drive_items`
- `m365_notify`
- `m365_mail_search_messages`
- `m365_mail_send_message`
- `m365_mail_get_mailbox_settings`
- `m365_mail_set_automatic_replies`
- `m365_list_sites`
- `m365_get_site`
- `m365_list_document_libraries`
- `m365_list_drive_items`
- `m365_get_drive_item`
- `m365_list_file_versions`
- `m365_create_share_link`
- `m365_search_drive_items`
- `m365_create_drive_folder`
- `m365_download_drive_item`
- `m365_upload_small_drive_item`
- `m365_update_drive_item`
- `m365_delete_drive_item`
- `m365_excel_list_worksheets`
- `m365_excel_read_range`
- `m365_excel_write_range`
- `m365_teams_list_chats`
- `m365_teams_read_chat_messages`
- `m365_teams_create_chat`
- `m365_teams_send_chat_message`
- `m365_teams_list_teams`
- `m365_teams_list_channels`
- `m365_teams_read_channel_messages`
- `m365_teams_send_channel_message`

Use `m365_graph_request` for Graph paths that are not covered yet.

## Validation

From `m365/package/`:

```powershell
bun run check:types
bun run check:bundle
bun run check
```

The bundle coherence check verifies that:

- public method manifests are still exposed by the manifest-driven plugin
- each public method has a runtime handler
- skill tool references stay aligned with the public method set
- `verify.method` and `execution.tool` references point to real methods

## Authentication

This bundle does not use MCP.
It talks directly to Microsoft Graph with delegated OAuth device-code authentication.

Environment variables:

- shared default app: `TeamsPascale`
- default client id: `674f3d17-5a27-417b-bcff-bfea2e61447b`
- default tenant id: `2fa485e4-1eee-4081-8445-98037b332c71`
- `PAGECRAN_M365_CLIENT_ID` - optional override, Microsoft Entra app client id
- `PAGECRAN_M365_TENANT_ID` - optional override, Microsoft Entra tenant id
- `PAGECRAN_M365_SCOPES` - optional, space or comma separated scopes
- `PAGECRAN_M365_AUTH_FILE` - optional auth storage path override
- `PAGECRAN_M365_PENDING_AUTH_FILE` - optional pending-login storage path override

Compatibility fallbacks:

- if `PAGECRAN_M365_CLIENT_ID` is not set, the bundle also accepts `PAGECRAN_TEAMS_CLIENT_ID`
- if `PAGECRAN_M365_TENANT_ID` is not set, the bundle also accepts `PAGECRAN_TEAMS_TENANT_ID`
- if `PAGECRAN_M365_SCOPES` is not set, the bundle also accepts `PAGECRAN_TEAMS_SCOPES`

Default shared scopes:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Files.ReadWrite.All`
- `Sites.ReadWrite.All`
- `Chat.Read`
- `Chat.ReadWrite`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`
- `ChannelMessage.Read.All`
- `ChannelMessage.Send`
- `Mail.Read`
- `Mail.Send`
- `MailboxSettings.ReadWrite`

These defaults are intentionally broad enough to cover the current M365 bundle surface with one shared login.
You can still override them explicitly if needed, for example:

- Excel write: `Files.ReadWrite.All`
- SharePoint / OneDrive write: `Files.ReadWrite.All` or `Sites.ReadWrite.All`
- Teams chat/channel messaging: `Chat.Read`, `Chat.ReadWrite`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send`
- Outlook mail: `Mail.Read`, `Mail.Send`
- Outlook automatic replies / mailbox settings: `MailboxSettings.Read`, `MailboxSettings.ReadWrite`

Protected tools now try to reuse the local token automatically.
If no valid token exists yet, the bundle auto-starts device-code login and returns the verification URL + user code instead of only failing with a generic auth error.

## Install

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

## CLI examples

```powershell
node .\package\bin\pagecran_m365_cli.mjs status
node .\package\bin\pagecran_m365_cli.mjs auth-start
node .\package\bin\pagecran_m365_cli.mjs auth-poll
node .\package\bin\pagecran_m365_cli.mjs ping
node .\package\bin\pagecran_m365_cli.mjs request GET /me
node .\package\bin\pagecran_m365_cli.mjs request GET /sites?search=Marketing
```

## Typical flow

1. Use any protected M365 tool, or call `m365_auth_device_start`
2. If needed, complete Microsoft login in the browser
3. Confirm auth with `m365_auth_device_poll`
4. Test connectivity with `m365_ping`
5. Use the high-level files, sites and Excel tools when possible
6. Use `m365_search_workspace`, `m365_batch_drive_items`, and `m365_notify` for prompt-first OpenWork workflows
7. Fall back to `m365_graph_request` for uncovered Graph workflows

## Common examples

```text
m365_list_sites(query: "marketing")
m365_search_workspace(query: "brief 2026", sources: ["sites", "files", "teams_chats"])
m365_notify(target: "channel", team_name: "Marketing", channel_name: "General", message: "Draft report ready for review")
m365_mail_search_messages(query: "invoice april", limit: 10)
m365_mail_send_message(recipients: ["alex@contoso.com"], subject: "Suivi", message: "Bonjour Alex", preview_only: true)
m365_mail_set_automatic_replies(status: "scheduled", start_datetime: "2026-05-01T18:00:00", end_datetime: "2026-05-04T09:00:00", time_zone: "Romance Standard Time", internal_message: "Bonjour, je suis absent jusqu'a lundi.", preview_only: true)
m365_list_document_libraries(site_name: "Marketing")
m365_list_drive_items(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026")
m365_get_drive_item(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_list_file_versions(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_create_share_link(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_search_drive_items(site_name: "Marketing", library_name: "Documents", query: "brief 2026")
m365_create_drive_folder(site_name: "Marketing", library_name: "Documents", parent_path: "Campaigns/2026", folder_name: "Drafts")
m365_download_drive_item(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_upload_small_drive_item(site_name: "Marketing", library_name: "Documents", parent_path: "Campaigns/2026", file_name: "notes.txt", content_base64: "SGVsbG8=")
m365_update_drive_item(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/notes.txt", new_name: "notes-final.txt")
m365_delete_drive_item(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/old.txt", confirm: true)
m365_batch_drive_items(site_name: "Marketing", library_name: "Documents", actions: [{ action: "rename", item_path: "Campaigns/2026/notes.txt", new_name: "notes-final.txt" }])
m365_excel_list_worksheets(site_name: "Finance", library_name: "Documents", item_path: "Forecast.xlsx")
m365_excel_read_range(site_name: "Finance", library_name: "Documents", item_path: "Forecast.xlsx", worksheet_name: "Q1", range_address: "A1:C10")
m365_teams_list_chats(query: "alex")
m365_teams_send_chat_message(participant_username: "alex@contoso.com", message: "Bonjour")
m365_teams_list_channels(team_name: "Marketing")
m365_teams_send_channel_message(team_name: "Marketing", channel_name: "General", message: "Daily sync posted")
```

## Next layer

- optional Teams-domain migration or reuse on top of the same Graph/auth core
- native SharePoint REST fallback helpers for Graph gaps
- upload sessions for large files
- richer permissions management helpers
