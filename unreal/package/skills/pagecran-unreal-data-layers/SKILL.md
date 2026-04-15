---
name: pagecran-unreal-data-layers
description: |
  Work with Unreal Data Layers for scene organization and render-state control.

  Triggers when user mentions:
  - "Data Layers"
  - "data layer"
  - "world partition layer"
  - "layer visibility"
---

## Priority

Data Layers are an important part of Pagecran's Unreal workflow.

Current scaffold status:

- `list_data_layers` is expected to work first
- `get_data_layer_info` is expected to work first
- `set_data_layer_loaded` is expected to work first
- `set_data_layer_visible` is expected to work first

## How to call methods

Use:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Inspect current Data Layers first.
2. Change only the layers relevant to the requested shot or render state.
3. Verify loaded / unloaded and visible / hidden states after each change.

## Expected methods

### `list_data_layers`

List Data Layers in the current world.

### `get_data_layer_info`

Read state, runtime mode, visibility, and actor membership.

### `create_data_layer`

Create a new Data Layer.

### `set_data_layer_loaded`

Set whether a layer is loaded.

### `set_data_layer_visible`

Set whether a layer is visible.

### `assign_actor_to_data_layer`

Assign an actor to a specific Data Layer.

### `remove_actor_from_data_layer`

Remove an actor from a Data Layer.

## Guardrails

- Distinguish clearly between loaded state and visible state.
- Confirm the target world if several maps are open or available.
- After layer changes, verify the final layer states with a readback.
