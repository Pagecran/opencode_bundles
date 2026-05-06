# Pagecran OpenCode Blender Bundle

Blender bundle for the Pagecran OpenCode bundles monorepo.

Deployed to `C:\Users\<user>\.config\opencode\` — available from any repo.

## Architecture

```
  OpenCode Agent
       |
       |  primary tool: blender_request
        v
  blender.ts plugin  ──  persistent TCP socket + bundle runtime dispatcher
       |
       v
  opencode_blender_bridge  ──  Blender extension (addon)
        |
        v
   Blender Python API (bpy)
```

The plugin exposes one primary workflow tool, `blender_request`, plus a few low-level bridge/debug helpers. Domain knowledge (method names, parameters, workflows) lives in **skills** that are loaded on-demand, keeping the base token cost minimal.

## What is included

| Path | Role |
|------|------|
| `package/plugins/blender.ts` | Plugin: persistent socket, bundle runtime dispatcher, JSONL request logging |
| `package/runtime/*` | Bundle-side runtime: dispatcher, registry, validation |
| `package/methods/*` | Bundle-side method source of truth |
| `package/scripts/blender/*` | Bundle-side Blender workflow scripts executed through `execute_code` |
| `package/data/blender_docs/*` | Vendored Blender API and manual docs used by local documentation methods |
| `package/skills/*/SKILL.md` | Domain skills with method catalogs and guardrails |
| `package/bin/pagecran_blender_cli.py` | Standalone Python CLI for manual/scripted bridge access |
| `install.ps1` | Installer that deploys the bundle into the global OpenCode config |

## Tools (always in context)

| Tool | Purpose |
|------|---------|
| `blender_request` | Primary workflow tool. Call any bundle-defined Blender method using `method` + `params`. |
| `blender_connect` | Low-level debug helper to open the socket manually. Usually unnecessary because `blender_request` auto-connects. |
| `blender_disconnect` | Low-level debug helper to close the socket manually. |
| `blender_events_get` | Advanced helper for reading buffered bridge events. |
| `blender_events_wait` | Advanced helper for waiting on bridge events. |
| `pagecran_ping` | Low-level bridge health check. |

## Skills (loaded on-demand)

| Skill | Triggers |
|-------|----------|
| `pagecran-blender-scene` | "Blender scene", "create an object", "move the camera", "delete an object", "list objects", "inspect the scene" |
| `pagecran-blender-geometry-nodes` | "Geometry Nodes", "node tree", "scatter on surface" |
| `pagecran-blender-shader-editor` | "shader editor", "material nodes", "assign a material", "vrscene", "vray material" |
| `pagecran-blender-asset-browser` | "asset browser", "asset library", "mark as asset" |
| `pagecran-blender-animation` | "animate this", "turntable", "keyframe" |
| `pagecran-blender-shot-manager` | "Shot Manager", "shot list", "batch render" |
| `pagecran-blender-docs` | "Blender API", "bpy docs", "Blender manual" |
| `pagecran-blender-audit` | "audit blend", "missing files", "linked libraries", "preflight" |

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
- Default bridge endpoint: `127.0.0.1:9876`.
- Socket port is configurable in the extension preferences.
- Do not assume `8765`; this bundle intentionally uses its own default to avoid conflicts with other Blender bridge tooling.
- Canonical deployed path in the workgroup repo: `R:\Workgroup_Blender\Extension\System\opencode_blender_bridge`

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

Normal method call shape:

```text
blender_request(method: "get_scene_info")
blender_request(method: "delete_object", params: { name: "Cube" })
```

Do not pass method arguments at the top level of the tool call.

## Vendored Blender Documentation

The bundle includes a complete vendored copy of the Blender MCP documentation dataset from Blender Lab:

- `package/data/blender_docs/api/` - Blender Python API reference
- `package/data/blender_docs/manual/` - Blender user manual
- `package/data/blender_docs/SOURCE.json` - source URL, ref and resolved commit

Maintenance command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update_blender_docs.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\update_blender_docs.ps1 -CheckOnly
```

Documentation methods are local bundle methods and do not require Blender to be open:

- `search_blender_api_docs`
- `search_blender_manual`
- `get_blender_api_docs`

## Offline Blend Audits

The bundle can inspect `.blend` files on disk without a live bridge session:

- `get_blendfile_summary_path_info`
- `get_blendfile_summary_datablocks`
- `get_blendfile_summary_missing_files`
- `get_blendfile_summary_linked_libraries`

The path-info method is local. Other audit methods launch Blender in background mode and resolve the executable in this order:

1. `PAGECRAN_BLENDER_BIN`
2. `BLENDER_PATH`
3. `BLENDER_BIN`
4. `blender` from `PATH`

Offline audits read the file from disk; unsaved changes in an open Blender session are not included.

## VRScene Material Conversion

The Blender bundle now starts exposing the old V-Ray `.vrscene` conversion layer through `blender_request`:

- `analyze_vrscene_file`
- `convert_vrscene_file`
- `convert_vrscene_folder`

These methods come from the former Pagecran MCP material-conversion tooling and support triplanar parsing plus `UVWGenRandomizer` inspection.
For faithful random-UVW reconstruction, provide a compatible custom shader mapping group through `mapping_group_name` and optionally `group_socket_map`.
