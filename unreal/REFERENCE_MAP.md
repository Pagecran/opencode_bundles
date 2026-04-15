# Unreal Reference Map

Primary external reference for this bundle:

- `ChiR24/Unreal_mcp`

Local clone used during development:

- `D:\tmp\Unreal_mcp-reference`

## What we reuse

We reuse the **domain coverage and handler decomposition**, not the MCP server architecture.

- many focused Unreal-side handler families
- strong Sequencer support
- strong material / authoring support
- World Partition / Data Layers coverage
- render pipeline coverage where useful

## What we intentionally do not copy

- MCP transport and server structure
- tool explosion at the OpenCode layer
- gameplay-first domains that do not matter to Pagecran's linear-rendering workflows

## Mapping strategy

`Unreal_mcp` style:

- many MCP tools and automation actions
- Unreal plugin handlers per domain

Pagecran bundle style:

- a few generic OpenCode tools: `unreal_connect`, `unreal_request`, `unreal_events_*`, `unreal_ping`
- one Unreal bridge plugin with a method catalog returned by `get_capabilities`
- skills carry the workflow intelligence

## Current high-value mappings

### Sequencer

Reference inspiration:

- `src/tools/sequence.ts`
- `plugins/McpAutomationBridge/.../McpAutomationBridge_SequencerHandlers.cpp`

Pagecran methods:

- `list_level_sequences`
- `get_sequence_info`
- `add_track`
- `set_keyframe`
- `add_camera_cut`
- planned: `render_sequence`

### Shading / materials

Reference inspiration:

- `plugins/McpAutomationBridge/.../McpAutomationBridge_MaterialAuthoringHandlers.cpp`

Pagecran methods:

- `list_materials`
- `get_material_info`
- `create_material_instance`
- `set_material_parameter`
- `assign_material_to_actor`
- `list_material_parameter_collections`

### Movie Render Graph

Reference inspiration:

- `Unreal_mcp` broad render-pipeline organization
- Pagecran-specific bridge methods for graph discovery and graph-oriented render workflows

Pagecran methods:

- `list_movie_render_graphs`
- `get_movie_render_graph_info`
- `configure_movie_render_graph_job`
- `render_sequence_with_graph`
- planned: `configure_acescg`

### Data Layers / World Partition

Reference inspiration:

- `plugins/McpAutomationBridge/.../McpAutomationBridge_WorldPartitionHandlers.cpp`

Pagecran methods:

- `list_data_layers`
- `get_data_layer_info`
- `set_data_layer_loaded`
- `set_data_layer_visible`

### Rendering / ACEScg

Reference inspiration:

- render-focused handler patterns from `Unreal_mcp`
- custom Pagecran additions for ACEScg-oriented linear rendering

Pagecran methods:

- planned: `configure_acescg`
