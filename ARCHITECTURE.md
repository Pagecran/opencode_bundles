# Pagecran OpenCode Bundle Architecture

Ce document est la reference d architecture actuelle pour les bundles OpenCode Pagecran.

## Principe Directeur

Le modele cible est:

- thin bridge, thick bundle

Cela signifie:

- le bridge hote reste petit, stable et generique
- le bundle porte le catalogue des methodes, les manifests, les scripts, les workflows, les skills et les donnees de reference
- les skills documentent le catalogue reel; elles ne sont pas la source de verite
- une nouvelle methode metier ne doit pas imposer de modifier Blender, Unreal ou un autre bridge hote, sauf si une vraie primitive generique manque
- les methodes qui peuvent etre resolues localement ne doivent pas dependre d une session bridge live

## Profils De Bundle

Deux profils sont supportes.

`host-backed`:

- exemples: `aftereffects`, `blender`, `resolve`, `unreal`
- une application locale execute une partie du travail
- le plugin OpenCode expose peu d outils generiques, par exemple connect/request/events/ping
- les methodes metier sont decrites dans `package/methods/**/*.json`
- les scripts host-side vivent dans `package/scripts/`
- les handlers locaux peuvent vivre dans `package/runtime/` pour les donnees referencees ou les workflows offline optionnels
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
    data/
      <dataset>/
        SOURCE.json
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

Bundle-specific runtimes may add dispatch before or around the shared dispatcher for strategies
that are intentionally local to one bundle, such as `local_handler`, `host_cli` or `file_bridge`. Promote a
strategy to `packages/bundle-runtime/src` only when at least two active bundles need the same
behavior.

Current host-backed profiles:

- Blender: `execute_code`, result marker `__OPENCODE_BLENDER_RESULT__`, stdout read from `response.result`
- Unreal: `execute_python`, result marker `__OPENCODE_UNREAL_RESULT__`, stdout read from `command_result` plus `log_output[].output`

## Execution Strategies

Manifest execution strategies describe where the work runs:

- `bridge_method`: forward directly to a stable bridge primitive
- `host_script`: load a script from `package/scripts/` and execute it through the live host bridge
- `host_function`: import a host-side Python function and execute it through the live host bridge
- `local_handler`: run an in-process TypeScript handler in the bundle runtime
- `host_cli`: run a local external binary without requiring a live bridge
- `file_bridge`: exchange command/result files with a live host-side panel or script
- `direct_api`: call a remote API directly from the bundle runtime
- `compose`: compose other methods or API calls

These strategies are optional and bundle-specific. Use live bridge strategies only when the method
needs the current editor/application session. Use `local_handler` for packaged reference data,
local indexes, schemas and static catalogs. Use `host_cli` for offline file-oriented inspection
that needs an installed host application but not an open editor session. Use `file_bridge` when a
host application must stay open but the bridge transport is a filesystem command queue instead of
a socket or direct subprocess call.

Method requirements should make dependencies explicit:

- `bridgeMethods` for live bridge primitives
- `localData` for datasets under `package/data/`
- `externalBinary` for local executables used by `host_cli`
- `env` for environment variables that affect execution
- `auth` and `scopes` for API-backed bundles

## Packaged Reference Data

Bundles may include read-only runtime data under `package/data/` when runtime methods need it.
Typical examples are API docs, manual excerpts, endpoint catalogs, schemas, static mappings and
test fixtures. Bundles without local reference data should omit `package/data/`.

External vendored datasets must be reproducible:

- include `package/data/<dataset>/SOURCE.json`
- record source URL, ref, resolved commit and copied paths when applicable
- update through an explicit root-level maintenance script under `scripts/`
- never download silently during install, build or runtime
- keep large data-only updates separate when practical

The build flow treats `package/data/` as normal bundle content unless a bundle explicitly excludes
it. Coherence checks should verify required datasets and provenance files for methods declaring
`requires.localData`.

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
- `aftereffects`
- `m365`
- `resolve`
- `unreal`

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

## Coherence Checks

Bundle coherence checks should validate more than method names:

- every public method has a valid manifest shape
- skill references point to real public methods
- `verify.method` references existing methods
- scripts referenced by `host_script` exist under `package/scripts/`
- handlers referenced by `local_handler`, `host_cli`, `file_bridge`, `direct_api` or `compose` exist in the bundle runtime
- datasets referenced by `requires.localData` exist under `package/data/` and include provenance when external
- external binaries and environment variables required by manifests are documented in the bundle README

Checks should fail on broken contracts and warn on incomplete skill coverage or optional data.
