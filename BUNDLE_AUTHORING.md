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
    data/
```

`package/data/` is optional. Use it for read-only runtime reference data such as API
documentation, schemas, endpoint catalogs, static mappings, or fixtures needed by runtime
methods. Do not add `package/data/` unless runtime methods actually need packaged data.

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
- `local_handler`: run an in-process TypeScript handler without contacting the host bridge
- `host_cli`: run a local host binary for offline file-oriented work
- `file_bridge`: exchange command/result files with a live host-side panel or script

Hostless bundles use:

- `direct_api`: handled by an in-process TypeScript handler
- `compose`: implemented by composing other methods or API calls

These strategies are optional. Use `local_handler` for methods that only need packaged data,
local files, schemas or indexes. Use `host_cli` for methods that need an installed host
application but do not require a live bridge session. Do not add a bridge dependency for methods
that can be answered locally. Use `file_bridge` for hosts like After Effects where a ScriptUI panel
polls a filesystem command queue while the application remains open.

Common `requires` keys:

- `bridgeMethods`: host bridge primitives needed by live host-backed methods
- `localData`: packaged datasets needed by local handlers
- `externalBinary`: local executable needed by `host_cli` methods
- `env`: environment variables that affect runtime behavior
- `auth` and `scopes`: API authentication requirements

Examples:

```json
{
  "requires": {
    "localData": ["blender_docs"]
  },
  "execution": {
    "strategy": "local_handler",
    "handler": "docs.search_api"
  }
}
```

```json
{
  "requires": {
    "externalBinary": "blender",
    "env": ["BLENDER_PATH", "PAGECRAN_BLENDER_BIN"]
  },
  "execution": {
    "strategy": "host_cli",
    "handler": "host.audit_file"
  }
}
```

## Packaged Data And Provenance

Use `package/data/<dataset>/` for read-only data that must be available at runtime. Runtime
code may read `package/data/` but must not mutate it.

External vendored datasets must include a provenance file at the dataset root:

```text
package/data/<dataset>/SOURCE.json
```

Recommended shape:

```json
{
  "source": "https://example.invalid/source.git",
  "ref": "v1.0.0",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "updated_at": "2026-05-06T00:00:00.000Z",
  "paths": [
    {
      "source": "upstream/path",
      "target": "."
    }
  ]
}
```

Rules:

- Do not download or update reference data during install, build, or runtime.
- Add an explicit maintenance script under `scripts/` for every external dataset.
- Support `-CheckOnly` for maintenance scripts when practical.
- Pin Git-backed datasets by commit or tag and record the resolved commit in `SOURCE.json`.
- Prefer separate commits for large vendored data updates.
- Document the dataset size and purpose when it is non-trivial.

## Add A Host-Backed Method

1. Add `package/methods/<domain>/<method>.json`.
2. Add a host script under `package/scripts/` if the method uses `host_script`.
3. Ensure the script returns JSON-serializable data.
4. Mention the method in the relevant `package/skills/*/SKILL.md`.
5. Run TypeScript and bundle coherence checks.

For `local_handler` and `host_cli` methods in a host-backed bundle, keep the manifest under
`package/methods/` but implement the handler in the bundle runtime. These methods should still
be documented in skills and covered by coherence checks.

For `file_bridge` methods, document the bridge folder, panel/script installation path and timeout
behavior in the bundle README.

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

Convenience wrapper for the active bundles:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check_all.ps1
```

## Review Checklist

- The method has one manifest source of truth.
- The bridge remains generic and stable.
- Skills mention only real public methods.
- Auth, scopes, bridge methods, local data, external binaries and env requirements are explicit.
- External `package/data/` datasets include `SOURCE.json` and an update script.
- `host_cli` methods document their binary resolution and timeout behavior.
- `file_bridge` methods document their bridge folder, host-side panel/script and timeout behavior.
- Runtime `_runtime/` copies are in sync with `packages/bundle-runtime/src`.
- `node_modules` and `dist` output are not committed.
- Build output still excludes deprecated bundles from `-Bundle all`.
