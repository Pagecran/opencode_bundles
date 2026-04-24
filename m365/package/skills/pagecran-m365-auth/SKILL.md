---
name: pagecran-m365-auth
description: |
  Authenticate the Microsoft 365 bundle against Microsoft Graph without MCP.

  Triggers when user mentions:
  - "Microsoft 365 login"
  - "Graph login"
  - "connect M365"
  - "M365 auth"
---

## Workflow

1. Check `m365_auth_status` first.
2. If not authenticated, call `m365_auth_device_start`.
3. Tell the user to open the Microsoft verification URL and enter the `user_code`.
4. Then call `m365_auth_device_poll` until authentication succeeds.

## Environment

- `PAGECRAN_M365_CLIENT_ID` is required unless passed directly to the auth tools.
- `PAGECRAN_M365_TENANT_ID` defaults to `common`.
- `PAGECRAN_M365_SCOPES` can override the default Graph scopes.
- Compatibility fallback: the bundle also accepts the existing `PAGECRAN_TEAMS_*` env vars.
- For Teams workflows, extend scopes explicitly with `Chat.Read`, `Chat.ReadWrite`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All` and `ChannelMessage.Send` as needed.

## Tools

### `m365_auth_status`

Read the local auth state, token file path, pending login state and expiry metadata.

### `m365_ping`

Quick connectivity test against `GET /me` once the auth flow is complete.

### `m365_auth_device_start`

Start device login and return:

- `user_code`
- `verification_uri`
- `verification_uri_complete`
- `device_code`

### `m365_auth_device_poll`

Poll the pending device login until it is accepted by Microsoft.

### `m365_auth_logout`

Clear stored tokens and pending login state.

## Guardrails

- Never ask the user for a password in chat.
- Prefer device-code login over ad hoc credential handling.
- If auth fails because of scopes or tenant policy, report the exact Graph/OAuth error.
- Once auth succeeds, use `m365_graph_request` or future high-level tools instead of ad hoc HTTP examples.
