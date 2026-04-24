from opencode_unreal_bundle.materials import create_material_instance


def main(args):
    return create_material_instance(
        parent_material_path=args.get("parent_material_path", ""),
        package_path=args.get("package_path", ""),
        asset_name=args.get("asset_name", ""),
    )
