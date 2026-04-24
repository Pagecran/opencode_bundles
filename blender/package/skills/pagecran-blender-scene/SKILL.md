---
name: pagecran-blender-scene
description: |
  Work with the active Blender scene through the Pagecran bridge.

  Triggers when user mentions:
  - "Blender scene"
  - "create an object"
  - "move the camera"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

If the bridge is unreachable, tell the user to enable or reload **OpenCode Blender Bridge** in Blender and verify the port in extension preferences.

## Workflow

1. **Inspect** the scene before mutating it.
2. Make the **smallest targeted change**.
3. **Verify** with a readback or screenshot.
4. Report object names and transforms in the response.

---

## Method catalog

### `ping`

Health check. Returns bridge version and Blender info.

**Params:** none

### `get_capabilities`

Returns every bundle-defined Blender method plus the currently reachable bridge capabilities. Use this to discover methods not listed here.

**Params:** none

### `get_addon_status`

Check whether a Blender addon is active (BlenderKit, Sketchfab, Bradley Presets, etc.).

**Params:** `addon_name` (string, optional) — omit to check all supported addons.

### `get_scene_info`

Full scene snapshot: object list with transforms, modifiers, render settings, active camera, frame range.

**Params:** none

### `get_full_scene_hierarchy`

Collection and object hierarchy tree. Useful to understand nesting before creating or moving objects.

**Params:** none

### `get_object_info`

Detailed info for one object: transform, mesh stats, material slots, parent, children.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Exact object name |

### `get_object_modifiers`

All modifiers on an object, including Geometry Nodes modifier exposed inputs.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Exact object name |

### `create_object`

Add a new primitive to the scene.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `primitive` | enum | yes | `CUBE`, `SPHERE`, `CYLINDER`, `CONE`, `PLANE`, `CIRCLE`, `GRID`, `EMPTY`, `CAMERA`, `LIGHT` |
| `name` | string | no | Custom name (Blender auto-suffixes on collision) |
| `location` | [x,y,z] | no | World position (default origin) |

### `delete_object`

Remove an object by exact name.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Exact object name |

### `transform_object`

Set location, rotation, and/or scale. Only supplied fields are changed.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Exact object name |
| `location` | [x,y,z] | no | World position |
| `rotation` | [x,y,z] | no | Euler rotation **in radians** |
| `scale` | [x,y,z] | no | Scale factors |

### `set_active_camera`

Set the render camera for the scene.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Camera object name |

### `get_viewport_screenshot`

Capture the 3D viewport as PNG. The image is saved to a temp file; the path is in the response.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `max_size` | int | no | Max dimension in pixels |

### `get_node_editor_screenshot`

Capture the Geometry Nodes editor as PNG.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tree_name` | string | no | Node tree to show |
| `max_size` | int | no | Max dimension in pixels |
| `fit_all` | bool | no | Zoom to fit all nodes |

### `get_shader_editor_screenshot`

Capture the Shader Editor as PNG.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `material_name` | string | no | Material to display |
| `group_name` | string | no | Node group to display |
| `max_size` | int | no | Max dimension in pixels |
| `fit_all` | bool | no | Zoom to fit all nodes |

### `execute_code`

Execute arbitrary Python code inside Blender. **Last resort** — prefer dedicated methods.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | Python source code |

---

## Domain knowledge

- **Coordinate system:** Blender uses right-handed Z-up. Y is depth, X is left-right.
- **Rotation units:** always radians. 90 degrees = `1.5708`, 180 = `3.14159`.
- **Object naming:** Blender auto-appends `.001`, `.002` on name collision. Always read back the returned name.
- **Default cube:** new scenes contain `Cube`, `Camera`, and `Light`. Check with `get_scene_info` before adding objects.
- **Empty objects:** use `EMPTY` primitive to create transform parents, armature targets, or group anchors.

## Guardrails

- Prefer named operations over `execute_code`.
- Inspect the scene before modifying it unless the user explicitly asks for a direct action.
- After creating or moving objects, include the final name and transform in the response.
- Never assume object names — always verify with `get_scene_info` or `get_object_info` first.
