---
name: pagecran-unreal-rendering
description: |
  Configure Unreal for linear rendering workflows, including ACEScg, viewport setup, Movie Render Queue, and sequence renders.

  Triggers when user mentions:
  - "ACEScg"
  - "Movie Render Queue"
  - "render setup"
  - "viewport setup"
---

## Priority

This is a primary Unreal workflow for Pagecran.
The goal is reliable linear animation rendering, not interactive gameplay behavior.

## How to call methods

Use:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Inspect current project, viewport, and render settings first.
2. Configure color pipeline and viewport state explicitly.
3. Confirm Movie Render Queue or sequence render parameters before launching a render.
4. Report the final settings that matter for reproducibility.

## Expected methods

### `get_project_color_settings`

Read project-wide color-management and rendering settings relevant to ACEScg workflows.

### `configure_acescg`

Apply project settings for an ACEScg-oriented workflow.

### `configure_viewport_rendering`

Apply viewport settings for lookdev / review consistency.

### `get_movie_render_queue_info`

Read MRQ presets, jobs, and output settings.

### `configure_movie_render_job`

Set sequence, map, preset, output path, frame range, and overrides.

### `set_render_output`

Set render destination and naming pattern.

### `render_sequence`

Launch a sequence render once setup is validated.

## Related domains

- Prefer the dedicated `pagecran-unreal-movie-render-graph` skill when the user is explicitly working with Movie Render Graph assets or graph-driven jobs.
- Prefer the dedicated `pagecran-unreal-shading` skill when the request is primarily about materials, shader parameters, or lookdev.

## Guardrails

- Before rendering, always confirm sequence, preset, output path, frame range, and overwrite behavior.
- Treat project-wide color settings as high-impact changes and report them clearly.
- Prefer explicit setup over hidden defaults when ACEScg consistency matters.
