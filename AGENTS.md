# AGENTS.md

Guidance for coding agents working in `D:\opencode_bundles`.

Last reviewed: 2026-04-22.

## Repo Overview

- This is a small monorepo for Pagecran OpenCode bundles.
- Primary bundle roots are `blender/`, `m365/`, `teams/`, and `unreal/`.
- Canonical host-side bridge sources should live directly under `bridges/` at the repo root.
- Shared packaging lives in `scripts/build_bundle.ps1`.
- Local build output goes to `dist/`.
- Each bundle follows the same shape: `bundle.json`, `install.ps1`, `README.md`, `package/`.
- `package/` contains the plugin source, CLI helpers, skills, and local TS config.

## Rule Files

- No `.cursor/rules/` files were found.
- No `.cursorrules` file was found.
- No `.github/copilot-instructions.md` file was found.
- Do not assume extra editor-specific rules beyond this file and the repository sources.

## Build Commands

- Build one bundle locally without publishing:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle blender -SkipPublish`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle m365 -SkipPublish`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle teams -SkipPublish`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle unreal -SkipPublish`
- Build all bundles locally without publishing:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle all -SkipPublish`
- Build and publish a bundle to the default NAS target:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\build_bundle.ps1 -Bundle blender`
- The build script stages `dist/<bundle>/<version>` and excludes `.git`, `.codenomad`, `dist`, `package\node_modules`, and Python `__pycache__`.

## Install Commands

- Install the Blender bundle into the user's OpenCode config:
  - `powershell -ExecutionPolicy Bypass -File .\blender\install.ps1`
- Install the Microsoft 365 bundle into the user's OpenCode config:
  - `powershell -ExecutionPolicy Bypass -File .\m365\install.ps1`
- Install the Teams bundle into the user's OpenCode config:
  - `powershell -ExecutionPolicy Bypass -File .\teams\install.ps1`
- Install the Unreal bundle into the user's OpenCode config:
  - `powershell -ExecutionPolicy Bypass -File .\unreal\install.ps1`
- Append `-SkipBunInstall` if you want the installer to skip dependency installation.
- For package-local development, prefer `bun install` inside the relevant `package/` directory; `npm install` is the practical fallback.
- Keep dependencies minimal; current packages only depend on `@opencode-ai/plugin`, `typescript`, and `@types/node`.

## Lint And Static Checks

- There is no dedicated linter configured.
- Use TypeScript compile checks as the main static validation step for TS files.
- Each bundle has its own `package.json` and `tsconfig.json`; there is no root workspace toolchain.
- Run from the relevant bundle `package/` directory:
  - `bunx tsc --noEmit -p tsconfig.json`
- Equivalent root-relative form:
  - `bunx tsc --noEmit -p .\blender\package\tsconfig.json`
  - `bunx tsc --noEmit -p .\m365\package\tsconfig.json`
  - `bunx tsc --noEmit -p .\teams\package\tsconfig.json`
  - `bunx tsc --noEmit -p .\unreal\package\tsconfig.json`
