---
name: pagecran-blender-asset-browser
description: |
  Inspect and manipulate Blender assets and asset libraries through the Pagecran bridge.
  Includes BlenderKit and Sketchfab integration for online asset sourcing.

  Triggers when user mentions:
  - "asset browser"
  - "asset library"
  - "mark as asset"
  - "import a material from the library"
  - "BlenderKit"
  - "find a BlenderKit asset"
  - "import a BlenderKit material"
  - "Sketchfab"
  - "import from Sketchfab"
  - "find a Sketchfab model"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

## Workflow

1. **Discover** libraries with `list_asset_libraries`.
2. **Browse** library files with `list_library_blend_files`, then inspect one with `list_blend_file_assets`.
3. **Import** with `import_blend_asset`, or use a high-level workflow for assign/scatter.
4. **Verify** with `get_asset_info` or `list_current_file_assets`.

---

## Method catalog

### Library discovery

#### `list_asset_libraries`
List all asset libraries configured in Blender preferences.
**Params:** none

#### `list_library_blend_files`
Scan a library for .blend files.

| Param | Type | Required |
|-------|------|----------|
| `library_name` | string | no |
| `recursive` | bool | no |
| `limit` | int | no |

#### `list_blend_file_assets`
Inspect one .blend file and list importable datablocks.

| Param | Type | Required |
|-------|------|----------|
| `filepath` | string | yes |
| `library_name` | string | no |
| `asset_types` | string[] | no — `"OBJECT"`, `"MATERIAL"`, `"COLLECTION"`, `"NODE_GROUP"`, `"WORLD"` |

### Current file assets

#### `list_current_file_assets`
List assets in the current .blend file.

| Param | Type | Required |
|-------|------|----------|
| `asset_types` | string[] | no |
| `include_unmarked` | bool | no |

#### `get_asset_info`
Metadata for one asset-capable datablock.

| Param | Type | Required |
|-------|------|----------|
| `asset_type` | enum | yes — `OBJECT`, `MATERIAL`, `COLLECTION`, `NODE_GROUP`, `WORLD` |
| `name` | string | yes |

#### `mark_asset`
Mark a datablock as an asset with optional metadata.

| Param | Type | Required |
|-------|------|----------|
| `asset_type` | enum | yes |
| `name` | string | yes |
| `description` | string | no |
| `author` | string | no |
| `tags` | string[] | no |
| `catalog_id` | string | no |
| `generate_preview` | bool | no |

#### `clear_asset`
Remove asset metadata from a datablock.

| Param | Type | Required |
|-------|------|----------|
| `asset_type` | enum | yes |
| `name` | string | yes |

### Importing

#### `import_blend_asset`
Import one datablock from a .blend library file.

| Param | Type | Required |
|-------|------|----------|
| `filepath` | string | yes |
| `asset_type` | enum | yes |
| `name` | string | yes |
| `library_name` | string | no |
| `link` | bool | no — link instead of append |
| `link_to_scene` | bool | no |

### High-level workflows

#### `apply_library_material_to_object`
Import a material from a library .blend and assign it to an object slot in one step.

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | yes |
| `filepath` | string | yes |
| `material_name` | string | yes |
| `library_name` | string | no |
| `slot_index` | int | no |
| `link` | bool | no |

#### `scatter_library_asset_on_surface`
Import an object/collection from a library and build a scatter GN setup on a surface.

| Param | Type | Required |
|-------|------|----------|
| `surface_object_name` | string | yes |
| `filepath` | string | yes |
| `asset_name` | string | yes |
| `asset_type` | `"OBJECT"` or `"COLLECTION"` | no |
| `library_name` | string | no |
| `tree_name` | string | no |
| `density` | number | no |
| `instance_scale` | [x,y,z] | no |
| `align_to_normal` | bool | no |
| `random_rotation` | bool | no |
| `random_scale_range` | [min,max] | no |
| `use_realize_instances` | bool | no |
| `keep_input_geometry` | bool | no |
| `link` | bool | no |

---

## Domain knowledge

- **Library-relative paths** use backslashes on Windows. Keep the user's path format exactly as provided.
- **Append vs Link:** append copies the datablock into the file; link references it (read-only, lighter). Default is append.
- **Asset types:** `OBJECT`, `MATERIAL`, `COLLECTION`, `NODE_GROUP`, `WORLD`. These map to Blender's ID types.
- After importing, the datablock name may get a `.001` suffix if there's a collision.

## Guardrails

- Read asset metadata before importing or clearing.
- Prefer `apply_library_material_to_object` or `scatter_library_asset_on_surface` when the goal is import-and-use in one step.
- Keep library-relative file paths exact.
- If the bridge is unreachable, tell the user to enable or reload **OpenCode Blender Bridge** in Blender.

