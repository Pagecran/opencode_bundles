# Pagecran Bundle Authoring Guide

This guide describes how to add or maintain Pagecran OpenCode bundles.

## Add A Bundle

Create a root folder with this minimum shape:

```text
<bundle>/
  bundle.json
  install.ps1
  README.md
  package/
    package.json
    tsconfig.json
    plugins/
    runtime/
    methods/
    skills/
```

`bundle.json` must include at least:

```json
{
  "name": "example",
  "displayName": "Example",
  "version": "0.1.0",
  "publishDirName": "example"
}
```

Set `"deprecated": true` to exclude a bundle from `-Bundle all` while keeping explicit builds available.

## Method Manifests

Each public method is described by one JSON file under `package/methods/<domain>/<name>.json`.

Minimal shape:

```json
{
  "name": "load_level",
  "domain": "editor",
  "description": "Open a level in the editor from an asset path.",
  "kind": "host-backed",
  "risk": "write",
  "args": {
    "level_path": {
      "type": "string",
      "required": true,
      "description": "Unreal asset or package path."
    }
  },
  "requires": {
    "bridgeMethods": ["execute_python"]
  },
  "execution": {
    "strategy": "host_script",
    "script": "unreal/editor/load_level.py"
  },
  "verify": {
    "strategy": "followup_method",
    "method": "get_editor_state"
  }
}
```

Required fields:

- `name`
- `domain`
- `description`
- `kind`
- `risk`
- `execution`

Recommended fields:

- `args`
- `returns`
- `requires`
- `verify`

Supported argument types:

- `string`
- `integer`
- `number`
- `boolean`
- `object`
- `array`
- `any`

Risk values:

- `read`
- `write`
- `destructive`

## Execution Strategies

Host-backed bundles use:

- `bridge_method`: forward directly to a bridge primitive
- `host_script`: load a script from `package/scripts/` and execute it through the bridge execution primitive
- `host_function`: import a Python function from `package/scripts/`; currently used by Blender

Hostless bundles use:

- `direct_api`: handled by an in-process TypeScript handler
- `compose`: implemented by composing other methods or API calls

## Add A Host-Backed Method

1. Add `package/methods/<domain>/<method>.json`.
2. Add a host script under `package/scripts/` if the method uses `host_script`.
3. Ensure the script returns JSON-serializable data.
4. Mention the method in the relevant `package/skills/*/SKILL.md`.
5. Run TypeScript and bundle coherence checks.

Blender example checks:

```powershell
bunx tsc --noEmit -p .\blender\package\tsconfig.json
bun --cwd .\blender\package run check:bundle
```

Unreal example checks:

```powershell
bunx tsc --noEmit -p .\unreal\package\tsconfig.json
bun --cwd .\unreal\package run check:bundle
```

## Add A Hostless Method

1. Add the method manifest under `package/methods/`.
2. Add the TypeScript handler in the bundle runtime dispatcher.
3. Declare auth, scopes and env requirements in `requires`.
4. Mention the method in the relevant skill.
5. Run TypeScript and coherence checks.

Microsoft 365 checks:

```powershell
bunx tsc --noEmit -p .\m365\package\tsconfig.json
bun --cwd .\m365\package run check:bundle
```

## Skills

Skills should explain workflows, guardrails and examples. They should not invent method names.

For every method mentioned in a skill:

- the method must exist in `package/methods/`
- the method must be public
- the documented arguments should match the manifest and runtime behavior

The coherence check verifies skill method references against manifests.

## Shared Runtime Workflow

Edit shared runtime source in:

```text
packages/bundle-runtime/src/
```

Then sync vendored copies:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_runtime.ps1
```

Check for drift without changing files:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_runtime.ps1 -CheckOnly
```

Equivalent from `packages/bundle-runtime/`:

```powershell
bun run runtime:sync-check
```

## Standard Validation

Run the touched bundle checks first. Before packaging or review, run:

```powershell
bunx tsc --noEmit -p .\packages\bundle-runtime\tsconfig.json
bunx tsc --noEmit -p .\blender\package\tsconfig.json
bunx tsc --noEmit -p .\m365\package\tsconfig.json
bunx tsc --noEmit -p .\unreal\package\tsconfig.json
bun --cwd .\blender\package run check:bundle
bun --cwd .\m365\package run check:bundle
bun --cwd .\unreal\package run check:bundle
powershell -ExecutionPolicy Bypass -File .\scripts\sync_runtime.ps1 -CheckOnly
powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle all -SkipPublish
```

## Review Checklist

- The method has one manifest source of truth.
- The bridge remains generic and stable.
- Skills mention only real public methods.
- Auth, scopes, bridge methods and env requirements are explicit.
- Runtime `_runtime/` copies are in sync with `packages/bundle-runtime/src`.
- `node_modules` and `dist` output are not committed.
- Build output still excludes deprecated bundles from `-Bundle all`.
