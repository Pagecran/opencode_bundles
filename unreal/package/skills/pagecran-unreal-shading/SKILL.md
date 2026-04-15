---
name: pagecran-unreal-shading
description: |
  Work with Unreal materials, material instances, parameters, and lookdev-oriented shading workflows.

  Triggers when user mentions:
  - "shading"
  - "material"
  - "lookdev"
  - "material instance"
---

## Priority

Shading is a core workflow for Pagecran's Unreal bundle, especially for linear rendering and lookdev.

Current scaffold status:

- `list_materials` is expected to work first
- `get_material_info` is expected to work first
- `list_material_parameter_collections` is expected to work first
- `create_material_instance` is expected to work first
- `set_material_parameter` is expected to work for `scalar`, `vector`, and `texture`
- `assign_material_to_actor` is expected to work first

## How to call methods

Use:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Inspect the current material or material instance before mutating it.
2. Prefer material-instance-driven changes over destructive edits to master materials when possible.
3. Verify final parameter values, assignments, and shading context after changes.
4. Keep render-facing consistency in mind: ACEScg pipeline, viewport lookdev, and sequence rendering outputs.

## Expected methods

### `list_materials`

List material and material instance assets.

### `get_material_info`

Read material class, parent, parameter sets, usages, and referenced textures.

### `create_material_instance`

Create a material instance from a master material.

### `set_material_parameter`

Set scalar, vector, or texture parameters on a material instance.

### `assign_material_to_actor`

Assign a material or material instance to an actor / component slot.

### `list_material_parameter_collections`

Inspect available Material Parameter Collections.

## Guardrails

- Prefer exact material asset paths, not display-name guesses.
- Avoid destructive edits to shared master materials unless explicitly requested.
- Report which actor, component, and material slot were affected when assigning materials.
