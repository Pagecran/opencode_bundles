---
name: pagecran-blender-shader-editor
description: |
  Build, inspect, and modify shader graphs and materials through the Pagecran bridge.

  Triggers when user mentions:
  - "shader editor"
  - "material nodes"
  - "shader graph"
  - "assign a material"
  - "vrscene"
  - "vray material"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

## Workflow

1. **Inspect** existing materials with `list_materials` or `get_material_info`.
2. **Prefer templates** (`create_shader_material_from_template`, `create_material_and_assign`) for standard setups.
3. For custom shader graphs, add nodes, then connect, then set inputs.
4. **Verify** with `get_material_info` or `get_shader_editor_screenshot`.
5. For V-Ray `.vrscene` conversion, inspect first with `analyze_vrscene_file`, then convert with `convert_vrscene_file` or `convert_vrscene_folder`.

---

## Method catalog

### Inspection

#### `list_materials`
List all materials in the file with node usage and slot assignments.

| Param | Type | Required |
|-------|------|----------|
| `filter_text` | string | no |
| `only_node_materials` | bool | no |

#### `get_material_info`
Full material details: shader graph nodes, links, settings.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |

#### `list_shader_node_groups`
List reusable shader node groups in the file.

| Param | Type | Required |
|-------|------|----------|
| `filter_text` | string | no |

#### `get_shader_node_group_info`
Interface and node details for a shader node group.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |

#### `list_shader_node_types`
List available shader node type identifiers. **Always call this** before `add_shader_node` if you don't know the exact type string.

| Param | Type | Required |
|-------|------|----------|
| `filter` | string | no — keyword filter (e.g. `"texture"`, `"mix"`, `"bsdf"`) |

### Material creation

#### `create_material`
Create a bare material.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `use_nodes` | bool | no (default true) |

#### `delete_material`

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |

#### `assign_material`
Assign an existing material to an object slot.

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | yes |
| `material_name` | string | yes |
| `slot_index` | int | no (default 0) |

#### `create_shader_material_from_template`
Create a material from a high-level template (principled PBR, emission, glass, etc.).

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Material name |
| `template_name` | string | no | Template identifier |
| `base_color` | [r,g,b,a] | no | 0-1 range |
| `roughness` | number | no | 0-1 |
| `metallic` | number | no | 0-1 |
| `transmission` | number | no | 0-1 (glass) |
| `emission_color` | [r,g,b,a] | no | |
| `emission_strength` | number | no | |
| `alpha` | number | no | 0-1 |

### Node editing

#### `add_shader_node`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_type` | string | yes | From `list_shader_node_types` |
| `material_name` | string | no | Target material (omit if editing a group) |
| `group_name` | string | no | Target node group |
| `name` | string | no | Custom label |
| `location` | [x,y] | no | Editor position |

#### `remove_shader_node`

| Param | Type | Required |
|-------|------|----------|
| `node_name` | string | yes |
| `material_name` | string | no |
| `group_name` | string | no |

#### `connect_shader_nodes`

| Param | Type | Required |
|-------|------|----------|
| `from_node` | string | yes |
| `from_socket` | string or int | yes |
| `to_node` | string | yes |
| `to_socket` | string or int | yes |
| `material_name` | string | no |
| `group_name` | string | no |

#### `disconnect_shader_nodes`

| Param | Type | Required |
|-------|------|----------|
| `from_node` | string | yes |
| `from_socket` | string | yes |
| `to_node` | string | yes |
| `to_socket` | string | yes |
| `material_name` | string | no |
| `group_name` | string | no |

#### `set_shader_node_input`

| Param | Type | Required |
|-------|------|----------|
| `node_name` | string | yes |
| `input_name` | string or int | yes |
| `value` | any | yes |
| `material_name` | string | no |
| `group_name` | string | no |

#### `add_shader_node_group_socket`
Add an input/output to a shader node group interface.

| Param | Type | Required |
|-------|------|----------|
| `group_name` | string | yes |
| `name` | string | yes |
| `in_out` | `"INPUT"` or `"OUTPUT"` | no |
| `socket_type` | string | no |

