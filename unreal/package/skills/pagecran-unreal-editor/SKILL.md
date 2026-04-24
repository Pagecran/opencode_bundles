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

## Runtime split

- Bridge primitives: `ping`, `get_capabilities`, `execute_python`, `get_project_info`, `get_editor_state`
- Bundle methods: level loading, sequencer actions, movie render graph actions, shading actions, and data-layer actions
- Prefer named bundle methods first; use `execute_python` only for prototyping or diagnostics

## Bridge primitives

### `ping`

Health check for the Unreal bridge.

### `get_capabilities`

Return the bundle-defined Unreal methods plus the currently reachable bridge capabilities.

### `execute_python`

Execute Unreal Editor Python code through the bridge. Last resort - prefer named bundle methods.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Python source code to execute in the Unreal Editor |

### `get_project_info`

Read project name, map, engine version, active world, plugins, and render pipeline basics.

### `get_editor_state`

Read current level, selected actors, PIE state, active viewport, and camera information.

## Named bundle methods

### `load_level`

Open a level in the editor.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `level_path` | string | yes | Unreal package path or object path, for example `/Game/Levels/ADAS_World` or `/Game/Levels/ADAS_World.ADAS_World` |

Notes:

- Implemented bundle-side on top of `execute_python`
- Accepts package paths or object paths

### `open_level_sequence`

Open a Level Sequence asset in the Sequencer editor.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sequence_path` | string | yes | Level Sequence asset path |

### `list_level_sequences`

List Level Sequence assets under a content root.

### `get_sequence_info`

Read playback range, frame rate, bindings, and master track info for a Level Sequence.

### `add_track`

Add a Sequencer track to a sequence or binding.

### `set_keyframe`

Set transform keyframes on a Sequencer binding.

### `add_camera_cut`

Create a camera cut section from an existing camera binding.

### `list_movie_render_graphs`

List Movie Render Graph assets.

### `get_movie_render_graph_info`

Read Movie Render Graph asset metadata.

### `configure_movie_render_graph_job`

Configure a Movie Render Graph render job.

### `render_sequence_with_graph`

Render a sequence through Movie Render Graph.

### `list_materials`

List materials and material instances.

### `get_material_info`

Read material metadata and parameter info.

### `create_material_instance`

Create a material instance asset.

### `set_material_parameter`

Set scalar, vector, or texture parameters on a material instance.

### `assign_material_to_actor`

Assign a material to an actor mesh slot.

### `list_material_parameter_collections`

List available Material Parameter Collections.

### `list_data_layers`

List Data Layers in the active world.

### `get_data_layer_info`

Read Data Layer state and visibility.

### `set_data_layer_loaded`

Set whether a Data Layer is loaded in editor.

### `set_data_layer_visible`

Set whether a Data Layer is visible.

### `get_viewport_screenshot`

Capture the active viewport. Prefer this for quick verification after scene changes.

## Guardrails

- Inspect before mutating, unless the user explicitly asks for a direct action.
- Prefer exact object, sequence, or asset paths when several matches are possible.
- After changing the scene, verify with a readback or screenshot.
- Prefer named bundle methods over `execute_python` unless you are deliberately prototyping a new workflow.
- Treat `get_capabilities` as the source of truth for what the bundle currently exposes in this session.
