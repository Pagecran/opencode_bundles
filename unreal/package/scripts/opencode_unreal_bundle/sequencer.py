# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore

from .editor import normalize_object_path


def _normalize_root_path(value: str | None) -> str:
    candidate = (value or "/Game").strip().replace("\\", "/")
    if not candidate:
        candidate = "/Game"
    if not candidate.startswith("/"):
        candidate = f"/Game/{candidate}"
    if not candidate.startswith(("/Game", "/Engine")):
        raise ValueError("root_path must start with /Game or /Engine")
    return candidate.rstrip("/") or "/Game"


def _frame_rate_to_dict(frame_rate) -> dict:
    return {
        "numerator": int(frame_rate.numerator),
        "denominator": int(frame_rate.denominator),
    }


def _display_frame_from_ticks(frame_number: int, tick_resolution, display_rate) -> int:
    frame_time = unreal.FrameTime(unreal.FrameNumber(int(frame_number)))
    transformed = unreal.TimeManagementLibrary.transform_time(frame_time, tick_resolution, display_rate)
    return int(transformed.frame_number.value)


def _binding_name(binding) -> str:
    for attribute_name in ("get_name", "get_display_name"):
        attribute = getattr(binding, attribute_name, None)
        if callable(attribute):
            try:
                value = attribute()
                if value:
                    return str(value)
            except TypeError:
                pass
    return str(binding.get_id())


def _track_summary(track) -> dict:
    return {
        "name": str(track.get_display_name()) if hasattr(track, "get_display_name") else str(track.get_name()),
        "class": track.get_class().get_name(),
        "section_count": len(track.get_sections()),
    }


def list_level_sequences(root_path: str | None = None, limit: int = 100) -> dict:
    normalized_root = _normalize_root_path(root_path)
    clamped_limit = max(1, min(int(limit), 500))

    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    asset_filter = unreal.ARFilter(
        package_paths=[normalized_root],
        class_paths=[unreal.LevelSequence.static_class().get_class_path_name()],
        recursive_paths=True,
    )
    assets = list(asset_registry.get_assets(asset_filter))
    assets.sort(key=lambda asset: str(asset.asset_name).lower())

    sequences = []
    for asset in assets[:clamped_limit]:
        asset_name = str(asset.asset_name)
        package_name = str(asset.package_name)
        sequences.append(
            {
                "asset_name": asset_name,
                "package_name": package_name,
                "object_path": f"{package_name}.{asset_name}",
            }
        )

    return {
        "root_path": normalized_root,
        "count": len(sequences),
        "sequences": sequences,
    }


def sequence_info(sequence_path: str) -> dict:
    normalized_sequence_path = normalize_object_path(sequence_path)
    sequence = unreal.load_asset(normalized_sequence_path, unreal.LevelSequence)
    if not sequence:
        raise RuntimeError(f"Could not load Level Sequence '{normalized_sequence_path}'")

    display_rate = sequence.get_display_rate()
    tick_resolution = sequence.get_tick_resolution()
    playback_start_ticks = int(sequence.get_playback_start())
    playback_end_ticks = int(sequence.get_playback_end())

    bindings = []
    for binding in sequence.get_bindings():
        bindings.append(
            {
                "name": _binding_name(binding),
                "binding_id": str(binding.get_id()),
                "track_count": len(binding.get_tracks()),
            }
        )

    master_tracks = [_track_summary(track) for track in sequence.get_tracks()]

    return {
        "name": sequence.get_name(),
        "path": normalized_sequence_path,
        "has_movie_scene": True,
        "master_track_count": len(master_tracks),
        "binding_count": len(bindings),
        "display_rate": _frame_rate_to_dict(display_rate),
        "tick_resolution": _frame_rate_to_dict(tick_resolution),
        "playback_start": _display_frame_from_ticks(playback_start_ticks, tick_resolution, display_rate),
        "playback_end": _display_frame_from_ticks(playback_end_ticks, tick_resolution, display_rate),
        "playback_start_ticks": playback_start_ticks,
        "playback_end_ticks": playback_end_ticks,
        "bindings": bindings,
        "master_tracks": master_tracks,
    }
