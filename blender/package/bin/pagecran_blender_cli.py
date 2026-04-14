#!/usr/bin/env python3
"""Global CLI for talking to the Pagecran Blender bridge."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import uuid
from typing import Any


DEFAULT_HOST = (
    os.getenv("PAGECRAN_BRIDGE_HOST")
    or os.getenv("PAGECRAN_BLENDER_HOST")
    or os.getenv("BLENDER_HOST")
    or "localhost"
)
DEFAULT_PORT = int(
    os.getenv("PAGECRAN_BRIDGE_PORT")
    or os.getenv("PAGECRAN_BLENDER_PORT")
    or os.getenv("BLENDER_PORT")
    or "9876"
)
DEFAULT_TIMEOUT_SECONDS = 30.0


def normalize_response(response: dict[str, Any]) -> dict[str, Any]:
    if response.get("type") == "event":
        return {"status": "event", "event": response}

    if response.get("type") != "result":
        return response

    normalized = {
        "id": response.get("id"),
    }
    if response.get("error"):
        normalized.update(
            {
                "status": "error",
                "message": response.get("error"),
                "error_code": response.get("error_code", "request_error"),
            }
        )
    else:
        normalized.update(
            {
                "status": "success",
                "result": response.get("result"),
            }
        )
    return normalized


def add_endpoint_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--host", help=f"Blender bridge host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, help=f"Blender bridge port (default: {DEFAULT_PORT})")
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Socket timeout in seconds",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pagecran Blender bridge CLI")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    send_parser = subparsers.add_parser("send", help="Send a Blender bridge command")
    send_parser.add_argument("command", help="Remote command name")
    send_parser.add_argument("--params-json", default="{}", help="Inline JSON object for command params")
    send_parser.add_argument("--params-file", help="Path to a JSON file containing command params")
    add_endpoint_args(send_parser)

    ping_parser = subparsers.add_parser("ping", help="Send a ping command")
    add_endpoint_args(ping_parser)

    caps_parser = subparsers.add_parser("capabilities", help="Ask the bridge for capabilities")
    add_endpoint_args(caps_parser)

    endpoint_parser = subparsers.add_parser("endpoint", help="Print the resolved Blender bridge endpoint")
    endpoint_parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")

    return parser.parse_args()


def load_params(args: argparse.Namespace) -> dict[str, Any]:
    if args.params_file:
        with open(args.params_file, "r", encoding="utf-8") as handle:
            params = json.load(handle)
    else:
        params = json.loads(args.params_json)

    if not isinstance(params, dict):
        raise ValueError("Command params must decode to a JSON object")

    return params


def send_request(host: str, port: int, payload: dict[str, Any], timeout_seconds: float) -> dict[str, Any]:
    with socket.create_connection((host, port), timeout=timeout_seconds) as sock:
        sock.settimeout(timeout_seconds)
        sock.sendall((json.dumps(payload) + "\n").encode("utf-8"))

        buffer = ""
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buffer += chunk.decode("utf-8")

            while True:
                newline_index = buffer.find("\n")
                if newline_index != -1:
                    raw_response = buffer[:newline_index].strip()
                    buffer = buffer[newline_index + 1 :]
                    if not raw_response:
                        continue
                    normalized = normalize_response(json.loads(raw_response))
                    if normalized.get("status") == "event":
                        continue
                    return normalized

                try:
                    response = json.loads(buffer)
                except json.JSONDecodeError:
                    break

                normalized = normalize_response(response)
                if normalized.get("status") == "event":
                    buffer = ""
                    continue
                return normalized

    raise RuntimeError("No JSON response received from Blender bridge")


def resolve_host(host: str | None) -> str:
    return host or DEFAULT_HOST


def resolve_port(port: int | None) -> int:
    return DEFAULT_PORT if port is None else port


def unique_endpoints(endpoints: list[tuple[str, int]]) -> list[tuple[str, int]]:
    seen: set[tuple[str, int]] = set()
    result: list[tuple[str, int]] = []

    for endpoint in endpoints:
        if endpoint in seen:
            continue
        seen.add(endpoint)
        result.append(endpoint)

    return result


def is_retryable_connection_error(exc: Exception) -> bool:
    return isinstance(exc, OSError) or str(exc) == "No JSON response received from Blender bridge"


def send_request_with_fallback(
    host: str | None,
    port: int | None,
    payload: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    explicit_endpoint = (resolve_host(host), resolve_port(port))
    default_endpoint = (DEFAULT_HOST, DEFAULT_PORT)
    attempted_endpoints = unique_endpoints([explicit_endpoint, default_endpoint])
    errors: list[str] = []

    for endpoint_host, endpoint_port in attempted_endpoints:
        try:
            return send_request(
                host=endpoint_host,
                port=endpoint_port,
                payload=payload,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:
            if not is_retryable_connection_error(exc):
                raise
            errors.append(f"{endpoint_host}:{endpoint_port} ({exc})")

    raise RuntimeError("Unable to reach Blender bridge on attempted endpoints: " + "; ".join(errors))


def dump_response(response: dict[str, Any], pretty: bool) -> None:
    if pretty:
        print(json.dumps(response, indent=2, sort_keys=True))
    else:
        print(json.dumps(response, separators=(",", ":")))


def main() -> int:
    args = parse_args()

    try:
        if args.subcommand == "send":
            response = send_request_with_fallback(
                host=args.host,
                port=args.port,
                timeout_seconds=args.timeout_seconds,
                payload={
                    "type": "request",
                    "id": str(uuid.uuid4()),
                    "method": args.command,
                    "params": load_params(args),
                },
            )
            dump_response(response, args.pretty)
            return 0 if response.get("status") != "error" else 2

        if args.subcommand == "ping":
            response = send_request_with_fallback(
                host=args.host,
                port=args.port,
                timeout_seconds=args.timeout_seconds,
                payload={
                    "type": "request",
                    "id": str(uuid.uuid4()),
                    "method": "ping",
                    "params": {},
                },
            )
            dump_response(response, args.pretty)
            return 0 if response.get("status") != "error" else 2

        if args.subcommand == "capabilities":
            response = send_request_with_fallback(
                host=args.host,
                port=args.port,
                timeout_seconds=args.timeout_seconds,
                payload={
                    "type": "request",
                    "id": str(uuid.uuid4()),
                    "method": "get_capabilities",
                    "params": {},
                },
            )
            dump_response(response, args.pretty)
            return 0 if response.get("status") != "error" else 2

        if args.subcommand == "endpoint":
            dump_response(
                {
                    "status": "success",
                    "result": {
                        "host": DEFAULT_HOST,
                        "port": DEFAULT_PORT,
                    },
                },
                args.pretty,
            )
            return 0

        raise RuntimeError(f"Unsupported subcommand: {args.subcommand}")
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
