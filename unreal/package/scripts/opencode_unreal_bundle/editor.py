# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore


def _normalize_path(value: str) -> str:
    candidate = value.strip().replace("\\", "/")
    if not candidate:
        raise ValueError("path must be a non-empty Unreal asset path")
    if not candidate.startswith(("/Game", "/Engine")):
        raise ValueError("path must start with /Game or /Engine")
    return candidate


def normalize_map_path(value: str) -> str:
    candidate = _normalize_path(value)
    slash_index = candidate.rfind("/")
    dot_index = candidate.rfind(".")
    if dot_index > slash_index:
        candidate = candidate[:dot_index]
    return candidate


def normalize_object_path(value: str) -> str:
    candidate = _normalize_path(value)
    slash_index = candidate.rfind("/")
    dot_index = candidate.rfind(".")
    if dot_index > slash_index:
        return candidate
    asset_name = candidate[slash_index + 1 :]
    return f"{candidate}.{asset_name}"


def world_summary(world, requested_path: str):
    package_name = None
    try:
        outer = world.get_outermost()
        package_name = outer.get_name() if outer else None
    except Exception:
        package_name = None

    return {
        "ok": True,
        "requested_level_path": requested_path,
        "level_path": normalize_map_path(requested_path),
        "world_name": world.get_name(),
        "map_name": world.get_name(),
        "package_name": package_name,
        "world_path": world.get_path_name(),
    }


def sequence_summary(sequence, requested_path: str, opened: bool):
    return {
        "ok": bool(opened),
        "requested_sequence_path": requested_path,
        "sequence_path": normalize_object_path(requested_path),
        "asset_name": sequence.get_name(),
        "asset_path": sequence.get_path_name(),
        "opened": bool(opened),
    }
