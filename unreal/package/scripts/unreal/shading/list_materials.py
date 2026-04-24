from opencode_unreal_bundle.materials import list_materials


def main(args):
    return list_materials(
        root_path=args.get("root_path"),
        limit=args.get("limit", 100),
        include_instances=args.get("include_instances", True),
    )
