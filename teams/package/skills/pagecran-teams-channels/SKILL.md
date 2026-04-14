---
name: pagecran-teams-channels
description: |
  Work with Microsoft Teams teams, channels and channel messages.

  Triggers when user mentions:
  - "Teams channel"
  - "post to a Teams channel"
  - "list Teams channels"
  - "read channel messages"
---

## Preferred tools

Use the comfortable tools first:

- `teams_list_teams`
- `teams_list_channels`
- `teams_read_channel_messages`
- `teams_send_channel_message`

Only fall back to `teams_graph_request` when a workflow is not covered by the high-level tools.

If Graph access fails because of auth, use the `pagecran-teams-auth` skill first.

## Common channel paths

### List joined teams

Call `teams_list_teams`.

### List channels for a team

Call `teams_list_channels`.

- specify `team_id` or `team_name` to scope the search
- omit both to search channels across all joined teams

### Read channel messages

Call `teams_read_channel_messages` with:

- `team_id` or `team_name` when known
- `channel_id` or `channel_name`
- optional `limit`

### Send a channel message

Call `teams_send_channel_message` with:

- `team_id` or `team_name`
- `channel_id` or `channel_name`
- `message`
- optional `content_type` (`text` or `html`)

### Advanced fallback

If you need a Graph path not covered above, use:

```text
teams_graph_request(method: "GET|POST", path: "/...", query: { ... }, body: { ... })
```

## Guardrails

- Confirm the target team and channel before posting.
- Read recent channel messages first when context matters.
- If the user asks to post externally, surface the exact destination name in your response.
