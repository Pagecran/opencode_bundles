from opencode_unreal_bundle.movie_render_graph import list_movie_render_graphs


def main(args):
    return list_movie_render_graphs(
        root_path=args.get("root_path"),
        limit=args.get("limit", 100),
    )
