---
name: pagecran-blender-audit
description: |
  Inspect .blend files on disk without requiring a live Blender bridge session.

  Triggers when user mentions:
  - "audit blend"
  - "missing files"
  - "linked libraries"
  - "preflight"
  - "inspect .blend"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

`get_blendfile_summary_path_info` is local and does not require Blender. Other audit methods run Blender in background mode through a local binary.

Binary resolution order:

- `PAGECRAN_BLENDER_BIN`
- `BLENDER_PATH`
- `BLENDER_BIN`
- `blender` from `PATH`

## Workflow

1. Start with `get_blendfile_summary_path_info` to validate the file path.
2. Use `get_blendfile_summary_datablocks` for high-level file composition.
3. Use `get_blendfile_summary_missing_files` for preflight checks.
4. Use `get_blendfile_summary_linked_libraries` to inspect linked .blend dependencies.

---

## Method catalog

### `get_blendfile_summary_path_info`

Read basic path, size and timestamp information for a `.blend` file.

| Param | Type | Required |
|-------|------|----------|
| `blend_file` | string | yes |

### `get_blendfile_summary_datablocks`

Open a `.blend` file with Blender in background mode and summarize data-block counts.

| Param | Type | Required |
|-------|------|----------|
| `blend_file` | string | yes |
| `timeout_seconds` | number | no |

### `get_blendfile_summary_missing_files`

Open a `.blend` file with Blender in background mode and report missing external file references.

| Param | Type | Required |
|-------|------|----------|
| `blend_file` | string | yes |
| `timeout_seconds` | number | no |

### `get_blendfile_summary_linked_libraries`

Open a `.blend` file with Blender in background mode and list linked libraries.

| Param | Type | Required |
|-------|------|----------|
| `blend_file` | string | yes |
| `timeout_seconds` | number | no |

## Guardrails

- These methods read the file from disk; unsaved changes in an open Blender session are not included.
- Large production files can take time to open in background mode; set `timeout_seconds` when needed.
- Audit methods are read-only but may load add-ons or file dependencies as Blender opens the file.
