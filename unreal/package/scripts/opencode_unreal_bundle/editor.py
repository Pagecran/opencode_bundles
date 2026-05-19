# pyright: reportAttributeAccessIssue=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false

import base64
import ctypes
import os
import struct
import tempfile
import time

import unreal  # type: ignore


DEFAULT_VIEWPORT_SCREENSHOT_SIZE = 1280
MAX_VIEWPORT_SCREENSHOT_SIZE = 4096
VIEWPORT_SCREENSHOT_TIMEOUT_SECONDS = 10.0
WINDOW_CAPTURE_TIMEOUT_SECONDS = 1.0

if os.name == "nt":
    user32 = ctypes.windll.user32
    gdi32 = ctypes.windll.gdi32

    SRCCOPY = 0x00CC0020
    PW_RENDERFULLCONTENT = 0x00000002
    DIB_RGB_COLORS = 0
    BI_RGB = 0
    HALFTONE = 4

    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", ctypes.c_long),
            ("top", ctypes.c_long),
            ("right", ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]


    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", ctypes.c_uint32),
            ("biWidth", ctypes.c_long),
            ("biHeight", ctypes.c_long),
            ("biPlanes", ctypes.c_ushort),
            ("biBitCount", ctypes.c_ushort),
            ("biCompression", ctypes.c_uint32),
            ("biSizeImage", ctypes.c_uint32),
            ("biXPelsPerMeter", ctypes.c_long),
            ("biYPelsPerMeter", ctypes.c_long),
            ("biClrUsed", ctypes.c_uint32),
            ("biClrImportant", ctypes.c_uint32),
        ]


    class BITMAPINFO(ctypes.Structure):
        _fields_ = [
            ("bmiHeader", BITMAPINFOHEADER),
            ("bmiColors", ctypes.c_uint32 * 3),
        ]


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


def ensure_windows_capture_available():
    if os.name != "nt":
        raise RuntimeError("Editor window screenshots are currently implemented only on Windows workstations")


def get_window_text(hwnd):
    length = user32.GetWindowTextLengthW(hwnd)
    if length <= 0:
        return ""
    buffer = ctypes.create_unicode_buffer(length + 1)
    user32.GetWindowTextW(hwnd, buffer, len(buffer))
    return buffer.value


def get_window_class_name(hwnd):
    buffer = ctypes.create_unicode_buffer(256)
    if user32.GetClassNameW(hwnd, buffer, len(buffer)) == 0:
        return ""
    return buffer.value


def get_window_rect(hwnd):
    rect = RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        raise RuntimeError(f"Could not read window bounds for hwnd={int(hwnd)}")
    return rect


def get_current_process_id():
    return int(os.getpid())


def enumerate_editor_windows(include_hidden=False):
    ensure_windows_capture_available()

    current_pid = get_current_process_id()
    foreground = user32.GetForegroundWindow()
    windows = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def enum_proc(hwnd, _lparam):
        process_id = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(process_id))
        if int(process_id.value) != current_pid:
            return True

        is_visible = bool(user32.IsWindowVisible(hwnd))
        title = get_window_text(hwnd)
        if (not include_hidden and not is_visible) or not title.strip():
            return True

        rect = get_window_rect(hwnd)
        width = rect.right - rect.left
        height = rect.bottom - rect.top
        if width <= 0 or height <= 0:
            return True

        windows.append({
            "hwnd": int(hwnd),
            "title": title,
            "class_name": get_window_class_name(hwnd),
            "is_visible": is_visible,
            "is_foreground": int(hwnd) == int(foreground),
            "width": width,
            "height": height,
            "left": rect.left,
            "top": rect.top,
            "right": rect.right,
            "bottom": rect.bottom,
        })
        return True

    user32.EnumWindows(enum_proc, 0)
    windows.sort(key=lambda item: (not item["is_foreground"], item["title"].lower()))
    return windows


def filter_editor_windows(windows, window_title_contains=None):
    if not window_title_contains:
        return windows

    needle = str(window_title_contains).strip().lower()
    if not needle:
        return windows

    filtered = [window for window in windows if needle in window["title"].lower()]
    return filtered


def list_editor_windows_result(window_title_contains=None, include_hidden=False):
    windows = filter_editor_windows(
        enumerate_editor_windows(include_hidden=bool(include_hidden)),
        window_title_contains=window_title_contains,
    )
    return {
        "ok": True,
        "count": len(windows),
        "windows": windows,
    }


