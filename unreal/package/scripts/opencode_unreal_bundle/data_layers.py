# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import unreal  # type: ignore


def _editor_world_name() -> str:
    world = unreal.EditorLevelLibrary.get_editor_world()
    return world.get_name() if world else ""


def _data_layer_subsystem():
    subsystem = unreal.get_editor_subsystem(unreal.DataLayerEditorSubsystem)
    if not subsystem:
        raise RuntimeError("DataLayerEditorSubsystem is not available")
    return subsystem


def _runtime_state_name(value) -> str:
    text = str(value)
    return text.split("::")[-1] if "::" in text else text


def _layer_names(layer) -> list[str]:
    names = []
    for method_name in ("get_data_layer_short_name", "get_data_layer_full_name"):
        method = getattr(layer, method_name, None)
        if callable(method):
            try:
                names.append(str(method()))
            except Exception:
                pass
    for property_name in ("data_layer_short_name", "data_layer_full_name"):
        value = None
        try:
            value = layer.get_editor_property(property_name)
        except Exception:
            value = None
        if value:
            names.append(str(value))
    names.append(layer.get_name())
    return [name for name in names if name]


def _find_layer(data_layer_name: str):
    requested = data_layer_name.strip().lower()
    subsystem = _data_layer_subsystem()
    for layer in subsystem.get_all_data_layers():
        if any(name.lower() == requested for name in _layer_names(layer)):
            return subsystem, layer
    raise RuntimeError("Data Layer not found")


def _layer_info(subsystem, layer) -> dict:
    effective_runtime_state = None
    getter = getattr(subsystem, "get_data_layer_instance_effective_runtime_state", None)
    if callable(getter):
        try:
            effective_runtime_state = getter(layer)
        except Exception:
            effective_runtime_state = None

    short_name_method = getattr(layer, "get_data_layer_short_name", None)
    full_name_method = getattr(layer, "get_data_layer_full_name", None)

    return {
        "short_name": str(short_name_method()) if callable(short_name_method) else layer.get_name(),
        "full_name": str(full_name_method()) if callable(full_name_method) else layer.get_name(),
        "class": layer.get_class().get_name(),
        "is_visible": bool(layer.is_visible()),
        "is_loaded_in_editor": bool(layer.is_loaded_in_editor()),
        "runtime_state": _runtime_state_name(layer.get_runtime_state()),
        "effective_runtime_state": _runtime_state_name(effective_runtime_state if effective_runtime_state is not None else layer.get_effective_runtime_state()),
    }


def list_data_layers() -> dict:
    subsystem = _data_layer_subsystem()
    layers = [_layer_info(subsystem, layer) for layer in subsystem.get_all_data_layers()]
    return {
        "world_name": _editor_world_name(),
        "count": len(layers),
        "data_layers": layers,
    }


def get_data_layer_info(data_layer_name: str) -> dict:
    subsystem, layer = _find_layer(data_layer_name)
    return _layer_info(subsystem, layer)


def set_data_layer_loaded(data_layer_name: str, loaded: bool) -> dict:
    subsystem, layer = _find_layer(data_layer_name)
    success = subsystem.set_data_layer_is_loaded_in_editor(layer, bool(loaded), True)
    if success is False:
        raise RuntimeError("Failed to change Data Layer loaded state")
    return _layer_info(subsystem, layer)


def set_data_layer_visible(data_layer_name: str, visible: bool) -> dict:
    subsystem, layer = _find_layer(data_layer_name)
    subsystem.set_data_layer_visibility(layer, bool(visible))
    return _layer_info(subsystem, layer)
