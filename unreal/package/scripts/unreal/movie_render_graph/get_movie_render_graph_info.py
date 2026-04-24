from opencode_unreal_bundle.movie_render_graph import get_movie_render_graph_info


def main(args):
    graph_path = args.get("graph_path")
    if not isinstance(graph_path, str) or not graph_path.strip():
        raise ValueError("graph_path is required")

    return get_movie_render_graph_info(graph_path)
