from opencode_unreal_bundle.sequencer_mutation import set_keyframe


def main(args):
    return set_keyframe(
        sequence_path=args.get("sequence_path", ""),
        channel_path=args.get("channel_path", ""),
        frame=args.get("frame", 0),
        value=args.get("value"),
    )
