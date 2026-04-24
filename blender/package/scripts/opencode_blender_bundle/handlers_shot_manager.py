# ##### BEGIN GPL LICENSE BLOCK #####
#
#  This program is free software; you can redistribute it and/or
#  modify it under the terms of the GNU General Public License
#  as published by the Free Software Foundation; either version 2
#  of the License, or (at your option) any later version.
#
# ##### END GPL LICENSE BLOCK #####

"""Shot Manager handlers for the OpenCode Blender bundle runtime."""

import bpy


def register_handlers():
    from . import register_handler

    register_handler("get_shot_manager_status", get_shot_manager_status)
    register_handler("get_shot_list", get_shot_list)
    register_handler("get_shot_details", get_shot_details)
    register_handler("create_shot", create_shot)
    register_handler("modify_shot", modify_shot)
    register_handler("enable_disable_shots", enable_disable_shots)
    register_handler("set_shot_manager_render_path", set_shot_manager_render_path)
    register_handler("launch_batch_render", launch_batch_render)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_sm_props():
    """Get Shot Manager general properties. Raises if SM not active."""
    if not hasattr(bpy.context.scene, "sm_general_props"):
        raise RuntimeError("Shot Manager is not active in this scene")
    return bpy.context.scene.sm_general_props


def _get_shots():
    """Get the shot list from Shot Manager."""
    props = _get_sm_props()
    if not props.node_tree:
        return []
    return list(props.node_tree.shots)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
def get_shot_manager_status():
    """Check if Shot Manager Pro is active and return basic info."""
    active = hasattr(bpy.context.scene, "sm_general_props")
    if not active:
        return {"active": False, "message": "Shot Manager is not installed or not active"}

    props = bpy.context.scene.sm_general_props
    shot_count = len(_get_shots()) if props.node_tree else 0

    return {
        "active": True,
        "shot_count": shot_count,
        "redirect_output": props.redirect_output,
        "alternative_root": props.alternative_root,
    }


# ---------------------------------------------------------------------------
# Shot listing
# ---------------------------------------------------------------------------
def get_shot_list():
    """Get all shots with basic info."""
    shots = _get_shots()
    result = []
    for shot in shots:
        result.append({
            "name": shot.name,
            "enabled": shot.enable,
            "start_frame": shot.start_frame_render,
            "end_frame": shot.end_frame_render,
            "still_mode": shot.still_mode,
        })
    return {"shots": result, "count": len(result)}


def get_shot_details(shot_name):
    """Get detailed info about a specific shot."""
    shots = _get_shots()
    for shot in shots:
        if shot.name == shot_name:
            details = {
                "name": shot.name,
                "label": shot.label if hasattr(shot, "label") else "",
                "enabled": shot.enable,
                "start_frame": shot.start_frame_render,
                "end_frame": shot.end_frame_render,
                "still_mode": shot.still_mode,
                "notes": shot.notes if hasattr(shot, "notes") else "",
            }

            if hasattr(shot, "properties"):
                overrides = {}
                for prop in shot.properties:
                    overrides[prop.prop_id] = {
                        "name": prop.name if hasattr(prop, "name") else prop.prop_id,
                        "enabled": prop.enable if hasattr(prop, "enable") else True,
                    }
                details["overrides"] = overrides

            camera_prop = shot.lookup_prop("camera") if hasattr(shot, "lookup_prop") else None
            if camera_prop and hasattr(camera_prop, "value"):
                details["camera"] = str(camera_prop.value)

            return details

    raise ValueError(f"Shot not found: {shot_name}")


