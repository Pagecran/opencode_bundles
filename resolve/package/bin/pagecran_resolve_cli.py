#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


def get_host_script_path() -> Path:
    return Path(__file__).resolve().parent.parent / "scripts" / "pagecran_resolve_host.py"


def run_host_action(action: str, payload: dict[str, Any]) -> Any:
    script_path = get_host_script_path()
    encoded_payload = base64.b64encode(json.dumps(payload).encode("utf8")).decode("ascii")
    env = dict(os.environ)
    env.setdefault("PYTHONHOME", sys.base_prefix or sys.prefix)
    completed = subprocess.run(
        [sys.executable, str(script_path), action, encoded_payload],
        capture_output=True,
        text=True,
        env=env,
        check=False
    )

    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or f"Host action failed with exit code {completed.returncode}"
        raise RuntimeError(message)

    output = completed.stdout.strip()
    if not output:
        raise RuntimeError("Host action returned no JSON output.")

    return json.loads(output)


def print_json(value: Any, pretty: bool):
    if pretty:
        print(json.dumps(value, indent=2, sort_keys=True))
        return

    print(json.dumps(value, separators=(",", ":"), sort_keys=True))


def build_parser():
    parser = argparse.ArgumentParser(description="Pagecran Resolve/Fusion bundle CLI")
    parser.add_argument("command", choices=["status", "ping", "call"])
    parser.add_argument("action", nargs="?", help="Host action for the 'call' command")
    parser.add_argument("--host", default="auto", help="Target host: auto, resolve, or fusion")
    parser.add_argument("--payload-json", default="{}", help="JSON object payload for the 'call' command")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.command == "status":
            result = run_host_action("runtime_probe", {})
            print_json(result, args.pretty)
            return 0

        if args.command == "ping":
            result = run_host_action("ping", {"host": args.host})
            print_json(result, args.pretty)
            return 0

        if not args.action:
            raise ValueError("The 'call' command requires an action name.")

        payload = json.loads(args.payload_json)
        if not isinstance(payload, dict):
            raise ValueError("--payload-json must decode to a JSON object.")

        result = run_host_action(args.action, payload)
        print_json(result, args.pretty)
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
