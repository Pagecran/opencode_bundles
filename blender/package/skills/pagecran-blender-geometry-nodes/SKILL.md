---
name: pagecran-blender-geometry-nodes
description: |
  Build, inspect, and modify Geometry Nodes through the Pagecran bridge.
  Includes Bradley's Geo Node Presets (mograph-style node groups).

  Triggers when user mentions:
  - "Geometry Nodes"
  - "node tree"
  - "scatter on surface"
  - "Bradley preset"
  - "Bradley's Geo Node Presets"
  - "mograph style node group"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

## Workflow

1. **Inspect** with `list_geometry_node_trees` or `get_geometry_node_tree` before editing.
2. **Prefer templates** (`create_gn_from_template`, `scatter_library_asset_on_surface`) when they match the goal.
3. If manual node editing is needed, work **one logical block at a time** (add nodes → connect → set inputs).
4. **Verify** with `get_geometry_node_tree` or `get_node_editor_screenshot`.
5. Use `list_available_node_types` to discover exact node type identifiers — never guess them.

---

## Method catalog

### Inspection

#### `list_geometry_node_trees`
List all GN trees in the file with modifier assignment summaries.
**Params:** none

#### `list_geometry_nodes_modifiers`
List GN modifiers across the scene or on one object.

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | no |

#### `get_geometry_node_tree`
Full introspection: nodes, links, interface sockets, assigned modifiers.

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |

#### `list_available_node_types`
List node type identifiers. **Always use this before `add_geometry_node`** if you don't know the exact type string.

| Param | Type | Required |
|-------|------|----------|
| `filter` | string | no — keyword to filter (e.g. `"mesh"`, `"math"`, `"instance"`) |

#### `list_gn_templates`
List available high-level templates (scatter, displacement, etc.).
**Params:** none

#### `get_node_editor_screenshot`
Capture the Geometry Nodes editor as PNG. The image is saved to a temp file; the path is in the response.

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | no — tree to show |
| `max_size` | int | no — max dimension in pixels |
| `fit_all` | bool | no — zoom to fit all nodes |

### Creation & assignment

#### `create_geometry_node_tree`
Create an empty GN tree and optionally assign it as a modifier.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `object_name` | string | no — assign as modifier on this object |

#### `attach_geometry_node_tree`
Attach an existing tree to an object as a modifier.

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | yes |
| `tree_name` | string | yes |
| `modifier_name` | string | no |

#### `create_gn_from_template`
Build a full GN setup from a template. Supports scatter, displacement, and more.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `template_name` | string | yes | From `list_gn_templates` |
| `tree_name` | string | yes | Name for the new tree |
| `object_name` | string | no | Target object |
| `density` | number | no | Points per m² (scatter) |
| `instance_type` | string | no | What to instance |
| `instance_object_name` | string | no | Object to scatter |
| `instance_collection_name` | string | no | Collection to scatter |
| `instance_scale` | [x,y,z] | no | Scale of instances |
| `align_to_normal` | bool | no | Align instances to surface normal |
| `random_rotation` | bool | no | Random Z rotation per instance |
| `random_scale_range` | [min,max] | no | Random scale range |
| `use_realize_instances` | bool | no | Realize instances for editing |
| `keep_input_geometry` | bool | no | Keep the surface mesh visible |
| `noise_scale` | number | no | Noise texture scale (displacement) |
| `strength` | number | no | Displacement strength |
| `subdivisions` | int | no | Subdivision level |

### Node editing

#### `add_geometry_node`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tree_name` | string | yes | |
| `node_type` | string | yes | Exact type from `list_available_node_types` |
| `name` | string | no | Custom label |
| `location` | [x,y] | no | Editor position |

#### `remove_geometry_node`

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `node_name` | string | yes |

#### `rename_geometry_node`

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `node_name` | string | yes |
| `new_name` | string | yes |

#### `set_geometry_node_location`

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `node_name` | string | yes |
| `location` | [x,y] | yes |

#### `connect_geometry_nodes`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tree_name` | string | yes | |
| `from_node` | string | yes | Source node name |
| `from_socket` | string or int | yes | Output socket name or index |
| `to_node` | string | yes | Target node name |
| `to_socket` | string or int | yes | Input socket name or index |

#### `disconnect_geometry_nodes`

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `from_node` | string | yes |
| `from_socket` | string | yes |
| `to_node` | string | yes |
| `to_socket` | string | yes |