### High-level workflows

#### `create_material_and_assign`
Create from template + assign to object + optionally mark as asset, in one call.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `template_name` | string | no |
| `object_name` | string | no |
| `slot_index` | int | no |
| `mark_as_asset` | bool | no |
| `description` | string | no |
| `author` | string | no |
| `tags` | string[] | no |
| `base_color` | [r,g,b,a] | no |
| `roughness` | number | no |
| `metallic` | number | no |
| `transmission` | number | no |
| `emission_color` | [r,g,b,a] | no |
| `emission_strength` | number | no |
| `alpha` | number | no |

#### `analyze_vrscene_file`
Inspect a `.vrscene` file before conversion.

| Param | Type | Required |
|-------|------|----------|
| `filepath` | string | yes |

Returns a summary of detected V-Ray material blocks, texture usage, triplanar usage, and `UVWGenRandomizer` usage.

#### `convert_vrscene_file`
Convert one `.vrscene` file into Blender materials.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `filepath` | string | yes | Absolute path to the `.vrscene` file |
| `mapping_group_name` | string | no | Custom shader node group for triplanar / random UVW equivalence |
| `group_socket_map` | object | no | Semantic socket override map for the custom mapping group |
| `replace_existing` | bool | no | Replace materials that already exist |
| `use_fake_user` | bool | no | Keep converted materials alive with fake user |

#### `convert_vrscene_folder`
Batch-convert a whole folder of `.vrscene` files and optionally export a `.blend` material library.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `folder_path` | string | yes | Folder containing `.vrscene` files |
| `output_blend_path` | string | no | Optional output `.blend` library path |
| `reset_scene` | bool | no | Reset to an empty file before batch conversion |
| `mapping_group_name` | string | no | Custom shader node group for triplanar / random UVW equivalence |
| `group_socket_map` | object | no | Semantic socket override map for the custom mapping group |
| `replace_existing` | bool | no | Replace materials that already exist |
| `use_fake_user` | bool | no | Keep converted materials alive with fake user |

`UVWGenRandomizer` is only faithfully preserved when you provide a compatible custom mapping node group. Without it, the converter falls back to standard Blender mapping and reports warnings.

#### `apply_library_material_to_object`
Import a material from an asset library .blend file and assign it in one step.

| Param | Type | Required |
|-------|------|----------|
| `object_name` | string | yes |
| `filepath` | string | yes |
| `material_name` | string | yes |
| `library_name` | string | no |
| `slot_index` | int | no |
| `link` | bool | no |

#### `get_shader_editor_screenshot`
Capture the Shader Editor as PNG.

| Param | Type | Required |
|-------|------|----------|
| `material_name` | string | no |
| `group_name` | string | no |
| `max_size` | int | no |
| `fit_all` | bool | no |

---

## Domain knowledge

- **Colors** are RGBA in 0-1 range. `[1, 0, 0, 1]` = opaque red. sRGB 0-255 values must be divided by 255.
- **Principled BSDF** is the default shader. Key sockets: `Base Color`, `Roughness`, `Metallic`, `IOR`, `Transmission Weight`, `Emission Color`, `Emission Strength`, `Alpha`.
- **Material slots** are 0-indexed. Most objects have slot 0 by default.
- **Node type strings** are internal identifiers like `ShaderNodeBsdfPrincipled`, `ShaderNodeTexImage`, `ShaderNodeMix`. Use `list_shader_node_types` to discover them.
- **Material Output** node is usually named `"Material Output"`. The main input socket is `"Surface"`.
- When editing a **node group**, pass `group_name` instead of `material_name`. They are mutually exclusive contexts.

## Guardrails

- **Never guess shader node type strings.** Use `list_shader_node_types` with a keyword filter.
- Prefer `create_material_and_assign` for standard materials — one call instead of three.
- Inspect materials before editing them.
- Specify either `material_name` or `group_name`, never both.
- If the bridge is unreachable, tell the user to enable or reload **OpenCode Blender Bridge** in Blender.
