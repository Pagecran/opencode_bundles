from opencode_unreal_bundle.rendering import render_sequence_with_graph


def main(args):
    return render_sequence_with_graph(
        graph_path=args.get("graph_path", ""),
        sequence_path=args.get("sequence_path", ""),
        map_path=args.get("map_path"),
        job_name=args.get("job_name"),
        output_path=args.get("output_path"),
    )