---

## BlenderKit *(requires addon: BlenderKit)*

> Optional section — these methods require the **BlenderKit** addon to be installed and active.
> BlenderKit is an online asset marketplace integrated into Blender for models, materials, node groups, and more.

### BlenderKit workflow

1. **Check addon** with `get_addon_status` (param: `addon_name: "blenderkit"`) if availability is uncertain.
2. **Search** with `search_blenderkit_assets` before importing.
3. **Import** with `import_blenderkit_asset` using the `asset_base_id` from search results.
4. For materials, always provide `target_object` and `material_target_slot`.
5. **Verify** with `get_blenderkit_import_status` or inspect the imported object/material.

### BlenderKit method catalog

#### `get_addon_status`
Check if BlenderKit addon is installed and active.

| Param | Type | Required |
|-------|------|----------|
| `addon_name` | string | no — use `"blenderkit"` |

#### `search_blenderkit_assets`
Search the BlenderKit catalog.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | no | Search keywords |
| `asset_type` | enum | no | `model`, `material`, `nodegroup`, `scene`, `brush`, `hdr`, `texture`, `addon` |
| `page_size` | int | no | Results per page |
| `page` | int | no | Page number |
| `free_only` | bool | no | Only free assets |
| `geometry_nodes_only` | bool | no | Filter GN assets |
| `animated` | bool | no | Filter animated |

#### `import_blenderkit_asset`
Start importing a BlenderKit asset.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `asset_base_id` | string | no | Primary identifier from search |
| `asset_id` | string | no | Alternative identifier |
| `query` | string | no | Quick-search import |
| `asset_type` | enum | no | |
| `target_object` | string | no | For materials: target object |
| `material_target_slot` | int | no | Slot index |
| `resolution` | string | no | |
| `model_location` | [x,y,z] | no | |
| `model_rotation` | [x,y,z] | no | |
| `target_collection` | string | no | |
| `nodegroup_mode` | string | no | |
| `node_x` | int | no | |
| `node_y` | int | no | |

#### `get_blenderkit_import_status`
Check whether an asset is already present in the current file.

| Param | Type | Required |
|-------|------|----------|
| `asset_base_id` | string | no |
| `asset_id` | string | no |

### BlenderKit domain knowledge

- **asset_base_id** is the primary identifier in BlenderKit. Each search result includes it.
- Material imports apply directly to the target object's material slot. Specify `target_object` and `material_target_slot`.
- Imports are **asynchronous** — the asset downloads in the background. Use `get_blenderkit_import_status` to check.
- Free assets don't require a paid BlenderKit subscription.

### BlenderKit guardrails

- Use the exact `asset_base_id` from search results.
- Don't assume imports are instant; verify status if the user expects immediate use.
- Search before importing unless the user provided a specific asset ID.
- If the BlenderKit addon is not active, tell the user to enable it in Blender preferences.

---

## Sketchfab *(requires addon: Sketchfab)*

> Optional section — these methods require the **Sketchfab** addon to be installed, active, and **logged in**.
> Sketchfab is an online 3D model library. The addon allows searching and importing models directly into Blender.

### Sketchfab workflow

1. **Check addon** with `get_addon_status` (param: `addon_name: "sketchfab"`) to confirm it's enabled and logged in.
2. **Search** with `search_sketchfab_models` to find the model `uid`.
3. **Import** with `import_sketchfab_model` using the `uid`.

### Sketchfab method catalog

#### `get_addon_status`
Check if the Sketchfab addon is installed, active, and logged in.

| Param | Type | Required |
|-------|------|----------|
| `addon_name` | string | no — use `"sketchfab"` |

#### `search_sketchfab_models`
Search Sketchfab's public model API.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | no | Search keywords |
| `page_size` | int | no | Results per page |
| `page` | int | no | Page number |
| `downloadable` | bool | no | Only downloadable models |
| `animated` | bool | no | Filter animated models |

#### `import_sketchfab_model`
Start importing a Sketchfab model through the addon.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | string | yes | Model UID from search results |
| `model_url` | string | no | Optional Sketchfab URL |

### Sketchfab domain knowledge

- **uid** is Sketchfab's unique model identifier. Each search result includes it.
- Import requires the Sketchfab addon to be **logged in**. Check with `get_addon_status`.
- Not all models are downloadable. Use `downloadable: true` in search to filter.
- Imported models arrive as collections; check the scene hierarchy after import.

### Sketchfab guardrails

- Always check addon login status before attempting import.
- Search first unless the user provided a direct UID or URL.
- Preserve the exact `uid` from search results.
