# Pagecran Unreal Bridge

Editor plugin scaffold for the Pagecran OpenCode Unreal bundle.

This plugin is designed for **linear animation / rendering** workflows first:

- Sequencer and shot control
- Movie Render Graph and Movie Render Queue orchestration
- USD Stage Editor workflows
- Data Layers state management
- ACEScg and render-pipeline setup
- shading, materials, and lookdev support
- sequence rendering

## Transport

- TCP socket server
- default endpoint: `127.0.0.1:9877`
- newline-delimited JSON messages

The message format follows the same broad pattern as the Blender bridge:

```json
{"type":"request","id":"...","method":"ping","params":{}}
{"type":"result","id":"...","result":{"ok":true}}
{"type":"event","name":"bridge_status","data":{"state":"connected"}}
```

## Current scaffold status

Implemented methods:

- `ping`
- `get_capabilities`
- `get_project_info`
- `get_editor_state`
- `list_level_sequences`
- `get_sequence_info`
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

Planned method families already registered in the capability catalog:

- Sequencer
- Movie Render Graph / Movie Render Queue
- USD Stage Editor
- Data Layers
- ACEScg / rendering
- shading / materials / lookdev

## Install into an Unreal project

Copy this folder into your Unreal project:

```text
YourProject/Plugins/PagecranUnrealBridge/
```

Then regenerate project files and reopen the editor.
