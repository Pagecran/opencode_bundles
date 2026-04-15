# Pagecran OpenCode Unreal Bundle

Unreal bundle for the Pagecran OpenCode bundles monorepo.

This bundle is aimed first at **linear animation and rendering workflows**, not gameplay scripting:

- Sequencer and shot workflows
- Movie Render Graph and Movie Render Queue workflows
- USD Stage Editor workflows
- Data Layers driven scene organization
- ACEScg project / viewport / render setup
- shading, materials, lookdev, and render-facing material control
- sequence rendering from Unreal

## Architecture

```text
  OpenCode Agent
       |
       |  6 tools (connect, disconnect, request, events, wait, ping)
       v
  unreal.ts plugin  -- persistent TCP socket bridge connection
       |
       v
  Pagecran Unreal bridge  -- Unreal plugin / editor module
       |
       v
  Unreal Editor APIs (Sequencer, MRG, USD, Data Layers, shading, color pipeline, LiveLink)
```

The plugin exposes **6 generic tools**. Domain knowledge and workflow guidance live in **skills** loaded on demand, following the same model as the Blender bundle.

## What is included

- `package/plugins/unreal.ts` - plugin with persistent TCP bridge tools
- `bridge_plugin/PagecranUnrealBridge/` - Unreal editor plugin scaffold for the bridge side
- `PROTOCOL.md` - JSON-over-TCP protocol and method catalog reference
- `REFERENCE_MAP.md` - mapping from `ChiR24/Unreal_mcp` concepts to the Pagecran bundle model
- `package/bin/pagecran_unreal_cli.mjs` - standalone CLI for bridge debugging and scripting
- `package/skills/*/SKILL.md` - workflow skills for Unreal linear content work
- `install.ps1` - installer for the global OpenCode config

## Tools (always in context)

- `unreal_connect`
- `unreal_disconnect`
- `unreal_request`
- `unreal_events_get`
- `unreal_events_wait`
- `unreal_ping`

## Skills (loaded on-demand)

- `pagecran-unreal-editor` - general editor / project inspection
- `pagecran-unreal-sequencer` - Level Sequence, shots, bindings, keyframes, renders
- `pagecran-unreal-movie-render-graph` - render graph assets, jobs, and graph-driven renders
- `pagecran-unreal-usd-stage` - USD Stage Editor workflows
- `pagecran-unreal-data-layers` - Data Layers and layer state control
- `pagecran-unreal-rendering` - ACEScg, viewport setup, Movie Render Queue and sequence rendering
- `pagecran-unreal-shading` - materials, instances, parameters, assignment, and lookdev

## Install

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

## Unreal side

The bundle expects an Unreal-side bridge plugin or editor module that speaks newline-delimited JSON over TCP.

The included scaffold lives in `bridge_plugin/PagecranUnrealBridge/` and is meant to be copied into an Unreal project's `Plugins/` folder.

Recommended direction:

- keep a small, stable transport layer
- expose generic methods discoverable via `get_capabilities`
- build the actual workflows on top of Unreal's own systems:
  - Sequencer / Level Sequence
  - Movie Render Graph / Movie Render Queue
  - USD Stage Editor
  - Data Layers / World Partition tooling
  - shading and material workflows
  - color pipeline and ACEScg-related project settings
  - LiveLink when realtime ingest or stream-based workflows are needed

## CLI (standalone)

```powershell
node .\package\bin\pagecran_unreal_cli.mjs endpoint --pretty
node .\package\bin\pagecran_unreal_cli.mjs ping --pretty
node .\package\bin\pagecran_unreal_cli.mjs capabilities --pretty
node .\package\bin\pagecran_unreal_cli.mjs send get_capabilities --pretty
```

Current Unreal-side scaffold included in this bundle:

- `bridge_plugin/PagecranUnrealBridge/README.md`
- `bridge_plugin/PagecranUnrealBridge/PagecranUnrealBridge.uplugin`

Implemented bridge methods today:

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

Planned method families already declared in the bridge capability catalog:

- Sequencer
- Movie Render Graph / Movie Render Queue
- USD Stage Editor
- Data Layers
- ACEScg / rendering
- shading / materials / lookdev

## Environment

- `PAGECRAN_UNREAL_HOST` - optional bridge host
- `PAGECRAN_UNREAL_PORT` - optional bridge port
- `PAGECRAN_UNREAL_TIMEOUT_MS` - optional request timeout

Default endpoint: `127.0.0.1:9877`

## Notes

- This bundle now follows the **Blender-style bridge model**, not an MCP-server model
- The current focus is deliberately cinematic / linear-content oriented
- Movie Render Graph and shading are treated as first-class workflow domains
- If no skill is loaded, start with `unreal_request(method: "get_capabilities")`
