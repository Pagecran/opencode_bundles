---
name: pagecran-unreal-editor
description: |
  Work with the Unreal editor through the Pagecran Unreal bridge.

  Triggers when user mentions:
  - "Unreal Engine"
  - "Unreal editor"
  - "Unreal project"
  - "viewport screenshot"
---

## How to call methods

All methods below are called via the `unreal_request` tool:

```text
unreal_request(method: "<method_name>", params: { ... })
```

If no workflow skill is loaded yet, start with:

```text
unreal_request(method: "get_capabilities")
```

## Workflow

1. Connect with `unreal_connect` if needed.
2. Inspect the editor or project state before mutating anything.
3. Make the smallest targeted change.
4. Verify with a readback or screenshot.

## Expected core methods

### `ping`

Health check for the Unreal bridge.

### `get_capabilities`

Return the method catalog exposed by the Unreal-side bridge.

### `get_project_info`

Read project name, map, engine version, active world, plugins, and render pipeline basics.

### `get_editor_state`

Read current level, selected actors, PIE state, active viewport, and camera information.

### `list_levels`

List available levels / maps.

### `load_level`

Open a level in the editor.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `level_path` | string | yes | Unreal asset path or map path |

### `list_actors`

List actors in the active level, optionally filtered.

### `get_actor_info`

Read transform, components, tags, folder path, and layer metadata for an actor.

### `get_viewport_screenshot`

Capture the active viewport. Prefer this for quick verification after scene changes.

## Guardrails

- Inspect before mutating, unless the user explicitly asks for a direct action.
- Prefer exact object, sequence, or asset paths when several matches are possible.
- After changing the scene, verify with a readback or screenshot.
