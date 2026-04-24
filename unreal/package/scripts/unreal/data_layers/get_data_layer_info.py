from opencode_unreal_bundle.data_layers import get_data_layer_info


def main(args):
    data_layer_name = args.get("data_layer_name")
    if not isinstance(data_layer_name, str) or not data_layer_name.strip():
        raise ValueError("data_layer_name is required")
    return get_data_layer_info(data_layer_name)
