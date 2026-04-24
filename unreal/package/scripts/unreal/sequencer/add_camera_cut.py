from opencode_unreal_bundle.sequencer_mutation import add_camera_cut


def main(args):
    return add_camera_cut(
        sequence_path=args.get("sequence_path", ""),
        camera_binding_id=args.get("camera_binding_id", ""),
        start_frame=args.get("start_frame", 0),
        end_frame=args.get("end_frame", 0),
    )
