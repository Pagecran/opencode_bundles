---
name: pagecran-teams-auth
description: |
  Authenticate the Teams bundle against Microsoft Graph without MCP.

  Triggers when user mentions:
  - "Teams login"
  - "Microsoft login"
  - "connect Teams"
  - "Teams auth"
---

## Workflow

1. Check `teams_auth_status` first.
2. If not authenticated, call `teams_auth_device_start`.
3. Tell the user to open the Microsoft verification URL and enter the `user_code`.
4. Then call `teams_auth_device_poll` until authentication succeeds.

## Environment

- `PAGECRAN_TEAMS_CLIENT_ID` is required unless passed directly to the auth tools.
- `PAGECRAN_TEAMS_TENANT_ID` defaults to `common`.
- `PAGECRAN_TEAMS_SCOPES` can override the default Graph scopes.

## Tools

### `teams_auth_status`

Read the local auth state, token file path, pending login state and expiry metadata.

### `teams_ping`

Quick connectivity test against `GET /me` once the auth flow is complete.

### `teams_auth_device_start`

Start device login and return:

- `user_code`
- `verification_uri`
- `verification_uri_complete`
- `device_code`

### `teams_auth_device_poll`

Poll the pending device login until it is accepted by Microsoft.

### `teams_auth_logout`

Clear stored tokens and pending login state.

## Guardrails

- Never ask the user for a password in chat.
- Prefer device-code login over ad hoc credential handling.
- If auth fails because of scopes or tenant policy, report the exact Graph/OAuth error.
- Once auth succeeds, prefer the high-level Teams tools before falling back to `teams_graph_request`.
