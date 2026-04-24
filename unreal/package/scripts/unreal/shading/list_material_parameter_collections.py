from opencode_unreal_bundle.materials import list_material_parameter_collections


def main(args):
    return list_material_parameter_collections(
        root_path=args.get("root_path"),
        limit=args.get("limit", 100),
    )
