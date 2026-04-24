from opencode_unreal_bundle.sequencer_mutation import add_track


def main(args):
    return add_track(
        sequence_path=args.get("sequence_path", ""),
        track_type=args.get("track_type", ""),
        binding_id=args.get("binding_id"),
    )
