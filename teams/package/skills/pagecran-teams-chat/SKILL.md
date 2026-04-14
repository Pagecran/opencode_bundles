---
name: pagecran-teams-chat
description: |
  Read and send Microsoft Teams chat messages through the Teams bundle.

  Triggers when user mentions:
  - "Teams chat"
  - "send a Teams message"
  - "read Teams messages"
  - "direct message on Teams"
---

## Preferred tools

Use the comfortable tools first:

- `teams_list_chats`
- `teams_read_chat_messages`
- `teams_send_chat_message`

Only fall back to `teams_graph_request` for edge cases not covered by the high-level tools.

If authentication is missing, use the `pagecran-teams-auth` skill first.

## Common chat paths

### Current user

- `GET /me`

Suggested query:

```json
{
  "$select": "id,displayName,userPrincipalName,mail"
}
```

### List chats

Call `teams_list_chats`.

- optional `query` to filter by chat label or participant name
- optional `limit` to inspect more recent chats

### Read chat messages

Call `teams_read_chat_messages` with one of:

- `chat_id`
- `chat_name`
- `participant_name`

Optional:

- `limit`

### Send a chat message

Call `teams_send_chat_message` with one of:

- `chat_id`
- `chat_name`
- `participant_name`

Required:

- `message`

Optional:

- `content_type` (`text` or `html`)

### Advanced fallback

If you need a Graph path not covered above, use:

```text
teams_graph_request(method: "GET|POST|PATCH|DELETE", path: "/...", query: { ... }, body: { ... })
```

## Guardrails

- Before sending a message, confirm the exact destination chat and the final message text.
- Prefer `contentType: "html"` only when formatting matters; otherwise use `text`.
- When listing chats, summarize the useful ones instead of dumping raw payloads.
- Prefer `participant_name` for existing direct/group chats only; if no matching chat exists, explain that a chat id or an existing conversation is needed.
