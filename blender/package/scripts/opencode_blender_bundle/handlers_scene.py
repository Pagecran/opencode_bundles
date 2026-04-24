# ##### BEGIN GPL LICENSE BLOCK #####
#
#  This program is free software; you can redistribute it and/or
#  modify it under the terms of the GNU General Public License
#  as published by the Free Software Foundation; either version 2
#  of the License, or (at your option) any later version.
#
# ##### END GPL LICENSE BLOCK #####

"""Scene handlers for the OpenCode Blender bundle runtime."""

import base64
import bpy
import os
import tempfile


def register_handlers():
    from . import register_handler

    register_handler("get_scene_info", get_scene_info)
    register_handler("get_full_scene_hierarchy", get_full_scene_hierarchy)
    register_handler("get_object_info", get_object_info)
    register_handler("get_object_modifiers", get_object_modifiers)
    register_handler("create_object", create_object)
    register_handler("delete_object", delete_object)
    register_handler("transform_object", transform_object)
    register_handler("set_active_camera", set_active_camera)
    register_handler("get_viewport_screenshot", get_viewport_screenshot)
    register_handler("get_node_editor_screenshot", get_node_editor_screenshot)


# ---------------------------------------------------------------------------
# Scene info
# ---------------------------------------------------------------------------
def get_scene_info():
    """Get full scene information (no object limit)."""
    scene = bpy.context.scene
    objects = []
    for obj in scene.objects:
        obj_info = {
            "name": obj.name,
            "type": obj.type,
            "location": [round(obj.location.x, 4), round(obj.location.y, 4), round(obj.location.z, 4)],
            "parent": obj.parent.name if obj.parent else None,
            "visible": obj.visible_get(),
        }
        if obj.type == "MESH" and obj.data:
            obj_info["vertices"] = len(obj.data.vertices)
            obj_info["polygons"] = len(obj.data.polygons)
        if obj.modifiers:
            obj_info["modifiers"] = [modifier.name for modifier in obj.modifiers]
        objects.append(obj_info)

    return {
        "name": scene.name,
        "object_count": len(scene.objects),
        "objects": objects,
        "materials_count": len(bpy.data.materials),
        "frame_current": scene.frame_current,
        "frame_start": scene.frame_start,
        "frame_end": scene.frame_end,
        "render_engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "camera": scene.camera.name if scene.camera else None,
    }


def get_full_scene_hierarchy():
    """Get the full collection/object hierarchy tree."""

    def _collection_tree(collection):
        return {
            "name": collection.name,
            "objects": [obj.name for obj in collection.objects],
            "children": [_collection_tree(child) for child in collection.children],
        }

    return _collection_tree(bpy.context.scene.collection)


# ---------------------------------------------------------------------------
# Object info
# ---------------------------------------------------------------------------
def get_object_info(name):
    """Get detailed info about a specific object."""
    obj = bpy.data.objects.get(name)
    if not obj:
        raise ValueError(f"Object not found: {name}")

    info = {
        "name": obj.name,
        "type": obj.type,
        "location": list(obj.location),
        "rotation_euler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "visible": obj.visible_get(),
        "parent": obj.parent.name if obj.parent else None,
        "children": [child.name for child in obj.children],
        "materials": [slot.material.name for slot in obj.material_slots if slot.material],
    }

    if obj.type == "MESH" and obj.data:
        mesh = obj.data
        info["mesh"] = {
            "vertices": len(mesh.vertices),
            "edges": len(mesh.edges),
            "polygons": len(mesh.polygons),
        }

        import mathutils

        corners = [mathutils.Vector(corner) for corner in obj.bound_box]
        world_corners = [obj.matrix_world @ corner for corner in corners]
        min_corner = [min(corner[index] for corner in world_corners) for index in range(3)]
        max_corner = [max(corner[index] for corner in world_corners) for index in range(3)]
        info["world_bounding_box"] = [min_corner, max_corner]

    if obj.modifiers:
        info["modifiers"] = [
            {"name": modifier.name, "type": modifier.type} for modifier in obj.modifiers
        ]

    return info


def get_object_modifiers(name):
    """Get detailed modifier info for an object."""
    obj = bpy.data.objects.get(name)
    if not obj:
        raise ValueError(f"Object not found: {name}")

    modifiers = []
    for modifier in obj.modifiers:
        modifier_info = {"name": modifier.name, "type": modifier.type}
        if modifier.type == "NODES" and modifier.node_group:
            modifier_info["node_group"] = modifier.node_group.name
            inputs = {}
            for item in modifier.node_group.interface.items_tree:
                if item.item_type == "SOCKET" and item.in_out == "INPUT":
                    identifier = item.identifier
                    try:
                        inputs[item.name] = modifier[identifier]
                    except (KeyError, TypeError):
                        inputs[item.name] = None
            modifier_info["inputs"] = inputs
        modifiers.append(modifier_info)

    return modifiers


