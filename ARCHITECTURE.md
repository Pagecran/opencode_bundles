# Pagecran OpenCode Bundle Architecture

Ce document est la reference d architecture actuelle pour les bundles OpenCode Pagecran.

## Principe Directeur

Le modele cible est:

- thin bridge, thick bundle

Cela signifie:

- le bridge hote reste petit, stable et generique
- le bundle porte le catalogue des methodes, les manifests, les scripts, les workflows et les skills
- les skills documentent le catalogue reel; elles ne sont pas la source de verite
- une nouvelle methode metier ne doit pas imposer de modifier Blender, Unreal ou un autre bridge hote, sauf si une vraie primitive generique manque

## Profils De Bundle

Deux profils sont supportes.

`host-backed`:

- exemples: `blender`, `unreal`
- une application locale execute une partie du travail
- le plugin OpenCode expose peu d outils generiques, par exemple connect/request/events/ping
- les methodes metier sont decrites dans `package/methods/**/*.json`
- les scripts host-side vivent dans `package/scripts/`
- le bridge hote expose seulement des primitives stables comme `ping`, `get_capabilities`, `execute_code` ou `execute_python`

`hostless`:

- exemple: `m365`
- le plugin OpenCode parle directement a une API ou un service
- les manifests restent la source de verite
- les handlers TypeScript restent dans le bundle et sont verifies contre les manifests
- les prerequis auth, scopes et comportements Graph doivent etre declares cote bundle

## Structure Courante

```text
<bundle>/
  bundle.json
  install.ps1
  README.md
  package/
    package.json
    tsconfig.json
    plugins/
      <bundle>.ts
    runtime/
      dispatcher.ts
      method_registry.ts
      coherence_check.ts
    _runtime/
      ... copied from packages/bundle-runtime/src
    methods/
      <domain>/
        <method>.json
    scripts/
      ... optional host-side implementation
    skills/
      <skill>/SKILL.md
```

The shared runtime source of truth lives in:

- `packages/bundle-runtime/src/`

Each bundle contains a vendored copy in:

- `<bundle>/package/_runtime/`

This keeps every bundle self-contained at packaging time while still avoiding hand-maintained runtime duplication.

## Shared Runtime

The shared runtime provides:

- JSON manifest loading from `methods/**/*.json`
- OpenCode tool schema creation from manifest args
- manifest argument validation and defaulting
- generic host-backed dispatch through a `BridgeProfile`
- coherence checks between manifests, handlers and skills
- output serialization helpers

Current host-backed profiles:

- Blender: `execute_code`, result marker `__OPENCODE_BLENDER_RESULT__`, stdout read from `response.result`
- Unreal: `execute_python`, result marker `__OPENCODE_UNREAL_RESULT__`, stdout read from `command_result` plus `log_output[].output`

## Bridge Contract

A host bridge should expose only stable primitives:

- `ping`
- `get_capabilities`
- one generic execution primitive, such as `execute_code` or `execute_python`
- session and event primitives when the host needs them
- low-level host primitives only when they are durable and genuinely host-specific

Avoid adding studio workflow commands to the bridge, such as:

- `load_level`
- `assign_material`
- `create_shot`
- `scatter_asset`

Those belong in manifests plus bundle-side scripts.

## Bundle Status

Active bundles built by `-Bundle all`:

- `blender`
- `m365`
- `unreal`

Deprecated bundles:

- `teams`, replaced by `m365`; it can still be built explicitly with `-Bundle teams`

## Build Flow

`scripts/build_bundle.ps1` runs `scripts/sync_runtime.ps1` before staging bundles. This ensures each bundle packages the current vendored runtime.

Build all non-deprecated bundles locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle all -SkipPublish
```

Build one bundle locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle blender -SkipPublish
```

## Sync Guarantees

After editing `packages/bundle-runtime/src`, sync the vendored copies:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_runtime.ps1
```

To verify that all vendored copies match the shared source:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync_runtime.ps1 -CheckOnly
```

Equivalent from `packages/bundle-runtime/`:

```powershell
bun run runtime:sync-check
```

The check fails on missing, extra or outdated files in any `_runtime/` copy.
