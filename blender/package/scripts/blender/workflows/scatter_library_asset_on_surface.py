from opencode_blender_bundle.handlers_assets import import_blend_asset
from opencode_blender_bundle.handlers_geometry_nodes import create_gn_from_template


def main(args):
    surface_object_name = args["surface_object_name"]
    filepath = args["filepath"]
    asset_name = args["asset_name"]
    asset_type = args.get("asset_type", "OBJECT").upper()
    library_name = args.get("library_name")
    tree_name = args.get("tree_name")
    density = args.get("density", 100)
    instance_scale = args.get("instance_scale")
    align_to_normal = args.get("align_to_normal", True)
    random_rotation = args.get("random_rotation", True)
    random_scale_range = args.get("random_scale_range")
    use_realize_instances = args.get("use_realize_instances", False)
    keep_input_geometry = args.get("keep_input_geometry", True)
    link = args.get("link", False)

    if asset_type not in {"OBJECT", "COLLECTION"}:
        raise ValueError("asset_type must be OBJECT or COLLECTION")

    imported_asset = import_blend_asset(
        filepath=filepath,
        asset_type=asset_type,
        name=asset_name,
        library_name=library_name,
        link=link,
        link_to_scene=False,
    )

    resolved_tree_name = tree_name or f"Scatter_{surface_object_name}_{asset_name}"
    scatter_kwargs = {
        "template_name": "scatter_on_surface",
        "tree_name": resolved_tree_name,
        "object_name": surface_object_name,
        "density": density,
        "instance_scale": instance_scale,
        "align_to_normal": align_to_normal,
        "random_rotation": random_rotation,
        "random_scale_range": random_scale_range,
        "use_realize_instances": use_realize_instances,
        "keep_input_geometry": keep_input_geometry,
    }
    if asset_type == "OBJECT":
        scatter_kwargs["instance_object_name"] = asset_name
    else:
        scatter_kwargs["instance_collection_name"] = asset_name

    scatter_setup = create_gn_from_template(**scatter_kwargs)

    return {
        "imported_asset": imported_asset,
        "scatter_setup": scatter_setup,
    }
