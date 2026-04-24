# ##### BEGIN GPL LICENSE BLOCK #####
#
#  This program is free software; you can redistribute it and/or
#  modify it under the terms of the GNU General Public License
#  as published by the Free Software Foundation; either version 2
#  of the License, or (at your option) any later version.
#
# ##### END GPL LICENSE BLOCK #####

"""OpenCode Blender Bridge - minimal socket bridge for Blender."""

import bpy
import io
import json
import socket
import threading
import time
import traceback
from contextlib import redirect_stdout

from bpy.props import IntProperty

BRIDGE_NAME = "OpenCode Blender Bridge"
BRIDGE_LOG_PREFIX = "[OpenCodeBlenderBridge]"
PROTOCOL_NAME = "opencode-blender-bridge"
PROTOCOL_VERSION = "2.0"
ADDON_VERSION = "0.3.0"
EVENT_POLL_INTERVAL_SECONDS = 0.35
RESULT_MARKER = "__OPENCODE_BLENDER_RESULT__"

_EVENT_NAMES = {
    "selection_changed",
    "active_object_changed",
    "mode_changed",
    "frame_changed",
    "scene_overview_changed",
    "command_executed",
    "command_failed",
}

_bridge_event_state = None
_bridge_instance = None


def _addon_module_name():
    return __package__ or __name__


def emit_bridge_event(name, data=None):
    if _bridge_instance and _bridge_instance.running:
        _bridge_instance.emit_event(name, data=data)


def _count_local_assets():
    asset_count = 0
    collections = (
        bpy.data.objects,
        bpy.data.materials,
        bpy.data.collections,
        bpy.data.node_groups,
        bpy.data.worlds,
    )
    for collection in collections:
        for data_block in collection:
            if getattr(data_block, "asset_data", None):
                asset_count += 1
    return asset_count


def _capture_bridge_event_state():
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    active_object = view_layer.objects.active.name if view_layer and view_layer.objects.active else None
    selected_objects = sorted(obj.name for obj in bpy.context.selected_objects)
    geometry_tree_count = sum(1 for tree in bpy.data.node_groups if tree.bl_idname == "GeometryNodeTree")
    shader_group_count = sum(1 for tree in bpy.data.node_groups if tree.bl_idname == "ShaderNodeTree")

    return {
        "scene_name": scene.name,
        "active_object": active_object,
        "selected_objects": selected_objects,
        "mode": bpy.context.mode,
        "frame_current": scene.frame_current,
        "object_count": len(scene.objects),
        "camera": scene.camera.name if scene.camera else None,
        "materials_count": len(bpy.data.materials),
        "geometry_tree_count": geometry_tree_count,
        "shader_group_count": shader_group_count,
        "asset_count": _count_local_assets(),
    }


def _poll_bridge_events():
    global _bridge_event_state

    try:
        current_state = _capture_bridge_event_state()
    except Exception:
        return EVENT_POLL_INTERVAL_SECONDS

    previous_state = _bridge_event_state
    if previous_state is None:
        _bridge_event_state = current_state
        return EVENT_POLL_INTERVAL_SECONDS

    if previous_state["selected_objects"] != current_state["selected_objects"]:
        emit_bridge_event(
            "selection_changed",
            {
                "active_object": current_state["active_object"],
                "selected_objects": current_state["selected_objects"],
            },
        )

    if previous_state["active_object"] != current_state["active_object"]:
        emit_bridge_event(
            "active_object_changed",
            {
                "active_object": current_state["active_object"],
                "previous_active_object": previous_state["active_object"],
            },
        )

    if previous_state["mode"] != current_state["mode"]:
        emit_bridge_event(
            "mode_changed",
            {
                "mode": current_state["mode"],
                "previous_mode": previous_state["mode"],
                "active_object": current_state["active_object"],
            },
        )

    if previous_state["frame_current"] != current_state["frame_current"]:
        emit_bridge_event(
            "frame_changed",
            {
                "frame_current": current_state["frame_current"],
                "previous_frame": previous_state["frame_current"],
            },
        )

    overview_keys = (
        "scene_name",
        "object_count",
        "camera",
        "materials_count",
        "geometry_tree_count",
        "shader_group_count",
        "asset_count",
    )
    if any(previous_state[key] != current_state[key] for key in overview_keys):
        emit_bridge_event("scene_overview_changed", {key: current_state[key] for key in overview_keys})

    _bridge_event_state = current_state
    return EVENT_POLL_INTERVAL_SECONDS


