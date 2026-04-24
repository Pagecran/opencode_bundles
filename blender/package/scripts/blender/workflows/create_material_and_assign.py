from opencode_blender_bundle.handlers_assets import mark_asset
from opencode_blender_bundle.handlers_shader import assign_material, create_shader_material_from_template


def main(args):
    name = args["name"]
    template_name = args.get("template_name", "principled_pbr")
    object_name = args.get("object_name")
    slot_index = args.get("slot_index", 0)
    mark_as_asset = args.get("mark_as_asset", False)
    description = args.get("description")
    author = args.get("author")
    tags = args.get("tags")

    reserved_keys = {
        "name",
        "template_name",
        "object_name",
        "slot_index",
        "mark_as_asset",
        "description",
        "author",
        "tags",
    }
    template_kwargs = {key: value for key, value in args.items() if key not in reserved_keys}

    material = create_shader_material_from_template(
        name=name,
        template_name=template_name,
        **template_kwargs,
    )
    result = {"material": material}

    if object_name:
        result["assignment"] = assign_material(
            object_name=object_name,
            material_name=material["name"],
            slot_index=slot_index,
        )

    if mark_as_asset:
        result["asset"] = mark_asset(
            asset_type="MATERIAL",
            name=material["name"],
            description=description,
            author=author,
            tags=tags,
            generate_preview=False,
        )

    return result
