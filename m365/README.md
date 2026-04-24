# Pagecran OpenCode Microsoft 365 Bundle

Microsoft 365 / Graph bundle for the Pagecran OpenCode bundles monorepo.

## What is included

- `package/plugins/m365.ts` - OpenCode plugin for Microsoft 365 / Microsoft Graph
- `package/runtime/*` - reusable auth, Graph, dispatcher and validation helpers
- `package/methods/*` - method manifests used as the public tool source of truth
- `package/skills/pagecran-m365-*` - on-demand skills for auth, files, sites and Excel workflows
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

- `m365_list_sites`
- `m365_get_site`
- `m365_list_document_libraries`
- `m365_list_drive_items`
- `m365_get_drive_item`
- `m365_list_file_versions`
- `m365_create_share_link`
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

- `PAGECRAN_M365_CLIENT_ID` - required, Microsoft Entra app client id
- `PAGECRAN_M365_TENANT_ID` - optional, defaults to `common`
- `PAGECRAN_M365_SCOPES` - optional, space or comma separated scopes
- `PAGECRAN_M365_AUTH_FILE` - optional auth storage path override
- `PAGECRAN_M365_PENDING_AUTH_FILE` - optional pending-login storage path override

Compatibility fallbacks:

- if `PAGECRAN_M365_CLIENT_ID` is not set, the bundle also accepts `PAGECRAN_TEAMS_CLIENT_ID`
- if `PAGECRAN_M365_TENANT_ID` is not set, the bundle also accepts `PAGECRAN_TEAMS_TENANT_ID`
- if `PAGECRAN_M365_SCOPES` is not set, the bundle also accepts `PAGECRAN_TEAMS_SCOPES`

Default scopes:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Files.Read.All`
- `Sites.Read.All`

For write-heavy or domain-specific workflows, extend scopes explicitly, for example:

- Excel write: `Files.ReadWrite.All`
- SharePoint write: `Sites.ReadWrite.All`
- Teams chat/channel messaging: `Chat.Read`, `Chat.ReadWrite`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send`

The default scope set stays conservative and does not include Teams scopes automatically.
That keeps the default auth footprint file/site oriented while still allowing Teams tools when you opt in with extra scopes.

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

1. Authenticate with `m365_auth_device_start`
2. Complete Microsoft login in the browser
3. Confirm auth with `m365_auth_device_poll`
4. Test connectivity with `m365_ping`
5. Use the high-level files, sites and Excel tools when possible
6. Fall back to `m365_graph_request` for uncovered Graph workflows

## Common examples

```text
m365_list_sites(query: "marketing")
m365_list_document_libraries(site_name: "Marketing")
m365_list_drive_items(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026")
m365_get_drive_item(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_list_file_versions(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
m365_create_share_link(site_name: "Marketing", library_name: "Documents", item_path: "Campaigns/2026/brief.docx")
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
- higher-level file upload, download and search helpers
