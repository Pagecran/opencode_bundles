# Pagecran Resolve / Fusion Bundle

This bundle targets both DaVinci Resolve Studio and Fusion Studio through Blackmagic's external scripting API.

It is not an MCP server. It follows the Pagecran bundle model: declared methods, a TypeScript runtime, a small Python host helper, and bundle-local skills.

## Status

MVP bundle for host detection, Resolve project inspection, and Fusion composition graph inspection/editing.

Current scope:

- Resolve Studio project and timeline reads
- active Fusion composition inspection in Resolve or Fusion Studio
- Resolve timeline-item Fusion composition targeting by item id or track/item coordinates
- basic Fusion graph writes: add a tool, set tool inputs

Not in this MVP yet:

- media pool, render, color, or Fairlight workflows
- script/plugin installation workflows

## Install

Install the OpenCode bundle:

```powershell
powershell -ExecutionPolicy Bypass -File .\resolve\install.ps1
```

## Requirements

- DaVinci Resolve Studio for Resolve automation
- Fusion Studio or the Fusion page inside Resolve for Fusion graph automation
- a compatible local Python runtime

`Fusion Render Node` is detected separately. It is useful future surface area for render-node workflows, but it is not a substitute for Fusion Studio when a method needs an interactive composition context.

On Windows, `Python 3.10` is the safest default for the Blackmagic scripting DLLs. If needed, force the interpreter with:

```powershell
$env:PAGECRAN_RESOLVE_PYTHON = "C:\Users\you\AppData\Local\Programs\Python\Python310\python.exe"
```

Optional DLL overrides:

```powershell
$env:PAGECRAN_RESOLVE_SCRIPT_LIB = "C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
$env:PAGECRAN_FUSION_SCRIPT_LIB = "C:\Program Files\Blackmagic Design\Fusion 20\fusionscript.dll"
```

## Host Selection

Most methods accept `host`:

- `auto`: prefer Resolve, then fall back to Fusion
- `resolve`: require DaVinci Resolve Studio
- `fusion`: require Fusion Studio
- `render_node`: target Fusion Render Node when a method supports it

Project methods default to `resolve`.
Fusion graph methods default to `auto` and still require an interactive comp host, not Render Node.

Fusion methods can also target a Resolve timeline-item comp with any of these selectors:

- `timeline_item_id`
- `clip_id`
- `timeline_item={ track_type, track_index, item_index }`

When a timeline-item scope is provided, the bundle requires a live Resolve session and can optionally select a specific comp with `comp_name` or `comp_index`.

## CLI Smoke Tests

Inspect runtime compatibility:

```powershell
python .\resolve\package\bin\pagecran_resolve_cli.py status --pretty
```

Ping the active host:

```powershell
python .\resolve\package\bin\pagecran_resolve_cli.py ping --host auto --pretty
```

## Tools

- `resolve_host_status`
- `resolve_ping`
- `resolve_get_current_page`
- `resolve_list_projects`
- `resolve_get_project_info`
- `resolve_list_timelines`
- `resolve_get_fusion_comp`
- `resolve_list_fusion_tools`
- `resolve_probe_fusion_tool`
- `resolve_add_fusion_tool`
- `resolve_set_fusion_inputs`

## Validation

From `resolve\package`:

```powershell
bun run check:types
bun run check:bundle
```

## Notes

- Resolve external scripting requires the Studio edition.
- Fusion methods can act on the active comp or on a Resolve timeline-item Fusion comp.
- For write operations, prefer listing and probing a comp before editing it.
