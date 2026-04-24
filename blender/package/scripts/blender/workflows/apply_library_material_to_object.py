from opencode_blender_bundle.handlers_assets import import_blend_asset
from opencode_blender_bundle.handlers_shader import assign_material


def main(args):
    object_name = args["object_name"]
    filepath = args["filepath"]
    material_name = args["material_name"]
    library_name = args.get("library_name")
    slot_index = args.get("slot_index", 0)
    link = args.get("link", False)

    imported_asset = import_blend_asset(
        filepath=filepath,
        asset_type="MATERIAL",
        name=material_name,
        library_name=library_name,
        link=link,
        link_to_scene=False,
    )
    assignment = assign_material(
        object_name=object_name,
        material_name=material_name,
        slot_index=slot_index,
    )

    return {
        "imported_asset": imported_asset,
        "assignment": assignment,
    }
