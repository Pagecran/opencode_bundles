# Pagecran After Effects Bundle

This bundle controls Adobe After Effects through a small ExtendScript ScriptUI panel and OpenCode tools.

It is not an MCP server. It follows the Pagecran bundle model: declared methods, TypeScript runtime, and skills.

## Status

MVP bundle for project inspection, composition creation, text layers and simple layer transform edits.

## Install

Install the OpenCode bundle:

```powershell
powershell -ExecutionPolicy Bypass -File .\aftereffects\install.ps1
```

The installer also tries to copy `pagecran-ae-bridge.jsx` into every detected After Effects `ScriptUI Panels` folder under `C:\Program Files\Adobe\Adobe After Effects*`.

Override the target or skip that step when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\aftereffects\install.ps1 -AfterEffectsScriptsDir "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels"
powershell -ExecutionPolicy Bypass -File .\aftereffects\install.ps1 -SkipBridgeInstall
```

You can still install the bridge panel manually or with the CLI:

```powershell
node .\aftereffects\package\bin\pagecran_aftereffects_cli.mjs install-bridge --target "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Scripts\ScriptUI Panels"
```

Then restart After Effects and open:

```text
Window > pagecran-ae-bridge.jsx
```

The panel starts polling automatically. Keep it open while using the tools.

## Bridge Folder

Default:

```text
%LOCALAPPDATA%\Pagecran\AfterEffectsBridge
```

The installer prepares `commands/` and `results/` in that folder automatically.

Override:

```powershell
$env:PAGECRAN_AFTEREFFECTS_BRIDGE_DIR = "D:\ae-bridge"
```

Check endpoint:

```powershell
node .\aftereffects\package\bin\pagecran_aftereffects_cli.mjs endpoint --pretty
```

## Tools

- `ae_bridge_status`
- `ae_cleanup_bridge_files`
- `ae_ping`
- `ae_get_project_info`
- `ae_list_compositions`
- `ae_create_composition`
- `ae_add_text_layer`
- `ae_set_layer_properties`
- `ae_execute_script`

## Validation

From `aftereffects\package`:

```powershell
bun run check:types
bun run check:bundle
```

## Notes

- After Effects must be open for host-backed methods.
- The ScriptUI panel must be open and polling.
- `ae_execute_script` executes trusted ExtendScript only; prefer safer typed methods.
