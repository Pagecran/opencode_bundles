# Pagecran OpenCode Teams Bundle

Teams bundle for the Pagecran OpenCode bundles monorepo.

## What is included

- `package/plugins/teams.ts` - OpenCode plugin for Microsoft Graph / Teams
- `package/skills/pagecran-teams-*` - on-demand skills for auth, chats and channels
- `package/bin/pagecran_teams_cli.mjs` - manual CLI for auth and Graph requests
- `install.ps1` - installer for the global OpenCode config

## Comfortable tools

The bundle exposes both low-level and high-level tools.

Low-level:

- `teams_auth_status`
- `teams_auth_device_start`
- `teams_auth_device_poll`
- `teams_auth_logout`
- `teams_ping`
- `teams_graph_request`

High-level:

- `teams_list_chats`
- `teams_read_chat_messages`
- `teams_create_chat`
- `teams_send_chat_message`
- `teams_list_teams`
- `teams_list_channels`
- `teams_read_channel_messages`
- `teams_send_channel_message`

The high-level tools resolve chats, teams and channels by readable names whenever possible, and can also create one-on-one or group chats from usernames when needed, so you do not have to work only with raw Graph ids.

## Authentication

This bundle does not use MCP.
It talks directly to Microsoft Graph with delegated OAuth device-code authentication.

Environment variables:

- `PAGECRAN_TEAMS_CLIENT_ID` - required, Microsoft Entra app client id
- `PAGECRAN_TEAMS_TENANT_ID` - optional, defaults to `common`
- `PAGECRAN_TEAMS_SCOPES` - optional, space or comma separated scopes

Default scopes:

- `offline_access`
- `openid`
- `profile`
- `User.Read`
- `Chat.Read`
- `Chat.ReadWrite`
- `Team.ReadBasic.All`
- `Channel.ReadBasic.All`
- `ChannelMessage.Read.All`
- `ChannelMessage.Send`

## Install

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

## CLI examples

```powershell
node .\package\bin\pagecran_teams_cli.mjs status
node .\package\bin\pagecran_teams_cli.mjs auth-start
node .\package\bin\pagecran_teams_cli.mjs auth-poll
node .\package\bin\pagecran_teams_cli.mjs request GET /me
```

## Typical flow

1. Authenticate with `teams_auth_device_start`
2. Complete Microsoft login in the browser
3. Confirm auth with `teams_auth_device_poll`
4. Test connectivity with `teams_ping`
5. Work comfortably with `teams_list_chats`, `teams_create_chat`, `teams_send_chat_message`, `teams_list_teams`, `teams_list_channels`, `teams_send_channel_message`

## Creating chats by username

- Use `teams_create_chat` with `participant_username` for a direct chat, or `participant_usernames` for a group chat
- `participant_username` and `participant_usernames` expect account identifiers such as UPN / sign-in name or user id
- Use `chat_topic` only for group chats
- `teams_send_chat_message` also accepts the same participant fields and will create or reuse the target chat before sending
