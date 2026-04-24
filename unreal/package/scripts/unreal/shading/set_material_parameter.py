from opencode_unreal_bundle.materials import set_material_parameter


def main(args):
    return set_material_parameter(
        material_path=args.get("material_path", ""),
        parameter_name=args.get("parameter_name", ""),
        parameter_type=args.get("parameter_type", ""),
        value=args.get("value"),
    )