#### `set_node_input`
Set the default value of a node input socket.

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `node_name` | string | yes |
| `input_name` | string or int | yes |
| `value` | any | yes |

#### `set_modifier_input`
Set an exposed modifier input on the object (visible in the Properties panel).

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | yes |
| `modifier_name` | string | yes |
| `input_name` | string | yes |
| `value` | any | yes |

#### `add_node_tree_socket`
Add an exposed input/output to the tree interface.

| Param | Type | Required |
|-------|------|----------|
| `tree_name` | string | yes |
| `name` | string | yes |
| `in_out` | `"INPUT"` or `"OUTPUT"` | no (default INPUT) |
| `socket_type` | string | no |

### High-level workflows

#### `scatter_library_asset_on_surface`
Import an asset from a .blend library and build a scatter setup on a surface in one step.

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

#### `create_string_to_curves_object`
Create a procedural text object using Blender 5.1's String to Curves GN workflow.

| Param | Type | Required |
|-------|------|----------|
| `text` | string | yes |
| `object_name` | string | no |
| `tree_name` | string | no |
| `size` | number | no |
| `location` | [x,y,z] | no |
| `font_name` | string | no |

---

## Domain knowledge

- **Node type identifiers** are internal strings like `GeometryNodeMeshCube`, `GeometryNodeDistributePointsOnFaces`, `ShaderNodeMath`. Always call `list_available_node_types` to discover the exact string.
- **Socket names** depend on node type and Blender version. Call `get_geometry_node_tree` to inspect existing socket names before connecting.
- **Density** for scatter templates is in **points per m²**. Start with 5-20 for foliage, 50-200 for grass.
- **Group Input / Group Output** nodes are named `"Group Input"` and `"Group Output"` by default.
- **Modifier inputs** are the exposed sockets that appear in the Properties panel. They map to the tree's interface inputs.
- When building trees manually, create nodes first, then connect, then set default values.

## Guardrails

- **Never guess node type strings.** Use `list_available_node_types` with a keyword filter.
- Inspect socket names with `get_geometry_node_tree` before connecting nodes.
- Prefer `create_gn_from_template` or `scatter_library_asset_on_surface` over manual node-by-node construction.
- Keep node names stable once the user refers to them.
- After modifications, verify with `get_geometry_node_tree` or `get_node_editor_screenshot`.

---

## Bradley's Geo Node Presets *(requires addon: Bradley Presets)*

> Optional section — these methods require the **Bradley Presets** addon to be installed and active.
> Bradley Presets are mograph-style geometry node groups (arrays, cloners, effectors) and shader presets
> available as a local asset library.

### Bradley workflow

1. **Ensure library** is registered with `ensure_bradley_asset_library`.
2. **Browse** presets with `list_bradley_assets`.
3. **Import** with `import_bradley_preset`, specifying `target_object` for GN presets.
4. **Verify** with `get_object_modifiers`, `get_geometry_node_tree`, or `get_material_info`.

### Bradley method catalog

#### `ensure_bradley_asset_library`
Register the Bradley Presets library path in Blender preferences if not already present.
**Params:** none

#### `list_bradley_assets`
List available presets in the local library.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `filter_text` | string | no | Keyword search |
| `asset_kind` | enum | no | `"ALL"`, `"NODE_GROUP"`, `"MATERIAL"` |
| `limit` | int | no | Max results |

#### `import_bradley_preset`
Import a preset and optionally apply it.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Exact preset name from `list_bradley_assets` |
| `asset_kind` | enum | no | `"NODE_GROUP"` or `"MATERIAL"` |
| `target_object` | string | no | Object to apply GN preset to |
| `material_name` | string | no | Material to apply shader preset to |
| `material_target_slot` | int | no | Material slot index |
| `nodegroup_mode` | string | no | |
| `node_x` | int | no | |
| `node_y` | int | no | |
| `model_location` | [x,y,z] | no | |
| `model_rotation` | [x,y,z] | no | |

### Bradley guardrails

- Run `ensure_bradley_asset_library` first if the library might not be registered.
- Use exact preset names from `list_bradley_assets`.
- Apply GN presets to a named mesh object, not to empty space.
- Shader presets are materials — they can be applied to an object's material slot.
- Verify the result after import.