- Microsoft 365 bundle coherence check:
  - from `m365\package\`: `bun run check:bundle`
  - root-relative: `bun --cwd .\m365\package run check:bundle`
- The checked-in TS configs include the bundle runtime for bundles that have started the manifest-driven migration.
- If you change CLI JS/MJS or Python files, do a manual smoke test because TS will not cover them.

## Test Commands

- There is no automated test suite in this repo today.
- There is no single-test command because there are no checked-in unit or integration tests.
- If the repo gains tests later, update this file with the exact single-test command immediately.
- For now, use targeted smoke tests for the file or bundle you changed.

## Smoke Test Commands

- Blender CLI endpoint check:
  - `python .\blender\package\bin\pagecran_blender_cli.py endpoint --pretty`
- Blender bridge ping:
  - `python .\blender\package\bin\pagecran_blender_cli.py ping --pretty`
- Microsoft 365 CLI auth status:
  - `node .\m365\package\bin\pagecran_m365_cli.mjs status`
- Microsoft 365 Graph smoke test after auth:
  - `node .\m365\package\bin\pagecran_m365_cli.mjs ping`
- Teams CLI auth status:
  - `node .\teams\package\bin\pagecran_teams_cli.mjs status`
- Teams Graph smoke test after auth:
  - `node .\teams\package\bin\pagecran_teams_cli.mjs request GET /me`
- Unreal CLI endpoint check:
  - `node .\unreal\package\bin\pagecran_unreal_cli.mjs endpoint --pretty`
- Unreal bridge ping:
  - `node .\unreal\package\bin\pagecran_unreal_cli.mjs ping --pretty`

## Architecture Conventions

- Keep the tool surface small and generic.
- Put domain-specific workflows and method catalogs in `package/skills/*/SKILL.md`, not in the core plugin interface.
- Blender and Unreal plugins are persistent TCP socket bridges using newline-delimited JSON.
- Do not assume the canonical host-side bridge sources live inside a bundle folder; prefer first-level folders under `bridges/` at the repo root.
- Treat Unreal bridge changes as high-cost: the Unreal plugin is intended to ship with the Unreal fork/engine, not as a per-project override.
- Keep backward-compatible message coercion when touching bridge protocol parsing.
- Preserve the split between plugin transport code and domain instructions.
- When changing a tool contract, update the related README and skill docs in the same change.

## TypeScript Style

- The repo uses ESM with `"type": "module"`.
- Use `node:` specifiers for built-in modules.
- Order imports with Node built-ins first, package imports after.
- Keep type imports inline when convenient, for example `import { tool, type Plugin } from "@opencode-ai/plugin"`.
- Use double quotes and omit semicolons.
- Use 2-space indentation.
- Prefer `const` by default; use `let` only when reassignment is necessary.
- Prefer small helper functions over deeply nested inline logic.
- Use early returns to keep control flow flat.
- Keep long boolean expressions and fallback chains split over multiple lines.
- Preserve the existing section-banner style in long files when editing those files.

## TypeScript Types

- TS configs are `strict: true`; keep new TS code strict-type-clean.
- Define explicit aliases for protocol payloads, session state, and normalized responses.
- Use `unknown` or `any` only at system boundaries, then normalize quickly.
- Prefer narrow helper functions like `resolveHost`, `resolvePort`, `clampPositiveInt`, and `normalizeSessionId` instead of ad hoc parsing.
- Keep tool argument schemas aligned with runtime behavior.
- Return JSON-serializable plain objects or strings from tools.
- Format human-facing JSON with `JSON.stringify(value, null, 2)`.

## Naming Conventions

- Use `PascalCase` for classes and TS type aliases.
- Use `camelCase` for TS variables, functions, and internal helpers.
- Use `UPPER_SNAKE_CASE` for module-level constants.
- Use `snake_case` for external tool arguments and protocol fields that are part of the public interface.
- Keep tool names descriptive and stable, for example `teams_read_channel_messages` and `unreal_events_wait`.
- In PowerShell, use `Verb-Noun` function names.
- In Python, use `snake_case` for functions and variables.

## Error Handling

- Fail fast with explicit, actionable error messages.
- Validate required inputs before performing file, network, or auth work.
- Preserve the current pattern of best-effort logging wrapped in `try/catch` that never blocks the main tool path.
- Clean up timers, sockets, and pending requests on both error and manual close paths.
- Retry only where the existing code already establishes a pattern, such as Teams token refresh after a 401.
- Prefer returning structured error context over vague messages.
- Keep CLI exit codes meaningful: success `0`, fatal runtime or usage errors `1`, request-level logical errors `2` where already established.

## PowerShell Style

- Use 4-space indentation.
- Keep `param(...)` blocks at the top of the file.
- Set `$ErrorActionPreference = "Stop"` in scripts that should fail hard.
- Use helper functions for repeated file and directory operations.
- Prefer `Join-Path`, `Test-Path -LiteralPath`, and `Copy-Item -LiteralPath` over stringly-typed path manipulation.
- When converting JSON-derived objects, follow the existing `ConvertTo-PlainObject` pattern.
- Preserve the current installer behavior of merging `package.json` dependency sections instead of overwriting unrelated keys.

## Python Style

- Follow the existing CLI style in `pagecran_blender_cli.py`.
- Use `from __future__ import annotations` in typed Python modules.
- Use standard library modules only unless a new dependency is clearly justified.
- Use 4-space indentation and type annotations on public helpers.
- Keep command parsing in `argparse` and return numeric exit codes from `main()`.
- Print user-facing errors to stderr and exit non-zero.

## Documentation And Text

- Preserve the language already used by the file you edit.
- The root `README.md` is in French.
- Bundle READMEs are primarily in English.
- Keep docs concrete and operational; include exact commands instead of placeholders.
- Document new commands, tools, and environment variables in the relevant bundle README.
- If you add linting or tests, update this file with the exact repo command and the single-test form.

## Practical Agent Workflow

- Read `BUNDLE_RUNTIME_SPEC.md` before making bundle-architecture changes.
- Read the bundle README before changing a bundle-specific plugin or skill.
- For Blender and Unreal changes, inspect the transport layer, CLI, and relevant skill docs together.
- For Teams changes, verify auth, Graph path handling, and fuzzy-resolution helpers together.
- For Microsoft 365 changes, verify auth, Graph path handling, manifest coherence, and bundle runtime alignment together.
- After TS edits, run `tsc --noEmit` for the touched bundle.
- After CLI or protocol edits, run at least one smoke test command relevant to the changed path.
- Avoid introducing large framework changes unless the repo already commits to them.
