# OpenCode Unreal Bridge

Editor plugin scaffold for the OpenCode Unreal bundle.

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

Implemented bridge primitives:

- `ping`
- `get_capabilities`
- `execute_python`
- `get_project_info`
- `get_editor_state`

Bundle-defined methods are expected to run on top of `execute_python` from the OpenCode bundle runtime.

In other words:

- bridge source of truth: `bridges/opencode_unreal_bridge/`
- bundle method source of truth: `unreal/package/methods/` and `unreal/package/scripts/`

Planned method families already registered in the capability catalog:

- Sequencer
- Movie Render Graph / Movie Render Queue
- USD Stage Editor
- Data Layers
- ACEScg / rendering
- shading / materials / lookdev

## Install into the Unreal fork / engine source

This plugin is intended to ship with the Unreal fork / engine-side source rather than as a per-project override.

Typical target:

```text
D:/EpicGames/Unreal/.../opencode_unreal_bridge/
```

Then regenerate project files or rebuild the editor module and reopen the editor.
