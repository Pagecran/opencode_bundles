from opencode_unreal_bundle.rendering import configure_movie_render_graph_job


def main(args):
    return configure_movie_render_graph_job(
        graph_path=args.get("graph_path", ""),
        sequence_path=args.get("sequence_path", ""),
        map_path=args.get("map_path"),
        job_name=args.get("job_name"),
    )
