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
2. Reuse `C:\Users\<user>\.config\opencode\pagecran_m365_auth.json` automatically when it already exists.
3. If there is no valid token yet, call `m365_auth_device_start` or any protected M365 tool; the bundle now auto-starts device-code login when needed.
4. Tell the user to open the Microsoft verification URL and enter the `user_code`.
5. Then call `m365_auth_device_poll` until authentication succeeds.

## Environment

- Shared default Entra app: `TeamsPascale`.
- Default client id: `674f3d17-5a27-417b-bcff-bfea2e61447b`.
- Default tenant id: `2fa485e4-1eee-4081-8445-98037b332c71`.
- `PAGECRAN_M365_CLIENT_ID` / `PAGECRAN_M365_TENANT_ID` remain optional overrides.
- `PAGECRAN_M365_SCOPES` can override the default Graph scopes.
- Compatibility fallback: the bundle also accepts the existing `PAGECRAN_TEAMS_*` env vars.
- The default shared scope set is intentionally broad enough to cover the current bundle surface: files, SharePoint, Teams, Outlook, and mailbox settings.

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

If a valid token already exists for the requested scope set, this tool returns the current auth state instead of starting a redundant login.

### `m365_auth_device_poll`

Poll the pending device login until it is accepted by Microsoft.

### `m365_auth_logout`

Clear stored tokens and pending login state.

## Guardrails

- Never ask the user for a password in chat.
- Prefer device-code login over ad hoc credential handling.
- Prefer the shared default TeamsPascale app unless the user explicitly asks to override it.
- If auth fails because of scopes or tenant policy, report the exact Graph/OAuth error.
- Once auth succeeds, use `m365_graph_request` or future high-level tools instead of ad hoc HTTP examples.
