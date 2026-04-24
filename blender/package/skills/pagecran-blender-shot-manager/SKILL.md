---
name: pagecran-blender-shot-manager
description: |
  Manage Shot Manager data through the Pagecran bridge.

  Triggers when user mentions:
  - "Shot Manager"
  - "shot list"
  - "batch render"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

## Workflow

1. **Check** with `get_shot_manager_status` — fail fast if Shot Manager is not active.
2. **Inspect** with `get_shot_list` or `get_shot_details` before editing.
3. **Modify** shots with `create_shot`, `modify_shot`, or `enable_disable_shots`.
4. **Render** with `set_shot_manager_render_path` then `launch_batch_render`.

---

## Method catalog

#### `get_shot_manager_status`
Check whether Shot Manager is active in the current scene.
**Params:** none

#### `get_shot_list`
List all shots.
**Params:** none

#### `get_shot_details`
Detailed info for one shot.

| Param | Type | Required |
|-------|------|----------|
| `shot_name` | string | yes |

#### `create_shot`
Create a new shot.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | no |
| `start_frame` | int | no |
| `end_frame` | int | no |

#### `modify_shot`
Edit an existing shot.

| Param | Type | Required |
|-------|------|----------|
| `shot_name` | string | yes |
| `name` | string | no — rename |
| `start_frame` | int | no |
| `end_frame` | int | no |
| `enabled` | bool | no |

#### `enable_disable_shots`
Batch enable/disable multiple shots.

| Param | Type | Required |
|-------|------|----------|
| `shot_names` | string[] | yes |
| `enabled` | bool | yes |

#### `set_shot_manager_render_path`
Set the output path and redirection mode.

| Param | Type | Required |
|-------|------|----------|
| `path` | string | yes |
| `redirect` | bool | no |

#### `launch_batch_render`
Start batch render for all enabled shots.
**Params:** none

---

## Domain knowledge

- Shot Manager is a third-party addon. It must be installed and active for these methods to work.
- Each shot defines a frame range and can be individually enabled/disabled for batch rendering.
- `set_shot_manager_render_path` controls where rendered frames are saved. Set it before launching a batch.
- Batch render processes all enabled shots sequentially.

## Guardrails

- Fail fast if Shot Manager is not active (`get_shot_manager_status`).
- Read the shot before changing its frame range or enable state.
- Set the render path before launching batch render.
- Keep user-provided shot names exact.
- If the bridge is unreachable, tell the user to enable or reload **OpenCode Blender Bridge** in Blender.