class OpenCodeBlenderBridgeServer:
    def __init__(self, host="localhost", port=9876):
        self.host = host
        self.port = port
        self.running = False
        self.socket = None
        self.server_thread = None
        self._clients = set()
        self._clients_lock = threading.Lock()

    class ClientConnection:
        def __init__(self, sock, address):
            self.socket = sock
            self.address = address
            self._send_lock = threading.Lock()

        def send_json(self, payload):
            data = (json.dumps(payload) + "\n").encode("utf-8")
            with self._send_lock:
                self.socket.sendall(data)

        def close(self):
            try:
                self.socket.close()
            except Exception:
                pass

    def _register_client(self, client_connection):
        with self._clients_lock:
            self._clients.add(client_connection)

    def _unregister_client(self, client_connection):
        with self._clients_lock:
            self._clients.discard(client_connection)

    def _close_all_clients(self):
        with self._clients_lock:
            clients = list(self._clients)
            self._clients.clear()

        for client_connection in clients:
            client_connection.close()

    def emit_event(self, name, data=None):
        event = {
            "type": "event",
            "name": name,
            "data": data or {},
            "ts": int(time.time() * 1000),
        }

        with self._clients_lock:
            clients = list(self._clients)

        stale_clients = []
        for client_connection in clients:
            try:
                client_connection.send_json(event)
            except Exception:
                stale_clients.append(client_connection)

        for client_connection in stale_clients:
            self._unregister_client(client_connection)
            client_connection.close()

    def start(self):
        if self.running:
            print(f"{BRIDGE_LOG_PREFIX} Server already running")
            return

        self.running = True
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.host, self.port))
            self.socket.listen(5)

            self.server_thread = threading.Thread(target=self._server_loop, name="OpenCodeBlenderBridgeServer")
            self.server_thread.daemon = True
            self.server_thread.start()

            print(f"{BRIDGE_LOG_PREFIX} Server started on {self.host}:{self.port}")
        except Exception as exc:
            print(f"{BRIDGE_LOG_PREFIX} Failed to start: {exc}")
            self.stop()

    def stop(self):
        self.running = False
        self._close_all_clients()
        if self.socket:
            try:
                self.socket.close()
            except Exception:
                pass
            self.socket = None
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=1.0)
        self.server_thread = None
        print(f"{BRIDGE_LOG_PREFIX} Server stopped")

    def _server_loop(self):
        if self.socket is None:
            return

        bridge_socket = self.socket
        bridge_socket.settimeout(1.0)
        while self.running:
            try:
                client, address = bridge_socket.accept()
                print(f"{BRIDGE_LOG_PREFIX} Client connected: {address}")
                thread = threading.Thread(
                    target=self._handle_client,
                    args=(client, address),
                    name="OpenCodeBlenderBridgeClient",
                )
                thread.daemon = True
                thread.start()
            except socket.timeout:
                continue
            except Exception as exc:
                if self.running:
                    print(f"{BRIDGE_LOG_PREFIX} Accept error: {exc}")

    def _handle_client(self, client, address):
        client.settimeout(None)
        client_connection = self.ClientConnection(client, address)
        self._register_client(client_connection)

        def schedule_command(command):
            def execute_wrapper():
                try:
                    response = self._execute(command)
                    client_connection.send_json(response)
                except Exception as exc:
                    traceback.print_exc()
                    try:
                        response = self._error_response(
                            request_id=command.get("id"),
                            message=str(exc),
                            error_code="execution_error",
                            legacy_response=command.get("type") != "request",
                        )
                        client_connection.send_json(response)
                    except Exception:
                        pass
                return None

            bpy.app.timers.register(execute_wrapper, first_interval=0.0)

        buffer = ""
        try:
            while self.running:
                data = client.recv(65536)
                if not data:
                    break
                buffer += data.decode("utf-8")

                while True:
                    newline_index = buffer.find("\n")
                    if newline_index != -1:
                        raw_message = buffer[:newline_index].strip()
                        buffer = buffer[newline_index + 1 :]
                        if not raw_message:
                            continue
                        schedule_command(json.loads(raw_message))
                        continue

                    try:
                        command = json.loads(buffer)
                    except json.JSONDecodeError:
                        break

                    buffer = ""
                    schedule_command(command)
        except Exception as exc:
            print(f"{BRIDGE_LOG_PREFIX} Client error: {exc}")
        finally:
            self._unregister_client(client_connection)
            client_connection.close()

    def _base_response(self, request_id, status):
        response = {
            "status": status,
            "protocol": {
                "name": PROTOCOL_NAME,
                "version": PROTOCOL_VERSION,
            },
        }
        if request_id is not None:
            response["id"] = request_id
        return response

    def _success_response(self, request_id, result, legacy_response=True):
        if not legacy_response:
            return {
                "type": "result",
                "id": request_id,
                "result": result,
            }
        response = self._base_response(request_id, "success")
        response["result"] = result
        return response

    def _error_response(self, request_id, message, error_code, legacy_response=True):
        if not legacy_response:
            return {
                "type": "result",
                "id": request_id,
                "error": message,
                "error_code": error_code,
            }
        response = self._base_response(request_id, "error")
        response["message"] = message
        response["error_code"] = error_code
        return response

    def _list_commands(self):
        return ["execute_code", "get_capabilities", "list_commands", "ping"]

    def _get_capabilities(self):
        return {
            "server_name": BRIDGE_NAME,
            "addon_version": ADDON_VERSION,
            "protocol_name": PROTOCOL_NAME,
            "protocol_version": PROTOCOL_VERSION,
            "commands": self._list_commands(),
            "runtime_modules": [],
            "result_marker": RESULT_MARKER,
            "capabilities": {
                "request_ids": True,
                "jsonl_transport": True,
                "persistent_connections": True,
                "structured_errors": True,
                "screenshots": True,
                "arbitrary_code": True,
                "events": True,
                "bundle_runtime": True,
            },
            "events": sorted(_EVENT_NAMES),
        }

    def _execute(self, command):
        request_id = command.get("id")
        command_type = command.get("type")
        legacy_response = command_type != "request"
        if command_type == "request":
            command_type = command.get("method")
        params = command.get("params", {})

        if not isinstance(command_type, str) or not command_type:
            return self._error_response(
                request_id,
                "Command type is required",
                "invalid_command",
                legacy_response=legacy_response,
            )

        if not isinstance(params, dict):
            return self._error_response(
                request_id,
                "Command params must be a JSON object",
                "invalid_params",
                legacy_response=legacy_response,
            )

        if command_type == "ping":
            return self._success_response(
                request_id,
                {
                    "pong": True,
                    "server_name": BRIDGE_NAME,
                    "addon_version": ADDON_VERSION,
                    "protocol_name": PROTOCOL_NAME,
                    "protocol_version": PROTOCOL_VERSION,
                },
                legacy_response=legacy_response,
            )

        if command_type == "list_commands":
            commands = self._list_commands()
            return self._success_response(
                request_id,
                {"commands": commands, "count": len(commands)},
                legacy_response=legacy_response,
            )

        if command_type == "get_capabilities":
            return self._success_response(request_id, self._get_capabilities(), legacy_response=legacy_response)

        if command_type == "execute_code":
            return self._execute_code(request_id, params.get("code", ""), legacy_response=legacy_response)

        return self._error_response(
            request_id,
            f"Unknown command: {command_type}",
            "unknown_command",
            legacy_response=legacy_response,
        )

    def _execute_code(self, request_id, code, legacy_response=True):
        try:
            namespace = {
                "bpy": bpy,
                "json": json,
                "emit_bridge_event": emit_bridge_event,
                "bridge_info": {
                    "name": BRIDGE_NAME,
                    "addon_version": ADDON_VERSION,
                    "protocol_name": PROTOCOL_NAME,
                    "protocol_version": PROTOCOL_VERSION,
                    "result_marker": RESULT_MARKER,
                },
            }
            capture = io.StringIO()
            with redirect_stdout(capture):
                exec(code, namespace)
            emit_bridge_event("command_executed", {"request_id": request_id, "method": "execute_code"})
            return self._success_response(
                request_id,
                {
                    "executed": True,
                    "result": capture.getvalue(),
                },
                legacy_response=legacy_response,
            )
        except Exception as exc:
            emit_bridge_event(
                "command_failed",
                {
                    "request_id": request_id,
                    "method": "execute_code",
                    "message": str(exc),
                },
            )
            return self._error_response(
                request_id,
                f"Code execution error: {exc}",
                "execute_code_error",
                legacy_response=legacy_response,
            )


