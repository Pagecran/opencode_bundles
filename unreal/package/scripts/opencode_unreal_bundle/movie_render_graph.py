# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore

from .editor import normalize_object_path
from .sequencer import _normalize_root_path


def _class_name(asset_data) -> str:
    class_path = asset_data.asset_class_path
    if hasattr(class_path, "asset_name"):
        return str(class_path.asset_name)
    return str(class_path)


def list_movie_render_graphs(root_path: str | None = None, limit: int = 100) -> dict:
    normalized_root = _normalize_root_path(root_path)
    clamped_limit = max(1, min(int(limit), 500))

    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    asset_filter = unreal.ARFilter(
        package_paths=[normalized_root],
        recursive_paths=True,
    )
    assets = list(asset_registry.get_assets(asset_filter))
    assets.sort(key=lambda asset: str(asset.asset_name).lower())

    graphs = []
    for asset in assets:
        class_name = _class_name(asset)
        class_name_lower = class_name.lower()
        if "moviegraph" not in class_name_lower and "rendergraph" not in class_name_lower:
            continue

        asset_name = str(asset.asset_name)
        package_name = str(asset.package_name)
        graphs.append(
            {
                "asset_name": asset_name,
                "package_name": package_name,
                "object_path": f"{package_name}.{asset_name}",
                "class": class_name,
            }
        )
        if len(graphs) >= clamped_limit:
            break

    return {
        "root_path": normalized_root,
        "count": len(graphs),
        "graphs": graphs,
    }


def get_movie_render_graph_info(graph_path: str) -> dict:
    normalized_graph_path = normalize_object_path(graph_path)
    graph_asset = unreal.load_asset(normalized_graph_path)
    if not graph_asset:
        raise RuntimeError(f"Could not load graph asset '{normalized_graph_path}'")

    return {
        "name": graph_asset.get_name(),
        "path": graph_asset.get_path_name(),
        "class": graph_asset.get_class().get_name(),
        "note": "Graph node introspection is planned in a later implementation wave.",
    }
