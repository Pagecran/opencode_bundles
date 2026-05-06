---
name: pagecran-blender-docs
description: |
  Search and read the vendored Blender API and manual documentation.

  Triggers when user mentions:
  - "Blender API"
  - "bpy docs"
  - "Blender manual"
  - "documentation Blender"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

These methods are local to the bundle. They do not require Blender to be open or the bridge to be reachable.

## Workflow

1. Search first with `search_blender_api_docs` or `search_blender_manual`.
2. Use `get_blender_api_docs` when you know the exact API identifier.
3. Prefer dedicated bundle methods for scene edits; use docs to support unknown API details or debugging.

---

## Method catalog

### `search_blender_api_docs`

Search the vendored Blender Python API reference.

| Param | Type | Required |
|-------|------|----------|
| `query` | string | yes |
| `max_results` | int | no |
| `context_lines` | int | no |

### `search_blender_manual`

Search the vendored Blender user manual.

| Param | Type | Required |
|-------|------|----------|
| `query` | string | yes |
| `max_results` | int | no |
| `context_lines` | int | no |

### `get_blender_api_docs`

Read a Blender Python API reference page by identifier.

| Param | Type | Required |
|-------|------|----------|
| `identifier` | string | yes |
| `max_chars` | int | no |

Examples:

```text
blender_request(method: "search_blender_api_docs", params: { query: "bpy.types.Object" })
blender_request(method: "get_blender_api_docs", params: { identifier: "bpy.ops.object" })
```

## Guardrails

- Use docs as support for implementation and debugging, not as a replacement for scene inspection.
- Do not use docs results to assume an object exists in the active scene.
- Use dedicated bundle methods before falling back to `execute_code`.