def choose_editor_window(window_title_contains=None, include_hidden=False):
    windows = filter_editor_windows(
        enumerate_editor_windows(include_hidden=bool(include_hidden)),
        window_title_contains=window_title_contains,
    )
    if not windows:
        if window_title_contains:
            raise RuntimeError(f"No Unreal editor window matched '{window_title_contains}'")
        raise RuntimeError("No visible Unreal editor window was found for the current process")
    return windows[0]


def compute_scaled_dimensions(width: int, height: int, max_size):
    requested = resolve_viewport_screenshot_size(max_size)
    longest = max(width, height)
    if longest <= requested:
        return width, height, requested

    scale = float(requested) / float(longest)
    return max(1, int(round(width * scale))), max(1, int(round(height * scale))), requested


def bitmap_to_bmp_bytes(hdc_mem, hbitmap, width: int, height: int):
    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = width
    bmi.bmiHeader.biHeight = -height
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = BI_RGB
    pixel_bytes = width * height * 4
    buffer = (ctypes.c_ubyte * pixel_bytes)()

    rows = gdi32.GetDIBits(
        hdc_mem,
        hbitmap,
        0,
        height,
        ctypes.byref(buffer),
        ctypes.byref(bmi),
        DIB_RGB_COLORS,
    )
    if rows == 0:
        raise RuntimeError("GetDIBits failed while reading the editor window capture")

    file_header = struct.pack("<2sIHHI", b"BM", 14 + 40 + pixel_bytes, 0, 0, 14 + 40)
    info_header = struct.pack(
        "<IIIHHIIIIII",
        40,
        width,
        height,
        1,
        32,
        BI_RGB,
        pixel_bytes,
        0,
        0,
        0,
        0,
    )
    return file_header + info_header + bytes(buffer)


def capture_editor_window(hwnd: int, target_width: int, target_height: int):
    ensure_windows_capture_available()

    rect = get_window_rect(hwnd)
    source_width = rect.right - rect.left
    source_height = rect.bottom - rect.top
    if source_width <= 0 or source_height <= 0:
        raise RuntimeError(f"Editor window hwnd={hwnd} has invalid bounds")

    hdc_window = user32.GetWindowDC(hwnd)
    if not hdc_window:
        raise RuntimeError(f"GetWindowDC failed for hwnd={hwnd}")

    hdc_mem = gdi32.CreateCompatibleDC(hdc_window)
    if not hdc_mem:
        user32.ReleaseDC(hwnd, hdc_window)
        raise RuntimeError(f"CreateCompatibleDC failed for hwnd={hwnd}")

    hbitmap = gdi32.CreateCompatibleBitmap(hdc_window, target_width, target_height)
    if not hbitmap:
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(hwnd, hdc_window)
        raise RuntimeError(f"CreateCompatibleBitmap failed for hwnd={hwnd}")

    previous_object = gdi32.SelectObject(hdc_mem, hbitmap)
    capture_method = None
    try:
        if target_width != source_width or target_height != source_height:
            gdi32.SetStretchBltMode(hdc_mem, HALFTONE)

        printed = bool(user32.PrintWindow(hwnd, hdc_mem, PW_RENDERFULLCONTENT))
        if printed:
            capture_method = "user32.PrintWindow"
        else:
            copied = bool(gdi32.StretchBlt(hdc_mem, 0, 0, target_width, target_height, hdc_window, 0, 0, source_width, source_height, SRCCOPY))
            if not copied:
                raise RuntimeError(f"Both PrintWindow and StretchBlt failed for hwnd={hwnd}")
            capture_method = "gdi32.StretchBlt"

        image_bytes = bitmap_to_bmp_bytes(hdc_mem, hbitmap, target_width, target_height)
        return image_bytes, capture_method
    finally:
        gdi32.SelectObject(hdc_mem, previous_object)
        gdi32.DeleteObject(hbitmap)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(hwnd, hdc_window)


def editor_window_screenshot_result(max_size=None, window_title_contains=None, include_hidden=False):
    target = choose_editor_window(window_title_contains=window_title_contains, include_hidden=include_hidden)
    target_width, target_height, requested_size = compute_scaled_dimensions(target["width"], target["height"], max_size)
    image_bytes, capture_method = capture_editor_window(target["hwnd"], target_width, target_height)

    return {
        "ok": True,
        "capture_method": capture_method,
        "requested_max_size": requested_size,
        "format": "bmp",
        "width": target_width,
        "height": target_height,
        "byte_length": len(image_bytes),
        "window": target,
        "image_base64": base64.b64encode(image_bytes).decode("ascii"),
    }
