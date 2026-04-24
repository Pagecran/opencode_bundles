# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore

from .sequencer import _normalize_root_path
from .editor import normalize_object_path


def _safe_property(value, property_name: str, fallback=None):
    try:
        return value.get_editor_property(property_name)
    except Exception:
        return fallback


def _normalize_package_path(value: str) -> str:
    candidate = (value or "").strip().replace("\\", "/")
    if not candidate:
        raise ValueError("package_path is required")
    if not candidate.startswith("/"):
        candidate = f"/Game/{candidate}"
    if not candidate.startswith(("/Game", "/Engine")):
        raise ValueError("package_path must start with /Game or /Engine")
    return candidate.rstrip("/")


def _material_parameter_entries(material, parameter_type: str, getter_name: str) -> list[dict]:
    getter = getattr(material, getter_name, None)
    if not callable(getter):
        return []

    entries = []
    values = getter()
    infos = values[0] if isinstance(values, tuple) else values
    ids = values[1] if isinstance(values, tuple) and len(values) > 1 else []
    if not isinstance(infos, (list, tuple)):
        return []
    if not isinstance(ids, (list, tuple)):
        ids = []

    for index, info in enumerate(infos or []):
        name = getattr(info, "name", None)
        if name is None:
            name = _safe_property(info, "name")
        association = getattr(info, "association", None)
        if association is None:
            association = _safe_property(info, "association")

        entry = {
            "name": str(name),
            "type": parameter_type,
            "association": str(association) if association is not None else "Unknown",
        }
        if ids and index < len(ids):
            entry["id"] = str(ids[index])
        entries.append(entry)

    return entries


def _resolve_actor(actor_name: str):
    requested = actor_name.strip().lower()
    for actor in unreal.EditorLevelLibrary.get_all_level_actors():
        actor_label = actor.get_actor_label().lower() if hasattr(actor, "get_actor_label") else ""
        if actor.get_name().lower() == requested or actor_label == requested:
            return actor
    return None


def _resolve_material_slot_index(mesh_component, slot_name: str | None):
    if not slot_name:
        return 0 if mesh_component.get_num_materials() > 0 else -1

    requested = slot_name.lower()
    slot_names: list = []
    getter = getattr(mesh_component, "get_material_slot_names", None)
    if callable(getter):
        try:
            values = getter()
            slot_names = list(values) if isinstance(values, (list, tuple)) else []
        except Exception:
            slot_names = []

    for index, value in enumerate(slot_names):
        if str(value).lower() == requested:
            return index
    return -1


def list_materials(root_path: str | None = None, limit: int = 100, include_instances: bool = True) -> dict:
    normalized_root = _normalize_root_path(root_path)
    clamped_limit = max(1, min(int(limit), 500))
    resolved_include_instances = bool(include_instances)

    class_paths = [unreal.Material.static_class().get_class_path_name()]
    if resolved_include_instances:
        class_paths.append(unreal.MaterialInstanceConstant.static_class().get_class_path_name())

    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    asset_filter = unreal.ARFilter(
        package_paths=[normalized_root],
        class_paths=class_paths,
        recursive_paths=True,
    )
    assets = list(asset_registry.get_assets(asset_filter))
    assets.sort(key=lambda asset: str(asset.asset_name).lower())

    materials = []
    for asset in assets[:clamped_limit]:
        asset_name = str(asset.asset_name)
        package_name = str(asset.package_name)
        class_name = str(asset.asset_class_path)
        materials.append(
            {
                "asset_name": asset_name,
                "package_name": package_name,
                "object_path": f"{package_name}.{asset_name}",
                "class": class_name,
                "is_instance": "MaterialInstanceConstant" in class_name,
            }
        )

    return {
        "root_path": normalized_root,
        "include_instances": resolved_include_instances,
        "count": len(materials),
        "materials": materials,
    }


def get_material_info(material_path: str) -> dict:
    normalized_material_path = normalize_object_path(material_path)
    material = unreal.load_asset(normalized_material_path)
    if not material:
        raise RuntimeError(f"Could not load material '{normalized_material_path}'")

    result = {
        "name": material.get_name(),
        "path": material.get_path_name(),
        "class": material.get_class().get_name(),
        "is_instance": isinstance(material, unreal.MaterialInstance),
    }

    if isinstance(material, unreal.MaterialInstance):
        parent = _safe_property(material, "parent")
        result["parent_path"] = parent.get_path_name() if parent else ""

    base_material = material.get_material() if hasattr(material, "get_material") else None
    if base_material:
        result["base_material_path"] = base_material.get_path_name()
        result["blend_mode"] = str(_safe_property(base_material, "blend_mode", "Unknown"))
        result["material_domain"] = str(_safe_property(base_material, "material_domain", "Unknown"))
        result["two_sided"] = bool(_safe_property(base_material, "two_sided", False))

    parameters = []
    parameters.extend(_material_parameter_entries(material, "scalar", "get_all_scalar_parameter_info"))
    parameters.extend(_material_parameter_entries(material, "vector", "get_all_vector_parameter_info"))
    parameters.extend(_material_parameter_entries(material, "texture", "get_all_texture_parameter_info"))
    parameters.extend(_material_parameter_entries(material, "static_switch", "get_all_static_switch_parameter_info"))
    result["parameter_count"] = len(parameters)
    result["parameters"] = parameters
    return result


