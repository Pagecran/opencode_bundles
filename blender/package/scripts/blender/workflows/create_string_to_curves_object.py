import bpy

from opencode_blender_bundle.node_utils import serialize_node_tree, set_socket_default_value


def main(args):
    text = args["text"]
    object_name = args.get("object_name")
    tree_name = args.get("tree_name")
    size = args.get("size", 1.0)
    location = args.get("location")
    font_name = args.get("font_name")

    resolved_object_name = object_name or "GN_Text"
    resolved_tree_name = tree_name or f"{resolved_object_name}_StringToCurves"

    mesh = bpy.data.meshes.new(f"{resolved_object_name}_Mesh")
    obj = bpy.data.objects.new(resolved_object_name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = tuple(location) if location else (0, 0, 0)

    tree = bpy.data.node_groups.new(resolved_tree_name, "GeometryNodeTree")
    tree.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    tree.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")

    input_node = tree.nodes.new("NodeGroupInput")
    input_node.location = (-700, 0)
    output_node = tree.nodes.new("NodeGroupOutput")
    output_node.location = (500, 0)

    string_to_curves = tree.nodes.new("GeometryNodeStringToCurves")
    string_to_curves.name = "String to Curves"
    string_to_curves.location = (-420, 0)
    set_socket_default_value(string_to_curves.inputs["String"], text)
    set_socket_default_value(string_to_curves.inputs["Size"], float(size))
    if font_name:
        font = bpy.data.fonts.get(font_name)
        if not font:
            raise ValueError(f"Font not found: {font_name}")
        set_socket_default_value(string_to_curves.inputs["Font"], font)

    realize_instances = tree.nodes.new("GeometryNodeRealizeInstances")
    realize_instances.name = "Realize Text"
    realize_instances.location = (-100, 0)

    fill_curve = tree.nodes.new("GeometryNodeFillCurve")
    fill_curve.name = "Fill Curve"
    fill_curve.location = (150, 0)

    tree.links.new(string_to_curves.outputs["Curve Instances"], realize_instances.inputs["Geometry"])
    tree.links.new(realize_instances.outputs["Geometry"], fill_curve.inputs["Curve"])
    tree.links.new(fill_curve.outputs["Mesh"], output_node.inputs[0])

    modifier = obj.modifiers.new(name=resolved_tree_name, type="NODES")
    modifier.node_group = tree

    return {
        "object_name": obj.name,
        "modifier_name": modifier.name,
        "tree_name": tree.name,
        "text": text,
        "node_tree": serialize_node_tree(tree),
    }
