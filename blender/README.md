# Pagecran OpenCode Blender Bundle

Blender bundle for the Pagecran OpenCode bundles monorepo.

Deployed to `C:\Users\<user>\.config\opencode\` — available from any repo.

## Architecture

```
  OpenCode Agent
       |
       |  6 tools (blender_request, connect, disconnect, events, ping)
       v
  blender.ts plugin  ──  persistent TCP socket + bundle runtime dispatcher
       |
       v
  opencode_blender_bridge  ──  Blender extension (addon)
        |
        v
   Blender Python API (bpy)
```

The plugin exposes **6 generic tools**. Domain knowledge (method names, parameters, workflows) lives in **skills** that are loaded on-demand, keeping the base token cost minimal.

## What is included

| Path | Role |
|------|------|
| `package/plugins/blender.ts` | Plugin: persistent socket, bundle runtime dispatcher, JSONL request logging |
| `package/runtime/*` | Bundle-side runtime: dispatcher, registry, validation |
| `package/methods/*` | Bundle-side method source of truth |
| `package/scripts/blender/*` | Bundle-side Blender workflow scripts executed through `execute_code` |
| `package/skills/*/SKILL.md` | 9 domain skills with method catalogs and guardrails |
| `package/bin/pagecran_blender_cli.py` | Standalone Python CLI for manual/scripted bridge access |
| `install.ps1` | Installer that deploys the bundle into the global OpenCode config |

## Tools (always in context)

| Tool | Purpose |
|------|---------|
| `blender_connect` | Establish persistent socket connection |
| `blender_disconnect` | Close connection |
| `blender_request` | Call any bridge method (the workhorse) |
| `blender_events_get` | Read buffered push events |
| `blender_events_wait` | Wait for push events |
| `pagecran_ping` | Health check |

## Skills (loaded on-demand)

| Skill | Triggers |
|-------|----------|
| `pagecran-blender-scene` | "Blender scene", "create an object", "move the camera" |
| `pagecran-blender-geometry-nodes` | "Geometry Nodes", "node tree", "scatter on surface" |
| `pagecran-blender-shader-editor` | "shader editor", "material nodes", "assign a material", "vrscene", "vray material" |
| `pagecran-blender-asset-browser` | "asset browser", "asset library", "mark as asset" |
| `pagecran-blender-blenderkit` | "BlenderKit", "find a BlenderKit asset" |
| `pagecran-blender-sketchfab` | "Sketchfab", "import from Sketchfab" |
| `pagecran-blender-bradley-presets` | "Bradley preset", "mograph style node group" |
| `pagecran-blender-animation` | "animate this", "turntable", "keyframe" |
| `pagecran-blender-shot-manager` | "Shot Manager", "shot list", "batch render" |

Each skill contains a **method catalog** (method names, parameter tables, types) and **domain knowledge** (Blender conventions, common patterns).

## Install

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

## Blender side

The backend is the `opencode_blender_bridge` extension:

- No sidebar panel needed.
- Enable or reload **OpenCode Blender Bridge** in Blender.
- Socket port is configured in the extension preferences.

## Request logging

Every `blender_request` call is logged to `%TEMP%\pagecran-bridge\requests.jsonl`:

```json
{"ts":"2026-04-06T12:00:00.000Z","method":"create_object","params_keys":["primitive","name"],"success":true,"duration_ms":42}
```

This log enables future analysis of usage patterns, error rates, and workflow optimization.

## CLI (standalone)

The Python CLI talks directly to the minimal bridge, so it is best suited for low-level debugging:

```powershell
python "$env:USERPROFILE\.config\opencode\bin\pagecran_blender_cli.py" ping --pretty
python "$env:USERPROFILE\.config\opencode\bin\pagecran_blender_cli.py" send get_capabilities --pretty
python "$env:USERPROFILE\.config\opencode\bin\pagecran_blender_cli.py" send execute_code --params-json '{"code":"print(123)"}' --pretty
```

Bundle-defined scene, shader, asset, and workflow methods are exposed through `blender_request` inside OpenCode, not as direct bridge commands.

## VRScene Material Conversion

The Blender bundle now starts exposing the old V-Ray `.vrscene` conversion layer through `blender_request`:

- `analyze_vrscene_file`
- `convert_vrscene_file`
- `convert_vrscene_folder`

These methods come from the former Pagecran MCP material-conversion tooling and support triplanar parsing plus `UVWGenRandomizer` inspection.
For faithful random-UVW reconstruction, provide a compatible custom shader mapping group through `mapping_group_name` and optionally `group_socket_map`.
