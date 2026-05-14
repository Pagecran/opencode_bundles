from __future__ import annotations

import base64
import importlib.machinery
import importlib.util
import json
import os
import platform
import re
import sys
from pathlib import Path
from typing import Any


def load_dynamic(module_name: str, file_path: str):
    loader = importlib.machinery.ExtensionFileLoader(module_name, file_path)
    spec = importlib.util.spec_from_loader(module_name, loader)
    if spec is None:
        raise ImportError(f"Could not build module spec for {file_path}")

    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def parse_version_token(name: str) -> tuple[int, str]:
    match = re.search(r"(\d+)", name)
    version = int(match.group(1)) if match else -1
    return (version, name.lower())


def first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def unique_existing_strings(paths: list[Path]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for path in paths:
        raw = str(path)
        if raw in seen:
            continue
        seen.add(raw)
        unique.append(raw)
    return unique


def detect_windows_installations() -> dict[str, Any]:
    program_files = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
    program_data = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
    vendor_root = program_files / "Blackmagic Design"

    resolve_root = vendor_root / "DaVinci Resolve"
    resolve_lib_candidates = [
        Path(os.environ["PAGECRAN_RESOLVE_SCRIPT_LIB"])
        if os.environ.get("PAGECRAN_RESOLVE_SCRIPT_LIB")
        else None,
        Path(os.environ["RESOLVE_SCRIPT_LIB"])
        if os.environ.get("RESOLVE_SCRIPT_LIB")
        else None,
        resolve_root / "fusionscript.dll"
    ]
    resolve_libs = [path for path in resolve_lib_candidates if path is not None]

    fusion_roots = []
    render_node_roots = []
    if vendor_root.exists():
        for child in vendor_root.iterdir():
            if not child.is_dir():
                continue
            if not child.name.startswith("Fusion"):
                continue
            if "Render Node" in child.name:
                render_node_roots.append(child)
                continue
            fusion_roots.append(child)
    fusion_roots.sort(key=lambda item: parse_version_token(item.name), reverse=True)
    render_node_roots.sort(key=lambda item: parse_version_token(item.name), reverse=True)

    fusion_lib_candidates = []
    if os.environ.get("PAGECRAN_FUSION_SCRIPT_LIB"):
        fusion_lib_candidates.append(Path(os.environ["PAGECRAN_FUSION_SCRIPT_LIB"]))
    for root in fusion_roots:
        fusion_lib_candidates.append(root / "fusionscript.dll")
    fusion_lib_candidates.extend(resolve_libs)

    render_node_lib_candidates = []
    if os.environ.get("PAGECRAN_FUSION_RENDER_NODE_SCRIPT_LIB"):
        render_node_lib_candidates.append(Path(os.environ["PAGECRAN_FUSION_RENDER_NODE_SCRIPT_LIB"]))
    for root in render_node_roots:
        render_node_lib_candidates.append(root / "fusionscript.dll")
    render_node_lib_candidates.extend(fusion_lib_candidates)

    return {
        "resolve": {
            "root": str(resolve_root),
            "library_candidates": unique_existing_strings(resolve_libs),
            "library": str(first_existing(resolve_libs)) if first_existing(resolve_libs) else None,
            "developer_api": str(
                program_data / "Blackmagic Design" / "DaVinci Resolve" / "Support" / "Developer" / "Scripting"
            ),
            "executable": str(resolve_root / "Resolve.exe") if (resolve_root / "Resolve.exe").exists() else None
        },
        "fusion": {
            "roots": [str(root) for root in fusion_roots],
            "library_candidates": unique_existing_strings(fusion_lib_candidates),
            "library": str(first_existing(fusion_lib_candidates)) if first_existing(fusion_lib_candidates) else None,
            "executable": str(fusion_roots[0] / "Fusion.exe") if fusion_roots and (fusion_roots[0] / "Fusion.exe").exists() else None
        },
        "render_node": {
            "roots": [str(root) for root in render_node_roots],
            "library_candidates": unique_existing_strings(render_node_lib_candidates),
            "library": str(first_existing(render_node_lib_candidates)) if first_existing(render_node_lib_candidates) else None,
            "executable": str(render_node_roots[0] / "FusionRenderNode.exe") if render_node_roots and (render_node_roots[0] / "FusionRenderNode.exe").exists() else None
        }
    }


def detect_posix_installations() -> dict[str, Any]:
    if sys.platform == "darwin":
        resolve_root = Path("/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents")
        resolve_lib = resolve_root / "Libraries" / "Fusion" / "fusionscript.so"
        api_root = Path("/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting")
        fusion_candidates = [
            Path("/Applications/Blackmagic Fusion/Fusion.app/Contents/MacOS/fusionscript.so"),
            Path("/Applications/Blackmagic Fusion/Fusion.app/Contents/Libraries/fusionscript.so"),
            resolve_lib
        ]
        render_node_candidates = [resolve_lib]
    else:
        resolve_root = Path("/opt/resolve")
        resolve_lib = resolve_root / "libs" / "Fusion" / "fusionscript.so"
        api_root = resolve_root / "Developer" / "Scripting"
        fusion_candidates = [
            Path("/opt/BlackmagicDesign/Fusion/fusionscript.so"),
            Path("/opt/BlackmagicDesign/Fusion20/fusionscript.so"),
            resolve_lib
        ]
        render_node_candidates = [resolve_lib]

    resolve_candidates = []
    if os.environ.get("PAGECRAN_RESOLVE_SCRIPT_LIB"):
        resolve_candidates.append(Path(os.environ["PAGECRAN_RESOLVE_SCRIPT_LIB"]))
    if os.environ.get("RESOLVE_SCRIPT_LIB"):
        resolve_candidates.append(Path(os.environ["RESOLVE_SCRIPT_LIB"]))
    resolve_candidates.append(resolve_lib)

    if os.environ.get("PAGECRAN_FUSION_SCRIPT_LIB"):
        fusion_candidates.insert(0, Path(os.environ["PAGECRAN_FUSION_SCRIPT_LIB"]))
    if os.environ.get("PAGECRAN_FUSION_RENDER_NODE_SCRIPT_LIB"):
        render_node_candidates.insert(0, Path(os.environ["PAGECRAN_FUSION_RENDER_NODE_SCRIPT_LIB"]))
    render_node_candidates.extend(fusion_candidates)

    return {
        "resolve": {
            "root": str(resolve_root),
            "library_candidates": unique_existing_strings(resolve_candidates),
            "library": str(first_existing(resolve_candidates)) if first_existing(resolve_candidates) else None,
            "developer_api": str(api_root),
            "executable": None
        },
        "fusion": {
            "roots": [],
            "library_candidates": unique_existing_strings(fusion_candidates),
            "library": str(first_existing(fusion_candidates)) if first_existing(fusion_candidates) else None,
            "executable": None
        },
        "render_node": {
            "roots": [],
            "library_candidates": unique_existing_strings(render_node_candidates),
            "library": str(first_existing(render_node_candidates)) if first_existing(render_node_candidates) else None,
            "executable": None
        }
    }


def detect_installations() -> dict[str, Any]:
    return detect_windows_installations() if os.name == "nt" else detect_posix_installations()


def to_jsonable(value: Any, depth: int = 0) -> Any:
    if depth > 4:
        return str(value)

    if value is None or isinstance(value, (str, bool, int, float)):
        return value

    if isinstance(value, (list, tuple, set)):
        return [to_jsonable(item, depth + 1) for item in value]

    if isinstance(value, dict):
        return {str(key): to_jsonable(item, depth + 1) for key, item in value.items()}

    if hasattr(value, "keys"):
        try:
            return {str(key): to_jsonable(value[key], depth + 1) for key in value.keys()}
        except Exception:
            pass

    return str(value)


def safe_call(target: Any, method_name: str, *args: Any) -> Any:
    method = getattr(target, method_name, None)
    if not callable(method):
        return None
    try:
        return method(*args)
    except Exception:
        return None


def get_app_identity(app: Any) -> dict[str, Any]:
    attrs = safe_call(app, "GetAttrs") or {}
    app_info = safe_call(app, "GetAppInfo") or {}
    file_name = attrs.get("FUSIONS_FileName") or app_info.get("FileName")
    full_name = app_info.get("FullName") or app_info.get("Name") or safe_call(app, "GetProductName")
    version_string = safe_call(app, "GetVersionString") or app_info.get("VersionString")
    is_render_node = bool(attrs.get("FUSIONB_IsRenderNode"))

    file_name_text = str(file_name or "")
    full_name_text = str(full_name or "")
    if "FusionRenderNode" in file_name_text or "Render Node" in full_name_text:
        is_render_node = True

    return {
        "attrs": attrs,
        "app_info": app_info,
        "file_name": file_name,
        "full_name": full_name,
        "version_string": version_string,
        "is_render_node": is_render_node
    }


def load_script_module(lib_path: str, module_suffix: str):
    del module_suffix
    sys.modules.pop("fusionscript", None)
    return load_dynamic("fusionscript", lib_path)


def probe_target(kind: str, scriptapp_name: str, libraries: list[str]) -> dict[str, Any]:
    errors: list[str] = []

    for index, lib_path in enumerate(libraries):
        try:
            module = load_script_module(lib_path, f"{kind}_{index}")
            app = module.scriptapp(scriptapp_name)
            if not app:
                errors.append(f"{lib_path}: {scriptapp_name} is not running")
                continue
            identity = get_app_identity(app)
            if kind == "fusion" and identity["is_render_node"]:
                errors.append(f"{lib_path}: Fusion Render Node is running, but this bundle needs Fusion Studio")
                continue
            if kind == "render_node" and not identity["is_render_node"]:
                errors.append(f"{lib_path}: interactive Fusion host found, not Fusion Render Node")
                continue
            return {
                "target": kind,
                "connected": True,
                "library": lib_path,
                "product_name": safe_call(app, "GetProductName") or identity["full_name"] or ("Fusion Studio" if kind in ("fusion", "render_node") else "DaVinci Resolve"),
                "version_string": identity["version_string"],
                "file_name": identity["file_name"],
                "page": safe_call(app, "GetCurrentPage") if kind == "resolve" else "fusion"
            }
        except Exception as error:
            errors.append(f"{lib_path}: {error}")

    return {
        "target": kind,
        "connected": False,
        "errors": errors
    }


def choose_host(preferred: str, allow_render_node: bool = False) -> tuple[str, Any, dict[str, Any]]:
    installs = detect_installations()
    resolve_libraries = installs["resolve"]["library_candidates"]
    fusion_libraries = installs["fusion"]["library_candidates"]
    render_node_libraries = installs["render_node"]["library_candidates"]

    attempts: list[tuple[str, str, list[str]]] = []
    preferred = (preferred or "auto").strip().lower()

    if preferred == "resolve":
        attempts.append(("resolve", "Resolve", resolve_libraries))
    elif preferred == "fusion":
        attempts.append(("fusion", "Fusion", fusion_libraries))
    elif preferred in ("render_node", "fusion_render_node"):
        attempts.append(("render_node", "Fusion", render_node_libraries))
    else:
        attempts.append(("resolve", "Resolve", resolve_libraries))
        attempts.append(("fusion", "Fusion", fusion_libraries))
        if allow_render_node:
            attempts.append(("render_node", "Fusion", render_node_libraries))

    errors: list[str] = []
    for kind, scriptapp_name, libraries in attempts:
        for index, lib_path in enumerate(libraries):
            try:
                module = load_script_module(lib_path, f"active_{kind}_{index}")
                app = module.scriptapp(scriptapp_name)
                identity = get_app_identity(app) if app else None
                if app:
                    if kind == "fusion" and identity and identity["is_render_node"]:
                        errors.append(f"{kind}: Fusion Render Node is running via {lib_path}, but Fusion Studio is required")
                        continue
                    if kind == "render_node" and identity and not identity["is_render_node"]:
                        errors.append(f"{kind}: interactive Fusion host is running via {lib_path}, not Fusion Render Node")
                        continue
                    return kind, app, {
                        "installations": installs,
                        "library": lib_path,
                        "product_name": safe_call(app, "GetProductName") or identity["full_name"] or ("Fusion Studio" if kind in ("fusion", "render_node") else "DaVinci Resolve"),
                        "version_string": identity["version_string"],
                        "file_name": identity["file_name"]
                    }
                errors.append(f"{kind}: {scriptapp_name} is not running via {lib_path}")
            except Exception as error:
                errors.append(f"{kind}: {lib_path}: {error}")

    raise RuntimeError(
        "Could not connect to a live Resolve/Fusion host. " +
        f"Requested host='{preferred}'. Details: {' || '.join(errors)}"
    )


def require_resolve(payload: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    host_kind, app, meta = choose_host(str(payload.get("host") or "resolve"))
    if host_kind != "resolve":
        raise RuntimeError("This method requires DaVinci Resolve Studio. Use host='resolve'.")
    return app, meta


def has_fusion_timeline_scope(payload: dict[str, Any]) -> bool:
    return bool(
        payload.get("clip_id") or
        payload.get("timeline_item_id") or
        isinstance(payload.get("timeline_item"), dict)
    )


def frame_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def safe_timeline_item_id(item: Any) -> str | None:
    value = safe_call(item, "GetUniqueId")
    if value in (None, ""):
        return None
    return str(value)


def safe_timeline_item_name(item: Any) -> str | None:
    value = safe_call(item, "GetName")
    if value is None:
        return None
    return str(value)


def timeline_item_track_info(item: Any) -> tuple[str | None, int | None]:
    values = safe_call(item, "GetTrackTypeAndIndex")
    if not values or len(values) < 2:
        return None, None

    track_type = str(values[0]).lower() if values[0] is not None else None
    try:
        track_index = int(values[1])
    except (TypeError, ValueError):
        track_index = None
    return track_type, track_index


def summarize_timeline_item(item: Any, item_index: int | None = None) -> dict[str, Any] | None:
    if not item:
        return None

    track_type, track_index = timeline_item_track_info(item)
    start = frame_int(safe_call(item, "GetStart"))
    end = frame_int(safe_call(item, "GetEnd"))
    duration = frame_int(safe_call(item, "GetDuration"))
    if duration is None and start is not None and end is not None:
        duration = end - start

    return {
        "timeline_item_id": safe_timeline_item_id(item),
        "name": safe_timeline_item_name(item),
        "track_type": track_type,
        "track_index": track_index,
        "item_index": item_index,
        "start": start,
        "end": end,
        "duration": duration,
        "fusion_comp_count": frame_int(safe_call(item, "GetFusionCompCount"))
    }


def get_current_timeline(resolve_app: Any) -> Any:
    project_manager = safe_call(resolve_app, "GetProjectManager")
    project = safe_call(project_manager, "GetCurrentProject")
    if not project:
        raise RuntimeError("No Resolve project is currently open.")

    timeline = safe_call(project, "GetCurrentTimeline")
    if not timeline:
        raise RuntimeError("No current Resolve timeline is active.")

    return timeline


def find_timeline_item_by_id(timeline: Any, timeline_item_id: Any) -> tuple[Any | None, int | None]:
    if timeline_item_id in (None, ""):
        return None, None

    wanted = str(timeline_item_id)
    for track_type in ("video", "audio", "subtitle"):
        track_count = frame_int(safe_call(timeline, "GetTrackCount", track_type)) or 0
        for track_index in range(1, track_count + 1):
            items = safe_call(timeline, "GetItemListInTrack", track_type, track_index) or []
            for item_index, item in enumerate(items, start=1):
                if safe_timeline_item_id(item) == wanted:
                    return item, item_index

    return None, None


def get_timeline_item_from_query(timeline: Any, payload: dict[str, Any]) -> tuple[Any, int | None]:
    timeline_item_id = payload.get("clip_id") or payload.get("timeline_item_id")
    if timeline_item_id not in (None, ""):
        item, item_index = find_timeline_item_by_id(timeline, timeline_item_id)
        if not item:
            raise RuntimeError(f"No timeline item with clip_id/timeline_item_id={timeline_item_id!r}")
        return item, item_index

    timeline_item = payload.get("timeline_item")
    if not isinstance(timeline_item, dict):
        raise RuntimeError("timeline_item must be an object with track_type, track_index, and item_index")

    track_type = str(timeline_item.get("track_type") or "video").lower()
    if track_type not in ("video", "audio", "subtitle"):
        raise RuntimeError("timeline_item.track_type must be one of: video, audio, subtitle")

    track_index = frame_int(timeline_item.get("track_index"))
    item_index = frame_int(timeline_item.get("item_index"))
    if track_index is None or track_index < 1:
        raise RuntimeError("timeline_item.track_index must be a 1-based integer")
    if item_index is None or item_index < 1:
        raise RuntimeError("timeline_item.item_index must be a 1-based integer")

    items = safe_call(timeline, "GetItemListInTrack", track_type, track_index) or []
    if item_index > len(items):
        raise RuntimeError(
            f"No timeline item at track_type={track_type!r}, track_index={track_index}, item_index={item_index}"
        )

    return items[item_index - 1], item_index


def get_fusion_comp_on_timeline_item(item: Any, payload: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
    comp_count = frame_int(safe_call(item, "GetFusionCompCount")) or 0
    if comp_count < 1:
        raise RuntimeError("Timeline item has no Fusion compositions")

    comp_name = payload.get("comp_name")
    if comp_name not in (None, ""):
        comp = safe_call(item, "GetFusionCompByName", str(comp_name))
        if not comp:
            raise RuntimeError(f"No Fusion comp named {comp_name!r} on this timeline item")
        return comp, {
            "selection": {
                "comp_name": str(comp_name)
            },
            "comp_count": comp_count,
            "comp_names": to_jsonable(safe_call(item, "GetFusionCompNameList") or [])
        }

    comp_index = frame_int(payload.get("comp_index")) or 1
    if comp_index < 1 or comp_index > comp_count:
        raise RuntimeError(f"No Fusion comp at comp_index={comp_index}; item has {comp_count} comp(s)")

    comp = safe_call(item, "GetFusionCompByIndex", comp_index)
    if not comp:
        raise RuntimeError(f"GetFusionCompByIndex({comp_index}) returned no composition")

    return comp, {
        "selection": {
            "comp_index": comp_index
        },
        "comp_count": comp_count,
        "comp_names": to_jsonable(safe_call(item, "GetFusionCompNameList") or [])
    }


def resolve_fusion_scope(payload: dict[str, Any]) -> tuple[str, Any, Any, dict[str, Any], dict[str, Any]]:
    if has_fusion_timeline_scope(payload):
        resolve_app, meta = require_resolve({ **payload, "host": "resolve" })
        timeline = get_current_timeline(resolve_app)
        item, item_index = get_timeline_item_from_query(timeline, payload)
        comp, comp_meta = get_fusion_comp_on_timeline_item(item, payload)
        scope = {
            "type": "timeline_item_fusion_comp",
            "timeline_name": safe_call(timeline, "GetName"),
            "timeline_item": summarize_timeline_item(item, item_index=item_index),
            **comp_meta
        }
        return "resolve", safe_call(resolve_app, "Fusion"), comp, meta, scope

    host_kind, app, meta = choose_host(str(payload.get("host") or "auto"))
    fusion = safe_call(app, "Fusion") if host_kind == "resolve" else app
    comp = safe_call(fusion, "GetCurrentComp") if fusion else None
    if not comp:
        raise RuntimeError(
            "No active Fusion composition. Open a comp in Fusion Studio or the Fusion page inside Resolve, " +
            "or pass clip_id, timeline_item_id, or timeline_item={track_type, track_index, item_index}."
        )
    scope = {
        "type": "active_fusion_comp"
    }
    return host_kind, fusion, comp, meta, scope


def summarize_timeline(timeline: Any) -> dict[str, Any] | None:
    if not timeline:
        return None

    return {
        "name": safe_call(timeline, "GetName"),
        "unique_id": safe_call(timeline, "GetUniqueId"),
        "video_track_count": safe_call(timeline, "GetTrackCount", "video"),
        "audio_track_count": safe_call(timeline, "GetTrackCount", "audio"),
        "subtitle_track_count": safe_call(timeline, "GetTrackCount", "subtitle")
    }


def summarize_project(project: Any) -> dict[str, Any] | None:
    if not project:
        return None

    return {
        "name": safe_call(project, "GetName"),
        "unique_id": safe_call(project, "GetUniqueId"),
        "timeline_count": safe_call(project, "GetTimelineCount"),
        "frame_rate": safe_call(project, "GetSetting", "timelineFrameRate"),
        "resolution_width": safe_call(project, "GetSetting", "timelineResolutionWidth"),
        "resolution_height": safe_call(project, "GetSetting", "timelineResolutionHeight"),
        "current_timeline": summarize_timeline(safe_call(project, "GetCurrentTimeline"))
    }


def tool_summary(tool: Any, include_attrs: bool = False) -> dict[str, Any]:
    attrs = safe_call(tool, "GetAttrs") or {}
    summary = {
        "name": attrs.get("TOOLS_Name", ""),
        "type": attrs.get("TOOLS_RegID", "")
    }
    if include_attrs:
        summary["attrs"] = to_jsonable(attrs)
    return summary


def comp_summary(comp: Any, include_tools: bool = False, include_attrs: bool = False, max_tools: int = 50) -> dict[str, Any]:
    attrs = safe_call(comp, "GetAttrs") or {}
    tool_list = safe_call(comp, "GetToolList") or {}
    summary = {
        "name": attrs.get("COMPS_Name", ""),
        "tool_count": len(tool_list),
        "attrs": to_jsonable(attrs) if include_attrs else None
    }

    if include_tools:
        tools = []
        for key in list(tool_list)[:max_tools]:
            tools.append(tool_summary(tool_list[key], include_attrs=False))
        summary["tools"] = tools

    return summary


def action_runtime_probe(payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    installs = detect_installations()
    resolve_probe = probe_target("resolve", "Resolve", installs["resolve"]["library_candidates"])
    fusion_probe = probe_target("fusion", "Fusion", installs["fusion"]["library_candidates"])
    render_node_probe = probe_target("render_node", "Fusion", installs["render_node"]["library_candidates"])

    return {
        "ok": True,
        "platform": platform.system().lower(),
        "python": {
            "executable": sys.executable,
            "version": sys.version.split()[0],
            "base_prefix": sys.base_prefix or sys.prefix
        },
        "installations": installs,
        "hosts": {
            "resolve": resolve_probe,
            "fusion": fusion_probe,
            "render_node": render_node_probe
        }
    }


def action_ping(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, app, meta = choose_host(str(payload.get("host") or "auto"), allow_render_node=True)
    result = {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "library": meta.get("library")
    }

    if host_kind == "resolve":
        result["current_page"] = safe_call(app, "GetCurrentPage")
        project_manager = safe_call(app, "GetProjectManager")
        result["current_project"] = safe_call(safe_call(project_manager, "GetCurrentProject"), "GetName")
    elif host_kind == "render_node":
        result["current_comp"] = None
        result["mode"] = "render_node"
    else:
        comp = safe_call(app, "GetCurrentComp")
        result["current_comp"] = comp_summary(comp) if comp else None

    return result


def action_get_current_page(payload: dict[str, Any]) -> dict[str, Any]:
    resolve, meta = require_resolve(payload)
    return {
        "ok": True,
        "host": "resolve",
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "current_page": safe_call(resolve, "GetCurrentPage")
    }


def action_list_projects(payload: dict[str, Any]) -> dict[str, Any]:
    resolve, meta = require_resolve(payload)
    project_manager = safe_call(resolve, "GetProjectManager")
    projects = safe_call(project_manager, "GetProjectListInCurrentFolder") or []
    return {
        "ok": True,
        "host": "resolve",
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "current_folder": safe_call(project_manager, "GetCurrentFolder"),
        "count": len(projects),
        "projects": list(projects)
    }


def action_get_project_info(payload: dict[str, Any]) -> dict[str, Any]:
    resolve, meta = require_resolve(payload)
    project_manager = safe_call(resolve, "GetProjectManager")
    project = safe_call(project_manager, "GetCurrentProject")
    if not project:
        raise RuntimeError("No Resolve project is currently open.")

    return {
        "ok": True,
        "host": "resolve",
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "current_page": safe_call(resolve, "GetCurrentPage"),
        "current_folder": safe_call(project_manager, "GetCurrentFolder"),
        "project": summarize_project(project)
    }


def action_list_timelines(payload: dict[str, Any]) -> dict[str, Any]:
    resolve, meta = require_resolve(payload)
    project_manager = safe_call(resolve, "GetProjectManager")
    project = safe_call(project_manager, "GetCurrentProject")
    if not project:
        raise RuntimeError("No Resolve project is currently open.")

    timeline_count = safe_call(project, "GetTimelineCount") or 0
    timelines = []
    for index in range(1, int(timeline_count) + 1):
        timeline = safe_call(project, "GetTimelineByIndex", index)
        if not timeline:
            continue
        timelines.append(summarize_timeline(timeline))

    return {
        "ok": True,
        "host": "resolve",
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "project_name": safe_call(project, "GetName"),
        "current_timeline": safe_call(safe_call(project, "GetCurrentTimeline"), "GetName"),
        "count": len(timelines),
        "timelines": timelines
    }


def action_get_current_comp(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, _fusion, comp, meta, scope = resolve_fusion_scope(payload)
    include_tools = bool(payload.get("include_tools", False))
    include_attrs = bool(payload.get("include_attrs", False))
    max_tools = int(payload.get("max_tools", 50) or 50)
    return {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "scope": scope,
        "composition": comp_summary(comp, include_tools=include_tools, include_attrs=include_attrs, max_tools=max_tools)
    }


def action_list_fusion_tools(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, _fusion, comp, meta, scope = resolve_fusion_scope(payload)
    include_attrs = bool(payload.get("include_attrs", False))
    max_tools = int(payload.get("max_tools", 100) or 100)
    filter_type = payload.get("filter_type")

    if filter_type:
        tool_list = safe_call(comp, "GetToolList", False, filter_type) or {}
    else:
        tool_list = safe_call(comp, "GetToolList") or {}

    tools = []
    for key in list(tool_list)[:max_tools]:
        tools.append(tool_summary(tool_list[key], include_attrs=include_attrs))

    return {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "scope": scope,
        "composition": comp_summary(comp),
        "count": len(tool_list),
        "tools": tools
    }


def action_probe_fusion_tool(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, _fusion, comp, meta, scope = resolve_fusion_scope(payload)
    tool_name = str(payload.get("tool_name") or "").strip()
    if not tool_name:
        raise RuntimeError("tool_name is required")

    tool = comp.FindTool(tool_name)
    if not tool:
        return {
            "ok": True,
            "host": host_kind,
            "product_name": meta.get("product_name"),
            "version_string": meta.get("version_string"),
            "scope": scope,
            "found": False,
            "tool_name": tool_name
        }

    return {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "scope": scope,
        "found": True,
        "tool": tool_summary(tool, include_attrs=bool(payload.get("include_attrs", True)))
    }


def action_add_fusion_tool(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, _fusion, comp, meta, scope = resolve_fusion_scope(payload)
    tool_type = str(payload.get("tool_type") or "").strip()
    if not tool_type:
        raise RuntimeError("tool_type is required")

    x = int(payload.get("x", -1) or -1)
    y = int(payload.get("y", -1) or -1)
    requested_name = str(payload.get("name") or "").strip()

    comp.Lock()
    try:
        tool = comp.AddTool(tool_type, x, y)
        if not tool:
            raise RuntimeError(f"Failed to add Fusion tool '{tool_type}'.")
        if requested_name:
            tool.SetAttrs({"TOOLS_Name": requested_name})
    finally:
        comp.Unlock()

    return {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "scope": scope,
        "composition": comp_summary(comp),
        "tool": tool_summary(tool, include_attrs=bool(payload.get("include_attrs", True)))
    }


def action_set_fusion_inputs(payload: dict[str, Any]) -> dict[str, Any]:
    host_kind, _fusion, comp, meta, scope = resolve_fusion_scope(payload)
    tool_name = str(payload.get("tool_name") or "").strip()
    inputs = payload.get("inputs")
    if not tool_name:
        raise RuntimeError("tool_name is required")
    if not isinstance(inputs, dict) or not inputs:
        raise RuntimeError("inputs must be a non-empty object")

    tool = comp.FindTool(tool_name)
    if not tool:
        raise RuntimeError(f"Tool '{tool_name}' was not found in the current comp.")

    results: dict[str, Any] = {}
    readback = bool(payload.get("readback", True))
    use_time = "time" in payload

    comp.Lock()
    try:
        for input_name, value in inputs.items():
            try:
                if use_time:
                    tool.SetInput(input_name, value, payload["time"])
                else:
                    tool.SetInput(input_name, value)

                row: dict[str, Any] = {"success": True}
                if readback:
                    try:
                        current_value = tool.GetInput(input_name, payload["time"]) if use_time else tool.GetInput(input_name)
                        row["value"] = to_jsonable(current_value)
                    except Exception as error:
                        row["readback_error"] = str(error)
                results[str(input_name)] = row
            except Exception as error:
                results[str(input_name)] = {
                    "success": False,
                    "error": str(error)
                }
    finally:
        comp.Unlock()

    return {
        "ok": True,
        "host": host_kind,
        "product_name": meta.get("product_name"),
        "version_string": meta.get("version_string"),
        "scope": scope,
        "tool_name": tool_name,
        "success": all(result.get("success") for result in results.values()),
        "results": results
    }


ACTION_HANDLERS = {
    "runtime_probe": action_runtime_probe,
    "ping": action_ping,
    "get_current_page": action_get_current_page,
    "list_projects": action_list_projects,
    "get_project_info": action_get_project_info,
    "list_timelines": action_list_timelines,
    "get_current_comp": action_get_current_comp,
    "list_fusion_tools": action_list_fusion_tools,
    "probe_fusion_tool": action_probe_fusion_tool,
    "add_fusion_tool": action_add_fusion_tool,
    "set_fusion_inputs": action_set_fusion_inputs
}


def run_action(action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    handler = ACTION_HANDLERS.get(action)
    if handler is None:
        raise RuntimeError(f"Unknown Resolve host action: {action}")
    return handler(payload or {})


def decode_payload(raw: str | None) -> dict[str, Any]:
    if raw is None or raw == "":
        return {}
    decoded = json.loads(base64.b64decode(raw).decode("utf8"))
    if not isinstance(decoded, dict):
        raise RuntimeError("Host payload must decode to a JSON object.")
    return decoded


def main(argv: list[str] | None = None) -> int:
    args = argv or sys.argv[1:]
    if not args:
        print("Usage: pagecran_resolve_host.py <action> [payload-base64]", file=sys.stderr)
        return 1

    action = args[0]
    try:
        payload = decode_payload(args[1] if len(args) > 1 else None)
        result = run_action(action, payload)
        print(json.dumps(result, separators=(",", ":"), default=to_jsonable))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
