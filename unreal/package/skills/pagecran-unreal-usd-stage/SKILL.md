---
name: pagecran-unreal-usd-stage
description: |
  Work with Unreal USD Stage Editor workflows through the Pagecran Unreal bridge.

  Triggers when user mentions:
  - "USD Stage Editor"
  - "USD stage"
  - "open usd"
  - "usd layer"
---

## Priority

USD is a first-class workflow target for this bundle.

## How to call methods

Use:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Read the currently opened USD stage before mutating it.
2. Prefer targeted layer edits over destructive reimports.
3. Verify time codes, layer stack, payload state, and purpose visibility after changes.

## Expected methods

### `list_usd_stages`

List currently opened or known USD stages.

### `open_usd_stage`

Open a USD stage in the Unreal USD Stage Editor.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `file_path` | string | yes | Absolute path to the USD file |

### `get_usd_stage_info`

Read stage root layer, sublayers, time range, meters-per-unit, and composition info.

### `set_usd_stage_time`

Set the evaluated time / frame for the stage.

### `set_usd_purpose_visibility`

Toggle render / proxy / guide purpose visibility.

### `reload_usd_stage`

Reload the stage from disk.

### `save_usd_stage`

Save authored changes back to the current edit target.

## Guardrails

- Report which layer is being edited before writing.
- Prefer non-destructive layer edits when possible.
- Confirm whether edits should affect the root layer or a sublayer / session layer.
