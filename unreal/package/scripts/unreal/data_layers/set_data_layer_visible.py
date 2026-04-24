from opencode_unreal_bundle.data_layers import set_data_layer_visible


def main(args):
    data_layer_name = args.get("data_layer_name")
    if not isinstance(data_layer_name, str) or not data_layer_name.strip():
        raise ValueError("data_layer_name is required")
    if "visible" not in args:
        raise ValueError("visible is required")
    return set_data_layer_visible(data_layer_name, args.get("visible"))
