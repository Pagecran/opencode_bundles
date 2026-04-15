---
name: pagecran-unreal-movie-render-graph
description: |
  Work with Unreal Movie Render Graph and graph-driven render jobs.

  Triggers when user mentions:
  - "Movie Render Graph"
  - "MRG"
  - "render graph"
  - "graph-driven render"
---

## Priority

Movie Render Graph is a first-class Unreal workflow for Pagecran.
Prefer graph-based render orchestration when the user is building reusable cinematic render pipelines.

Current scaffold status:

- `list_movie_render_graphs` is expected to work first
- `get_movie_render_graph_info` is expected to work first
- `configure_movie_render_graph_job` is expected to work first
- `render_sequence_with_graph` is expected to work first
- explicit output-path overrides still stay in the next implementation wave; graph-authored output remains authoritative

## How to call methods

Use:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Inspect the render graph asset and current job wiring first.
2. Confirm the sequence, map, output path, graph asset, and overrides before rendering.
3. Prefer reusable graph assets over one-off hidden settings when the pipeline should stay repeatable.
4. Report the final graph, render target, and output configuration clearly.

## Expected methods

### `list_movie_render_graphs`

List available Movie Render Graph assets.

### `get_movie_render_graph_info`

Read graph asset metadata, exposed parameters, and referenced render nodes.

### `create_movie_render_graph_config`

Create a new Movie Render Graph configuration asset.

### `configure_movie_render_graph_job`

Bind a graph config to a render job, set the sequence, map, and graph parameter overrides.

### `render_sequence_with_graph`

Launch a render through Movie Render Graph.

## Guardrails

- Before launching a render, confirm graph asset, sequence, map, output path, frame range, and overwrite behavior.
- Prefer exact asset paths for graph configs and presets.
- Treat graph parameter overrides as part of the render spec and report them back.
