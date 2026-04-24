import unreal

from opencode_unreal_bundle.editor import normalize_map_path, world_summary


def main(args):
    level_path = args.get("level_path")
    if not isinstance(level_path, str) or not level_path.strip():
        raise ValueError("level_path is required")

    normalized_level_path = normalize_map_path(level_path)
    world = unreal.EditorLoadingAndSavingUtils.load_map(normalized_level_path)
    if not world:
        raise RuntimeError(f"Failed to load map '{normalized_level_path}'")

    return world_summary(world, normalized_level_path)
