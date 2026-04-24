# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore

from .editor import normalize_object_path


def _load_sequence(sequence_path: str):
    sequence = unreal.load_asset(normalize_object_path(sequence_path), unreal.LevelSequence)
    if not sequence:
        raise RuntimeError(f"Could not load Level Sequence '{normalize_object_path(sequence_path)}'")
    return sequence


def _find_binding(sequence, binding_id: str):
    requested = binding_id.strip().lower()
    for binding in sequence.get_bindings():
        if str(binding.get_id()).lower() == requested:
            return binding
    raise RuntimeError("Invalid binding_id or binding not found in sequence")


def _display_frame_to_tick_frame(sequence, display_frame: int) -> unreal.FrameNumber:
    frame_time = unreal.FrameTime(unreal.FrameNumber(int(display_frame)))
    tick_time = unreal.TimeManagementLibrary.transform_time(frame_time, sequence.get_display_rate(), sequence.get_tick_resolution())
    return unreal.FrameNumber(int(tick_time.frame_number.value))


def _resolve_transform_channel_index(channel_specifier: str) -> int:
    normalized = channel_specifier.lower().replace("_", ".").replace("/", ".")
    mapping = {
        "location.x": 0,
        "location.y": 1,
        "location.z": 2,
        "rotation.roll": 3,
        "rotation.pitch": 4,
        "rotation.yaw": 5,
        "scale.x": 6,
        "scale.y": 7,
        "scale.z": 8,
    }
    if normalized not in mapping:
        raise RuntimeError("Unsupported transform channel in channel_path")
    return mapping[normalized]


def add_track(sequence_path: str, track_type: str, binding_id: str | None = None) -> dict:
    sequence = _load_sequence(sequence_path)
    resolved_track_type = track_type.strip().lower()
    result = {
        "sequence_path": sequence.get_path_name(),
        "track_type": resolved_track_type,
    }

    if resolved_track_type == "camera_cut":
        tracks = sequence.find_tracks_by_type(unreal.MovieSceneCameraCutTrack)
        track = tracks[0] if tracks else sequence.add_track(unreal.MovieSceneCameraCutTrack)
        if not track:
            raise RuntimeError("Failed to create or find camera cut track")
        result["track_class"] = track.get_class().get_name()
        result["section_count"] = len(track.get_sections())
        return result

    if not binding_id:
        raise RuntimeError("binding_id is required for this track type")

    binding = _find_binding(sequence, binding_id)
    result["binding_id"] = str(binding.get_id())

    if resolved_track_type == "transform":
        existing_tracks = [track for track in binding.get_tracks() if track.get_class().get_name() == "MovieScene3DTransformTrack"]
        track = existing_tracks[0] if existing_tracks else binding.add_track(unreal.MovieScene3DTransformTrack)
        if not track:
            raise RuntimeError("Failed to create transform track")
        section_added = False
        if not track.get_sections():
            if not track.add_section():
                raise RuntimeError("Failed to create transform section")
            section_added = True
        result["track_class"] = track.get_class().get_name()
        result["section_added"] = section_added
        return result

    if resolved_track_type in {"skeletal_animation", "animation"}:
        track = binding.add_track(unreal.MovieSceneSkeletalAnimationTrack)
        if not track:
            raise RuntimeError("Failed to create skeletal animation track")
        section = track.add_section()
        result["track_class"] = track.get_class().get_name()
        result["section_added"] = section is not None
        return result

    raise RuntimeError(f"Unsupported track_type '{resolved_track_type}' in current scaffold")


def set_keyframe(sequence_path: str, channel_path: str, frame: int, value) -> dict:
    sequence = _load_sequence(sequence_path)
    tokens = [token for token in channel_path.split(":") if token]
    if not tokens:
        raise RuntimeError("Invalid channel_path")

    binding_token = ""
    channel_specifier = ""
    whole_transform = False

    if tokens[0].lower() == "binding" and len(tokens) >= 2:
        binding_token = tokens[1]
        if len(tokens) == 2 or (len(tokens) == 3 and tokens[2].lower() == "transform"):
            whole_transform = True
        elif len(tokens) >= 4 and tokens[2].lower() == "transform":
            channel_specifier = tokens[3]
    else:
        binding_token = tokens[0]
        if len(tokens) == 1 or (len(tokens) == 2 and tokens[1].lower() == "transform"):
            whole_transform = True
        elif len(tokens) >= 3 and tokens[1].lower() == "transform":
            channel_specifier = tokens[2]

    binding = _find_binding(sequence, binding_token)
    tracks = [track for track in binding.get_tracks() if track.get_class().get_name() == "MovieScene3DTransformTrack"]
    track = tracks[0] if tracks else binding.add_track(unreal.MovieScene3DTransformTrack)
    if not track:
        raise RuntimeError("Failed to create transform track for keyframe")
    sections = track.get_sections()
    section = sections[0] if sections else track.add_section()
    if not section:
        raise RuntimeError("Failed to create transform section for keyframe")

    channels = list(section.get_all_channels())
    if len(channels) < 9:
        raise RuntimeError("Transform section does not expose expected channels")

    tick_frame = _display_frame_to_tick_frame(sequence, frame)
    modified = False

    if whole_transform:
        if not isinstance(value, dict):
            raise RuntimeError("Whole-transform keyframes require value object with location/rotation/scale fields")

        def add_triplet(prefix: str, offset: int, keys: tuple[str, str, str]):
            nonlocal modified
            payload = value.get(prefix)
            if not isinstance(payload, dict):
                return
            for index, key_name in enumerate(keys):
                if key_name in payload:
                    channels[offset + index].add_key(tick_frame, float(payload[key_name]), 0.0, unreal.MovieSceneTimeUnit.TICK_RESOLUTION)
                    modified = True

        add_triplet("location", 0, ("x", "y", "z"))
        add_triplet("rotation", 3, ("roll", "pitch", "yaw"))
        add_triplet("scale", 6, ("x", "y", "z"))
    else:
        channel_index = _resolve_transform_channel_index(channel_specifier)
        channels[channel_index].add_key(tick_frame, float(value), 0.0, unreal.MovieSceneTimeUnit.TICK_RESOLUTION)
        modified = True

    if not modified:
        raise RuntimeError("No keyframe values were applied")

    return {
        "sequence_path": sequence.get_path_name(),
        "binding_id": str(binding.get_id()),
        "channel_path": channel_path,
        "frame": int(frame),
    }


def add_camera_cut(sequence_path: str, camera_binding_id: str, start_frame: int, end_frame: int) -> dict:
    if int(end_frame) < int(start_frame):
        raise RuntimeError("end_frame must be greater than or equal to start_frame")

    sequence = _load_sequence(sequence_path)
    binding = _find_binding(sequence, camera_binding_id)
    tracks = sequence.find_tracks_by_type(unreal.MovieSceneCameraCutTrack)
    track = tracks[0] if tracks else sequence.add_track(unreal.MovieSceneCameraCutTrack)
    if not track:
        raise RuntimeError("Failed to create or find camera cut track")

    section = track.add_section()
    if not section:
        raise RuntimeError("Failed to create camera cut section")
    section.set_start_frame(int(start_frame))
    section.set_end_frame(int(end_frame))

    camera_binding = unreal.MovieSceneObjectBindingID()
    camera_binding.set_editor_property("Guid", binding.get_id())
    section.set_editor_property("CameraBindingID", camera_binding)

    return {
        "sequence_path": sequence.get_path_name(),
        "camera_binding_id": str(binding.get_id()),
        "start_frame": int(start_frame),
        "end_frame": int(end_frame),
    }
