from opencode_unreal_bundle.sequencer import sequence_info


def main(args):
    sequence_path = args.get("sequence_path")
    if not isinstance(sequence_path, str) or not sequence_path.strip():
        raise ValueError("sequence_path is required")

    return sequence_info(sequence_path)
