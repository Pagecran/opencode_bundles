---
name: pagecran-aftereffects-project
description: Work with Adobe After Effects projects, compositions, text layers and simple layer transforms through the Pagecran bridge.
---

# Skill: pagecran-aftereffects-project

## When To Use

Use this skill when the user mentions After Effects, AE projects, compositions, text layers, motion graphics, key composition setup, or simple layer transforms.

## Bridge Setup

The bundle uses the `pagecran-ae-bridge.jsx` ScriptUI panel inside After Effects.

1. Run `aftereffects/install.ps1` first; it tries to copy `scripts/pagecran-ae-bridge.jsx` into detected `ScriptUI Panels` folders automatically.
2. If auto-install did not detect After Effects, copy `scripts/pagecran-ae-bridge.jsx` into the right `ScriptUI Panels` folder manually or with the CLI.
3. Restart After Effects if needed.
4. Open `Window > pagecran-ae-bridge.jsx`.
5. Ensure polling is started in the panel.

The default bridge folder is:

```text
%LOCALAPPDATA%\Pagecran\AfterEffectsBridge
```

Override it with `PAGECRAN_AFTEREFFECTS_BRIDGE_DIR` when needed.

## Preferred Flow

1. Call `ae_bridge_status` to inspect the local bridge folder.
2. Call `ae_ping` to confirm the live After Effects panel is polling.
3. Use read methods before write methods.
4. For write methods, use specific methods before `ae_execute_script`.

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

## Guardrails

- Do not use `ae_execute_script` unless the user explicitly asks for a custom script or a workflow is not covered by a safer method.
- Tell the user when a method requires the After Effects panel to be open.
- Keep composition and layer edits small and reversible.
- Prefer exact composition and layer names; ask a short clarification when ambiguous.