# ---------------------------------------------------------------------------
# Object creation / manipulation
# ---------------------------------------------------------------------------
def create_object(obj_type="MESH", primitive="CUBE", name=None, location=None):
    """Create a new object. primitive: CUBE, SPHERE, CYLINDER, CONE, PLANE, EMPTY, CAMERA, LIGHT."""
    del obj_type
    loc = tuple(location) if location else (0, 0, 0)

    primitives = {
        "CUBE": lambda: bpy.ops.mesh.primitive_cube_add(location=loc),
        "SPHERE": lambda: bpy.ops.mesh.primitive_uv_sphere_add(location=loc),
        "CYLINDER": lambda: bpy.ops.mesh.primitive_cylinder_add(location=loc),
        "CONE": lambda: bpy.ops.mesh.primitive_cone_add(location=loc),
        "PLANE": lambda: bpy.ops.mesh.primitive_plane_add(location=loc),
        "CIRCLE": lambda: bpy.ops.mesh.primitive_circle_add(location=loc),
        "GRID": lambda: bpy.ops.mesh.primitive_grid_add(location=loc),
    }

    primitive = primitive.upper()
    if primitive == "EMPTY":
        bpy.ops.object.empty_add(location=loc)
    elif primitive == "CAMERA":
        camera_data = bpy.data.cameras.new(name or "Camera")
        camera_object = bpy.data.objects.new(name or "Camera", camera_data)
        bpy.context.scene.collection.objects.link(camera_object)
        camera_object.location = loc
        bpy.context.view_layer.objects.active = camera_object
    elif primitive == "LIGHT":
        light_data = bpy.data.lights.new(name or "Light", "POINT")
        light_object = bpy.data.objects.new(name or "Light", light_data)
        bpy.context.scene.collection.objects.link(light_object)
        light_object.location = loc
        bpy.context.view_layer.objects.active = light_object
    elif primitive in primitives:
        primitives[primitive]()
    else:
        raise ValueError(f"Unknown primitive: {primitive}")

    obj = bpy.context.view_layer.objects.active
    if name and obj:
        obj.name = name

    return {"name": obj.name, "type": obj.type}


def delete_object(name):
    """Delete an object by name."""
    obj = bpy.data.objects.get(name)
    if not obj:
        raise ValueError(f"Object not found: {name}")

    obj_type = obj.type
    bpy.data.objects.remove(obj, do_unlink=True)

    return {"name": name, "type": obj_type, "deleted": True}


def transform_object(name, location=None, rotation=None, scale=None):
    """Set transform on an object."""
    obj = bpy.data.objects.get(name)
    if not obj:
        raise ValueError(f"Object not found: {name}")

    if location is not None:
        obj.location = tuple(location)
    if rotation is not None:
        obj.rotation_euler = tuple(rotation)
    if scale is not None:
        obj.scale = tuple(scale)

    return {
        "name": obj.name,
        "location": list(obj.location),
        "rotation": list(obj.rotation_euler),
        "scale": list(obj.scale),
    }


def set_active_camera(name):
    """Set the active camera for the scene."""
    obj = bpy.data.objects.get(name)
    if not obj or obj.type != "CAMERA":
        raise ValueError(f"Camera not found: {name}")
    bpy.context.scene.camera = obj
    return {"camera": obj.name}


# ---------------------------------------------------------------------------
# Viewport screenshot
# ---------------------------------------------------------------------------
def get_viewport_screenshot(max_size=800):
    """Capture a viewport screenshot and return it as base64."""
    area = None
    for candidate in bpy.context.screen.areas:
        if candidate.type == "VIEW_3D":
            area = candidate
            break
    if not area:
        raise RuntimeError("No 3D viewport found")

    temp_path = os.path.join(tempfile.gettempdir(), f"opencode_blender_screenshot_{os.getpid()}.png")

    with bpy.context.temp_override(area=area):
        bpy.ops.screen.screenshot_area(filepath=temp_path)

    image = bpy.data.images.load(temp_path)
    width, height = image.size
    if max(width, height) > max_size:
        scale = max_size / max(width, height)
        image.scale(int(width * scale), int(height * scale))
        image.save()
        width, height = int(width * scale), int(height * scale)

    with open(temp_path, "rb") as handle:
        image_data = base64.b64encode(handle.read()).decode("ascii")

    bpy.data.images.remove(image)
    try:
        os.unlink(temp_path)
    except Exception:
        pass

    return {"width": width, "height": height, "image_base64": image_data, "format": "png"}


# ---------------------------------------------------------------------------
# Node editor screenshot
# ---------------------------------------------------------------------------
def get_node_editor_screenshot(tree_name=None, max_size=1200, fit_all=True):
    """Capture a screenshot of the node editor. Optionally switch to a specific node tree."""
    area = None
    for candidate in bpy.context.screen.areas:
        if candidate.type == "NODE_EDITOR":
            area = candidate
            break

    if not area:
        raise RuntimeError(
            "No Node Editor area found. Open a Geometry Nodes editor in Blender "
            "before using this tool (drag an edge to split the viewport, then switch to Geometry Node Editor)."
        )

    space = area.spaces.active

    if tree_name:
        node_group = bpy.data.node_groups.get(tree_name)
        if not node_group:
            raise ValueError(f"Node tree not found: {tree_name}")
        space.node_tree = node_group

    if fit_all:
        region = None
        for candidate in area.regions:
            if candidate.type == "WINDOW":
                region = candidate
                break
        if region:
            with bpy.context.temp_override(area=area, region=region):
                bpy.ops.node.view_all()

    temp_path = os.path.join(tempfile.gettempdir(), f"opencode_blender_nodes_{os.getpid()}.png")

    with bpy.context.temp_override(area=area):
        bpy.ops.screen.screenshot_area(filepath=temp_path)

    image = bpy.data.images.load(temp_path)
    width, height = image.size
    if max(width, height) > max_size:
        scale = max_size / max(width, height)
        image.scale(int(width * scale), int(height * scale))
        image.save()
        width, height = int(width * scale), int(height * scale)

    with open(temp_path, "rb") as handle:
        image_data = base64.b64encode(handle.read()).decode("ascii")

    bpy.data.images.remove(image)
    try:
        os.unlink(temp_path)
    except Exception:
        pass

    current_tree = space.node_tree.name if space.node_tree else None
    return {
        "width": width,
        "height": height,
        "image_base64": image_data,
        "format": "png",
        "tree_name": current_tree,
    }