# ---------------------------------------------------------------------------
# Shot creation / modification
# ---------------------------------------------------------------------------
def create_shot(name=None, start_frame=None, end_frame=None, camera=None):
    """Create a new shot in Shot Manager.

    Bypasses bpy.ops.sm.add_shot to avoid poll() context failures when called
    from the bridge socket handler (the operator requires node_tree to exist
    and a full UI context).  Instead we manipulate SM's data structures
    directly and call its internal state-sync helpers.
    """
    _get_sm_props()
    scene = bpy.context.scene
    props = scene.sm_general_props

    # Import SM internals for proper state management
    try:
        from bl_ext.system.shot_manager.globals import (
            skip_update, get_all_shot_grps, shot_change,
            update_visibility_set,
        )
    except ImportError:
        raise RuntimeError(
            "Cannot import Shot Manager internals. "
            "Ensure Shot Manager is installed as a Blender system extension."
        )

    # --- Ensure a ShotList node tree exists ---
    if not props.node_tree:
        props.node_tree = bpy.data.node_groups.new("Shot List", "ShotList")

    shot_grp = props.node_tree.shots

    # --- Helpers ---
    def _next_id():
        """Generate the next unused numeric string ID across all shot lists."""
        ids = set()
        for grp in get_all_shot_grps():
            for s in grp:
                try:
                    ids.add(int(s.name))
                except ValueError:
                    pass
        n = 0
        while n in ids:
            n += 1
        return str(n)

    def _unique_label(label):
        """Return *label* if unique, otherwise append .001 / .002 / etc."""
        all_labels = []
        for grp in get_all_shot_grps():
            all_labels.extend(s.label for s in grp)
        if all_labels.count(label) <= 1:
            return label
        i = 1
        while True:
            candidate = f"{label}.{str(i).zfill(3)}"
            if candidate not in all_labels:
                return candidate
            i += 1

    def _add_sub_prop(shot, rna_path, label, override=True):
        """Add a sub-property (SM_shot_custom_props) to *shot*."""
        sub = shot.properties.add()
        sub.name = label
        skip_update[0] = False
        sub.rna_path = rna_path
        skip_update[0] = True
        sub.override = override
        sub.parent_id = shot.name
        try:
            val = scene.path_resolve(rna_path)
            if val is not None:
                setattr(sub, sub.rna_type, val)
        except Exception:
            pass
        return sub

    was_skip = skip_update[0]
    skip_update[0] = True

    try:
        # --- Create the Default shot if the list is empty ---
        if len(shot_grp) == 0:
            default = shot_grp.add()
            default.is_default = True
            default.name = _next_id()
            default.source_id = default.name
            default.source_tree = props.node_tree
            default.label = "Default"
            default.icon = "HOME"
            for rna_path, label in (
                ("frame_start", "Start"),
                ("frame_end", "End"),
                ("camera", "Camera"),
            ):
                _add_sub_prop(default, rna_path, label, override=True)

        # --- Create the new regular shot ---
        default_shot = shot_grp[0]
        active_index = props.node_tree.list_index
        new_index = len(shot_grp)

        new = shot_grp.add()
        new.source_tree = props.node_tree
        new.source_id = default_shot.name
        new.still_mode = default_shot.still_mode
        new.name = _next_id()

        shot_label = name if name else "New_Shot"
        new.label = shot_label
        new.label = _unique_label(shot_label)

        # Start / End sub-properties (like make_default_props)
        _add_sub_prop(new, "frame_start", "Start")
        _add_sub_prop(new, "frame_end", "End")

        # Position after active shot
        shot_grp.move(new_index, active_index + 1)
        props.node_tree.list_index = active_index + 1

        # Camera sub-property (added during structure creation)
        if camera:
            cam_obj = bpy.data.objects.get(camera)
            if cam_obj and cam_obj.type == "CAMERA":
                sub = _add_sub_prop(new, "camera", "Camera")
                sub.rna_object = cam_obj

    finally:
        skip_update[0] = was_skip

    # Finalize SM internal state -- let shot_change sync everything first
    skip_update[0] = False
    try:
        shot_change(None, bpy.context)
        update_visibility_set(bpy.context)
    except Exception:
        pass

    # Apply caller-provided values AFTER shot_change so they are not
    # overwritten by SM's internal sync.  Setting sub-properties with
    # skip_update off lets SM's own update callbacks propagate the
    # values to start_frame_render / end_frame_render and the scene.
    #
    # IMPORTANT: End must be set BEFORE Start because Blender enforces
    # frame_start <= frame_end.  If the new start exceeds the current
    # scene.frame_end the value gets clamped.
    def _set_sub_prop_value(shot, prop_name, value):
        for p in shot.properties:
            if p.name == prop_name and p.rna_type:
                setattr(p, p.rna_type, value)
                return True
        return False

    if end_frame is not None:
        _set_sub_prop_value(new, "End", end_frame)
        new.end_frame_render = end_frame

    if start_frame is not None:
        _set_sub_prop_value(new, "Start", start_frame)
        new.start_frame_render = start_frame

    return {
        "name": new.label,
        "id": new.name,
        "start_frame": new.start_frame_render,
        "end_frame": new.end_frame_render,
    }


def modify_shot(shot_name, name=None, start_frame=None, end_frame=None, enabled=None, still_mode=None):
    """Modify an existing shot's properties."""
    shots = _get_shots()
    for shot in shots:
        if shot.name == shot_name:
            if name is not None:
                shot.name = name
            if start_frame is not None:
                shot.start_frame_render = start_frame
            if end_frame is not None:
                shot.end_frame_render = end_frame
            if enabled is not None:
                shot.enable = enabled
            if still_mode is not None:
                shot.still_mode = still_mode

            return {
                "name": shot.name,
                "start_frame": shot.start_frame_render,
                "end_frame": shot.end_frame_render,
                "enabled": shot.enable,
            }

    raise ValueError(f"Shot not found: {shot_name}")


def enable_disable_shots(shot_names, enabled):
    """Enable or disable multiple shots at once."""
    shots = _get_shots()
    modified = []
    for shot in shots:
        if shot.name in shot_names:
            shot.enable = enabled
            modified.append(shot.name)

    return {"modified": modified, "enabled": enabled}


# ---------------------------------------------------------------------------
# Render path
# ---------------------------------------------------------------------------
def set_shot_manager_render_path(path, redirect=True):
    """Set the Shot Manager alternative root output path."""
    props = _get_sm_props()
    props.redirect_output = redirect
    props.alternative_root = path
    return {
        "redirect_output": props.redirect_output,
        "alternative_root": props.alternative_root,
    }


# ---------------------------------------------------------------------------
# Batch render
# ---------------------------------------------------------------------------
def launch_batch_render():
    """Launch a batch render of all enabled shots."""
    _get_sm_props()

    try:
        bpy.ops.wm.render_sm()
        return {"status": "started", "message": "Batch render started"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
