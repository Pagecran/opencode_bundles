---
name: pagecran-blender-animation
description: |
  Create and inspect simple object animations in Blender through the Pagecran bridge.

  Triggers when user mentions:
  - "animate this"
  - "turntable"
  - "keyframe"
  - "timeline"
---

## How to call methods

All methods below are called via the `blender_request` tool:

```
blender_request(method: "<method_name>", params: { ... })
```

## Workflow

1. **Set timeline** first with `set_timeline_settings` when frame range or FPS matters.
2. **Use `create_turntable_animation`** for showcase rotations — it's one call.
3. Use `keyframe_object_transform` for explicit multi-pose animation.
4. **Verify** with `get_object_animation_info`.

---

## Method catalog

#### `set_timeline_settings`
Set frame range, current frame, and/or FPS.

| Param | Type | Required |
|-------|------|----------|
| `frame_start` | int | no |
| `frame_end` | int | no |
| `frame_current` | int | no |
| `fps` | int | no |

#### `keyframe_object_transform`
Set transform values and insert keyframes using Blender 5.x layered actions.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Object name |
| `frame` | int | yes | Frame number |
| `location` | [x,y,z] | no | |
| `rotation` | [x,y,z] | no | Euler radians |
| `scale` | [x,y,z] | no | |
| `interpolation` | string | no | e.g. `"LINEAR"`, `"BEZIER"`, `"CONSTANT"` |

#### `create_turntable_animation`
Create a simple rotation loop on an object.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `object_name` | string | yes | |
| `frame_start` | int | no | Default 1 |
| `frame_end` | int | no | Default 250 |
| `turns` | number | no | Number of full rotations (default 1) |
| `axis` | `"X"`, `"Y"`, or `"Z"` | no | Default `"Z"` |
| `interpolation` | string | no | Default `"LINEAR"` |

#### `get_object_animation_info`
Read animation channels for an object, including Blender 5.x layered action data.

| Param | Type | Required |
|-------|------|----------|
| `name` | string | yes |

---

## Domain knowledge

- **Rotation values** in keyframes are in **radians**. One full turn = `6.28318` (2*pi).
- **Interpolation modes:** `LINEAR` (constant speed), `BEZIER` (smooth ease), `CONSTANT` (step).
- **Turntable convention:** rotating around Z axis is the standard product showcase.
- **Blender 5.x layered actions:** keyframes live in action layers. The bridge handles this automatically.
- **Frame rate:** common values are 24 (film), 25 (PAL), 30 (NTSC), 60 (smooth).

## Guardrails

- Only keyframe the channels required for the motion.
- Use `LINEAR` interpolation for mechanical/showcase turntables.
- Set the timeline range to match the animation length.
- Verify with `get_object_animation_info` after inserting keyframes.
