import unreal

from opencode_unreal_bundle.editor import normalize_object_path, sequence_summary


def main(args):
    sequence_path = args.get("sequence_path")
    if not isinstance(sequence_path, str) or not sequence_path.strip():
        raise ValueError("sequence_path is required")

    normalized_sequence_path = normalize_object_path(sequence_path)
    sequence = unreal.load_asset(normalized_sequence_path, unreal.LevelSequence)
    if not sequence:
        raise RuntimeError(f"Could not load Level Sequence '{normalized_sequence_path}'")

    opened = unreal.LevelSequenceEditorBlueprintLibrary().open_level_sequence(sequence)
    if not opened:
        raise RuntimeError(f"Failed to open Level Sequence '{normalized_sequence_path}'")

    return sequence_summary(sequence, normalized_sequence_path, opened)
