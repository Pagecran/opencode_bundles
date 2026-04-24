from opencode_unreal_bundle.materials import get_material_info


def main(args):
    material_path = args.get("material_path")
    if not isinstance(material_path, str) or not material_path.strip():
        raise ValueError("material_path is required")
    return get_material_info(material_path)
