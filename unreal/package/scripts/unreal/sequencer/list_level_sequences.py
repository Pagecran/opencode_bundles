from opencode_unreal_bundle.sequencer import list_level_sequences


def main(args):
    return list_level_sequences(
        root_path=args.get("root_path"),
        limit=args.get("limit", 100),
    )