def create_material_instance(parent_material_path: str, package_path: str, asset_name: str) -> dict:
    resolved_asset_name = asset_name.strip()
    if not resolved_asset_name:
        raise ValueError("asset_name is required")
    if any(token in resolved_asset_name for token in ("/", "\\", ".", ":")):
        raise ValueError("asset_name is invalid")

    normalized_parent_path = normalize_object_path(parent_material_path)
    normalized_package_path = _normalize_package_path(package_path)
    parent_material = unreal.load_asset(normalized_parent_path)
    if not parent_material:
        raise RuntimeError(f"Could not load parent material '{normalized_parent_path}'")

    asset_path = f"{normalized_package_path}/{resolved_asset_name}.{resolved_asset_name}"
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        raise RuntimeError(f"Asset already exists at '{asset_path}'")

    factory = unreal.MaterialInstanceConstantFactoryNew()
    factory.set_editor_property("initial_parent", parent_material)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    material_instance = asset_tools.create_asset(
        resolved_asset_name,
        normalized_package_path,
        unreal.MaterialInstanceConstant,
        factory,
    )
    if not material_instance:
        raise RuntimeError("Failed to create material instance asset")

    unreal.EditorAssetLibrary.save_loaded_asset(material_instance)
    return {
        "asset_path": material_instance.get_path_name(),
        "parent_path": parent_material.get_path_name(),
    }


def set_material_parameter(material_path: str, parameter_name: str, parameter_type: str, value) -> dict:
    normalized_material_path = normalize_object_path(material_path)
    material_instance = unreal.load_asset(normalized_material_path)
    if not material_instance or not isinstance(material_instance, unreal.MaterialInstanceConstant):
        raise RuntimeError("set_material_parameter currently requires a material instance asset")

    resolved_parameter_type = parameter_type.strip().lower()
    if resolved_parameter_type == "scalar":
        success = unreal.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(
            material_instance,
            parameter_name,
            float(value),
        )
    elif resolved_parameter_type == "vector":
        if not isinstance(value, dict):
            raise ValueError("Vector parameter updates require object value with r/g/b/a or x/y/z/w")
        x = float(value.get("r", value.get("x", 1.0)))
        y = float(value.get("g", value.get("y", 1.0)))
        z = float(value.get("b", value.get("z", 1.0)))
        w = float(value.get("a", value.get("w", 1.0)))
        success = unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
            material_instance,
            parameter_name,
            unreal.LinearColor(x, y, z, w),
        )
    elif resolved_parameter_type == "texture":
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Texture parameter updates require string texture path in value")
        texture = unreal.load_asset(normalize_object_path(value))
        if not texture:
            raise RuntimeError("Could not load texture asset")
        success = unreal.MaterialEditingLibrary.set_material_instance_texture_parameter_value(
            material_instance,
            parameter_name,
            texture,
        )
    else:
        raise ValueError(f"Unsupported parameter_type '{resolved_parameter_type}'")

    if not success:
        raise RuntimeError("Material parameter update failed")

    unreal.EditorAssetLibrary.save_loaded_asset(material_instance)
    return {
        "material_path": material_instance.get_path_name(),
        "parameter_name": parameter_name,
        "parameter_type": resolved_parameter_type,
    }


def assign_material_to_actor(actor_name: str, material_path: str, slot_name: str | None = None) -> dict:
    actor = _resolve_actor(actor_name)
    if not actor:
        raise RuntimeError("Actor not found")

    material = unreal.load_asset(normalize_object_path(material_path))
    if not material:
        raise RuntimeError("Could not load material asset")

    mesh_components = actor.get_components_by_class(unreal.MeshComponent)
    if not mesh_components:
        raise RuntimeError("Actor has no mesh components")

    target_component = None
    material_index = -1
    for mesh_component in mesh_components:
        candidate_index = _resolve_material_slot_index(mesh_component, slot_name)
        if candidate_index != -1:
            target_component = mesh_component
            material_index = candidate_index
            break

    if target_component is None or material_index == -1:
        raise RuntimeError("Could not resolve target material slot on actor")
    if target_component.get_num_materials() > 0 and material_index >= target_component.get_num_materials():
        raise RuntimeError("Resolved material slot index is out of bounds for the target component")

    target_component.set_material(material_index, material)
    return {
        "actor_name": actor.get_actor_label() if hasattr(actor, "get_actor_label") else actor.get_name(),
        "component_name": target_component.get_name(),
        "material_path": material.get_path_name(),
        "material_index": material_index,
    }


def list_material_parameter_collections(root_path: str | None = None, limit: int = 100) -> dict:
    normalized_root = _normalize_root_path(root_path)
    clamped_limit = max(1, min(int(limit), 500))

    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    asset_filter = unreal.ARFilter(
        package_paths=[normalized_root],
        class_paths=[unreal.MaterialParameterCollection.static_class().get_class_path_name()],
        recursive_paths=True,
    )
    assets = list(asset_registry.get_assets(asset_filter))
    assets.sort(key=lambda asset: str(asset.asset_name).lower())

    collections = []
    for asset in assets[:clamped_limit]:
        asset_name = str(asset.asset_name)
        package_name = str(asset.package_name)
        collections.append(
            {
                "asset_name": asset_name,
                "package_name": package_name,
                "object_path": f"{package_name}.{asset_name}",
            }
        )

    return {
        "root_path": normalized_root,
        "count": len(collections),
        "collections": collections,
    }
