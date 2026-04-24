# Unreal Bridge Protocol

Protocol reference for the Pagecran Unreal bundle.

The goal is to keep the transport small and stable, then evolve the method catalog around linear-content workflows.

## Transport

- TCP
- default endpoint: `127.0.0.1:9877`
- one JSON message per line
- UTF-8

## Request shape

```json
{
  "type": "request",
  "id": "3d8f8e1f-1b08-4bdf-9c84-08ab59dbf3c7",
  "method": "ping",
  "params": {}
}
```

## Success response shape

```json
{
  "type": "result",
  "id": "3d8f8e1f-1b08-4bdf-9c84-08ab59dbf3c7",
  "result": {
    "ok": true
  }
}
```

## Error response shape

```json
{
  "type": "result",
  "id": "3d8f8e1f-1b08-4bdf-9c84-08ab59dbf3c7",
  "error": "Method 'render_sequence' is not implemented yet in the Unreal bridge scaffold",
  "error_code": "request_error"
}
```

## Event shape

```json
{
  "type": "event",
  "name": "bridge_status",
  "data": {
    "state": "connected"
  },
  "ts": 1770000000000
}
```

## Bridge primitives now

- `ping`
- `get_capabilities`
- `execute_python`
- `get_project_info`
- `get_editor_state`

## Bundle-defined methods currently implemented on top of `execute_python`

- `load_level`
- `list_level_sequences`
- `get_sequence_info`
- `open_level_sequence`
- `add_track`
- `set_keyframe`
- `add_camera_cut`
- `list_movie_render_graphs`
- `get_movie_render_graph_info`
- `configure_movie_render_graph_job`
- `render_sequence_with_graph`
- `list_materials`
- `get_material_info`
- `create_material_instance`
- `set_material_parameter`
- `assign_material_to_actor`
- `list_material_parameter_collections`
- `list_data_layers`
- `get_data_layer_info`
- `set_data_layer_loaded`
- `set_data_layer_visible`

Interpretation:

- bridge primitives are implemented in `bridges/opencode_unreal_bridge/`
- bundle-defined methods are implemented in `unreal/package/methods/` and `unreal/package/scripts/`

## Planned methods by domain

### Core / editor

- `execute_python`
- `load_level`
- `get_viewport_screenshot`

### Sequencer

- `list_level_sequences`
- `get_sequence_info`
- `create_level_sequence`
- `list_sequence_bindings`
- `add_actor_binding`
- `add_track`
- `set_section_range`
- `set_keyframe`
- `add_camera_cut`
- `render_sequence`

Current implemented subset:

- `add_track` currently targets `transform`, `skeletal_animation`, and `camera_cut`
- `set_keyframe` currently targets transform channels and transform payloads
- `add_camera_cut` creates camera cut sections from an existing camera binding id

### Movie Render Graph / Movie Render Queue

- `list_movie_render_graphs`
- `get_movie_render_graph_info`
- `create_movie_render_graph_config`
- `configure_movie_render_graph_job`
- `render_sequence_with_graph`
- `get_movie_render_queue_info`
- `configure_movie_render_job`
- `set_render_output`

Current implemented subset:

- `list_movie_render_graphs`
- `get_movie_render_graph_info`
- `configure_movie_render_graph_job`
- `render_sequence_with_graph`
- explicit `output_path` overrides are not yet applied; graph-authored output remains authoritative

### USD Stage Editor

- `list_usd_stages`
- `open_usd_stage`
- `get_usd_stage_info`
- `set_usd_stage_time`
- `set_usd_purpose_visibility`
- `reload_usd_stage`
- `save_usd_stage`

### Data Layers

- `list_data_layers`
- `get_data_layer_info`
- `create_data_layer`
- `set_data_layer_loaded`
- `set_data_layer_visible`
- `assign_actor_to_data_layer`
- `remove_actor_from_data_layer`

Current implemented subset:

- `list_data_layers`
- `get_data_layer_info`
- `set_data_layer_loaded`
- `set_data_layer_visible`

### Rendering / ACEScg / MRQ

- `get_project_color_settings`
- `configure_acescg`
- `configure_viewport_rendering`

### Shading / materials / lookdev

- `list_materials`
- `get_material_info`
- `create_material_instance`
- `set_material_parameter`
- `assign_material_to_actor`
- `list_material_parameter_collections`

Current implemented subset:

- `create_material_instance`
- `set_material_parameter` for `scalar`, `vector`, and `texture`
- `assign_material_to_actor`

## Design notes

- Methods should return structured JSON, not formatted text.
- Methods should prefer exact asset paths and stable identifiers over fuzzy display names.
- Sequencer, Movie Render Graph, USD, Data Layers, shading, and render setup are the highest-priority domains.
- The bridge should stay editor-focused and linear-rendering-focused, not gameplay-focused.
- The bridge should expose stable primitives like `execute_python`; bundle-side runtimes should own workflow composition.
- Bundle-side Unreal runtime currently implements level loading, sequencer reads/writes, movie render graph reads/configure/render, core shading reads/writes, and data-layer reads/writes on top of `execute_python`.
