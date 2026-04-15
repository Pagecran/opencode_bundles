---
name: pagecran-unreal-sequencer
description: |
  Work with Unreal Sequencer, Level Sequences, shots, bindings, and cinematic rendering.

  Triggers when user mentions:
  - "Sequencer"
  - "Level Sequence"
  - "shot track"
  - "render sequence"
---

## Priority

This is one of the primary Unreal workflows for Pagecran.
Prefer Sequencer-native operations over gameplay-oriented hacks.

Current scaffold status:

- `list_level_sequences` is expected to work first
- `get_sequence_info` is expected to work first
- `add_track` is expected to work for `transform`, `skeletal_animation`, and `camera_cut`
- `set_keyframe` is expected to work for transform channels / transform payloads
- `add_camera_cut` is expected to work with an existing camera binding id
- render operations remain the next implementation wave

## How to call methods

Use the generic bridge tool:

```text
unreal_request(method: "<method_name>", params: { ... })
```

## Workflow

1. Inspect the target sequence and current bindings.
2. Make targeted changes to tracks, sections, bindings, or cameras.
3. Verify timing, frame ranges, and shot structure after each change.
4. For renders, confirm output path, preset, color pipeline, and frame range.

## Expected methods

### `list_level_sequences`

List available Level Sequences.

### `get_sequence_info`

Read playback range, display rate, tick resolution, shots, bindings, and tracks.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sequence_path` | string | yes | Unreal asset path to the Level Sequence |

### `create_level_sequence`

Create a new sequence asset.

### `list_sequence_bindings`

Inspect possessables / spawnables and binding targets.

### `add_actor_binding`

Bind an actor into a sequence.

### `add_track`

Add a track to a sequence or a binding.

### `set_section_range`

Set section start / end frames.

### `set_keyframe`

Set a keyframe on a Sequencer channel.

Current scaffold note:

- `channel_path` can be a binding-guid transform target such as `<binding_guid>:transform`
- or a specific transform channel such as `<binding_guid>:transform:location.x`
- full transform payloads use `value.location`, `value.rotation`, and `value.scale`

### `add_camera_cut`

Add or update camera cut sections.

### `render_sequence`

Render a sequence, typically via Movie Render Queue or a bridge wrapper around it.

## Guardrails

- Prefer exact sequence asset paths, not display-name guesses.
- Before rendering, confirm frame range, preset, output path, and color setup.
- Do not silently overwrite an existing render output path.
