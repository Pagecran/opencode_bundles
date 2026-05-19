# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import base64
import os
import tempfile
import time

import unreal  # type: ignore


DEFAULT_VIEWPORT_SCREENSHOT_SIZE = 1280
MAX_VIEWPORT_SCREENSHOT_SIZE = 4096
VIEWPORT_SCREENSHOT_TIMEOUT_SECONDS = 10.0


def _normalize_path(value: str) -> str:
    candidate = value.strip().replace("\\", "/")
    if not candidate:
        raise ValueError("path must be a non-empty Unreal asset path")
    if not candidate.startswith(("/Game", "/Engine")):
        raise ValueError("path must start with /Game or /Engine")
    return candidate


def normalize_map_path(value: str) -> str:
    candidate = _normalize_path(value)
    slash_index = candidate.rfind("/")
    dot_index = candidate.rfind(".")
    if dot_index > slash_index:
        candidate = candidate[:dot_index]
    return candidate


def normalize_object_path(value: str) -> str:
    candidate = _normalize_path(value)
    slash_index = candidate.rfind("/")
    dot_index = candidate.rfind(".")
    if dot_index > slash_index:
        return candidate
    asset_name = candidate[slash_index + 1 :]
    return f"{candidate}.{asset_name}"


def world_summary(world, requested_path: str):
    package_name = None
    try:
        outer = world.get_outermost()
        package_name = outer.get_name() if outer else None
    except Exception:
        package_name = None

    return {
        "ok": True,
        "requested_level_path": requested_path,
        "level_path": normalize_map_path(requested_path),
        "world_name": world.get_name(),
        "map_name": world.get_name(),
        "package_name": package_name,
        "world_path": world.get_path_name(),
    }


def sequence_summary(sequence, requested_path: str, opened: bool):
    return {
        "ok": bool(opened),
        "requested_sequence_path": requested_path,
        "sequence_path": normalize_object_path(requested_path),
        "asset_name": sequence.get_name(),
        "asset_path": sequence.get_path_name(),
        "opened": bool(opened),
    }


def get_editor_world():
    editor_level_library = getattr(unreal, "EditorLevelLibrary", None)
    if editor_level_library and hasattr(editor_level_library, "get_editor_world"):
        world = editor_level_library.get_editor_world()
        if world:
            return world

    subsystem_class = getattr(unreal, "UnrealEditorSubsystem", None)
    get_editor_subsystem = getattr(unreal, "get_editor_subsystem", None)
    if subsystem_class and callable(get_editor_subsystem):
        subsystem = get_editor_subsystem(subsystem_class)
        if subsystem and hasattr(subsystem, "get_editor_world"):
            world = subsystem.get_editor_world()
            if world:
                return world

    raise RuntimeError("Could not resolve the active Unreal editor world")


def resolve_viewport_screenshot_size(value):
    if value is None:
        return DEFAULT_VIEWPORT_SCREENSHOT_SIZE

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError("max_size must be a positive integer")

    if parsed <= 0:
        raise ValueError("max_size must be a positive integer")

    return min(parsed, MAX_VIEWPORT_SCREENSHOT_SIZE)


def build_viewport_screenshot_path():
    filename = f"opencode_unreal_viewport_{os.getpid()}_{int(time.time() * 1000)}.png"
    return os.path.join(tempfile.gettempdir(), filename).replace("\\", "/")


def wait_for_written_file(path: str, timeout_seconds: float):
    deadline = time.time() + timeout_seconds
    previous_size = -1
    stable_polls = 0

    while time.time() < deadline:
        if os.path.exists(path):
            current_size = os.path.getsize(path)
            if current_size > 0:
                if current_size == previous_size:
                    stable_polls += 1
                else:
                    stable_polls = 0
                previous_size = current_size
                if stable_polls >= 2:
                    return
        time.sleep(0.2)

    if os.path.exists(path) and os.path.getsize(path) > 0:
        return

    raise RuntimeError(f"Viewport screenshot was not written to '{path}' within {timeout_seconds:.1f}s")


def execute_console_command(world, command: str):
    system_library = getattr(unreal, "SystemLibrary", None)
    if not system_library or not hasattr(system_library, "execute_console_command"):
        raise RuntimeError("Unreal Python does not expose SystemLibrary.execute_console_command")

    attempts = [
        lambda: system_library.execute_console_command(world, command),
        lambda: system_library.execute_console_command(world, command, None),
    ]

    last_error = None
    for attempt in attempts:
        try:
            return attempt()
        except Exception as error:
            last_error = error

    raise RuntimeError(f"Failed to execute viewport screenshot command '{command}': {last_error}")


def try_automation_screenshot(path: str, max_size: int):
    class_names = ["AutomationLibrary", "AutomationBlueprintFunctionLibrary"]
    for class_name in class_names:
        automation_class = getattr(unreal, class_name, None)
        method = getattr(automation_class, "take_high_res_screenshot", None) if automation_class else None
        if not callable(method):
            continue

        try:
            method(max_size, max_size, path)
            return class_name + ".take_high_res_screenshot"
        except Exception:
            continue

    return None


def capture_viewport_screenshot(max_size: int):
    output_path = build_viewport_screenshot_path()
    if os.path.exists(output_path):
        try:
            os.remove(output_path)
        except OSError:
            pass

    automation_method = try_automation_screenshot(output_path, max_size)
    if automation_method:
        wait_for_written_file(output_path, VIEWPORT_SCREENSHOT_TIMEOUT_SECONDS)
        return output_path, automation_method

    world = get_editor_world()
    commands = [
        f'HighResShot filename="{output_path}" {max_size}x{max_size}',
        f'HighResShot {max_size}x{max_size} filename="{output_path}"',
        f'HighResShot filename="{output_path}"',
    ]

    last_error = None
    for command in commands:
        try:
            execute_console_command(world, command)
            wait_for_written_file(output_path, VIEWPORT_SCREENSHOT_TIMEOUT_SECONDS)
            return output_path, command
        except Exception as error:
            last_error = error

    raise RuntimeError(f"Failed to capture viewport screenshot: {last_error}")


def read_png_dimensions(data: bytes):
    if len(data) < 24:
        return None, None
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None, None
    width = int.from_bytes(data[16:20], byteorder="big")
    height = int.from_bytes(data[20:24], byteorder="big")
    return width, height


def viewport_screenshot_result(max_size=None):
    resolved_size = resolve_viewport_screenshot_size(max_size)
    screenshot_path, capture_method = capture_viewport_screenshot(resolved_size)

    try:
        with open(screenshot_path, "rb") as handle:
            image_bytes = handle.read()
    finally:
        try:
            os.remove(screenshot_path)
        except OSError:
            pass

    width, height = read_png_dimensions(image_bytes)
    return {
        "ok": True,
        "capture_method": capture_method,
        "requested_max_size": resolved_size,
        "format": "png",
        "width": width,
        "height": height,
        "byte_length": len(image_bytes),
        "image_base64": base64.b64encode(image_bytes).decode("ascii"),
    }