class OpenCodeBlenderBridgePreferences(bpy.types.AddonPreferences):
    bl_idname = _addon_module_name()

    bridge_port = IntProperty(
        name="Port",
        description="TCP port used by the OpenCode Blender Bridge socket server",
        default=9876,
        min=1024,
        max=65535,
    )

    def draw(self, context):
        del context
        layout = self.layout
        layout.prop(self, "bridge_port")
        layout.label(text="The bridge starts automatically when the extension is enabled.", icon="INFO")


def get_bridge_preferences(context=None):
    context = context or bpy.context
    addon = context.preferences.addons.get(_addon_module_name())
    return addon.preferences if addon else None


def is_bridge_running():
    return bool(_bridge_instance and _bridge_instance.running)


def start_bridge(port=None):
    global _bridge_instance, _bridge_event_state

    resolved_port = int(port or 9876)
    if is_bridge_running():
        if _bridge_instance is not None and _bridge_instance.port == resolved_port:
            return True
        stop_bridge()

    _bridge_event_state = _capture_bridge_event_state()
    _bridge_instance = OpenCodeBlenderBridgeServer(port=resolved_port)
    _bridge_instance.start()
    return is_bridge_running()


def start_bridge_from_preferences():
    preferences = get_bridge_preferences()
    port = preferences.bridge_port if preferences else 9876
    return start_bridge(port=port)


def stop_bridge():
    global _bridge_instance
    if _bridge_instance:
        _bridge_instance.stop()
        _bridge_instance = None


def toggle_bridge():
    if is_bridge_running():
        stop_bridge()
        return False
    return start_bridge_from_preferences()


def _auto_start_bridge():
    start_bridge_from_preferences()
    return None


_classes = (
    OpenCodeBlenderBridgePreferences,
)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    if not bpy.app.timers.is_registered(_poll_bridge_events):
        bpy.app.timers.register(_poll_bridge_events, first_interval=EVENT_POLL_INTERVAL_SECONDS)
    bpy.app.timers.register(_auto_start_bridge, first_interval=0.0)


def unregister():
    if bpy.app.timers.is_registered(_poll_bridge_events):
        bpy.app.timers.unregister(_poll_bridge_events)
    stop_bridge()
    for cls in reversed(_classes):
        bpy.utils.unregister_class(cls)
