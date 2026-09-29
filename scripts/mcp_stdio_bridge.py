#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, BinaryIO, Iterator, Literal


BASE_URL = os.environ.get("MCP_BUILDER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
SERVICE_ID = os.environ.get("MCP_BUILDER_SERVICE_ID", "")
API_KEY = os.environ.get("MCP_BUILDER_API_KEY", "")
PROTOCOL_VERSION = os.environ.get("MCP_BUILDER_PROTOCOL_VERSION", "2026-07-28")
FrameMode = Literal["line", "content-length"]


def json_response(message_id: Any, result: Any = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
    response: dict[str, Any] = {"jsonrpc": "2.0", "id": message_id}
    if error is not None:
        response["error"] = error
    else:
        response["result"] = result if result is not None else {}
    return response


def iter_messages(stream: BinaryIO) -> Iterator[tuple[FrameMode, dict[str, Any]]]:
    while True:
        line = stream.readline()
        if not line:
            return
        if not line.strip():
            continue
        if line.lower().startswith(b"content-length:"):
            header = line
            content_length: int | None = None
            while header.strip():
                if header.lower().startswith(b"content-length:"):
                    content_length = int(header.split(b":", 1)[1].strip())
                header = stream.readline()
                if not header:
                    return
            if content_length is None:
                raise ValueError("Missing Content-Length header")
            payload = stream.read(content_length)
            yield "content-length", json.loads(payload.decode("utf-8"))
        else:
            yield "line", json.loads(line.decode("utf-8"))


def write_message(mode: FrameMode, message: dict[str, Any]) -> None:
    payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if mode == "content-length":
        sys.stdout.buffer.write(f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii"))
        sys.stdout.buffer.write(payload)
    else:
        sys.stdout.buffer.write(payload + b"\n")
    sys.stdout.buffer.flush()


def call_http_mcp(message: dict[str, Any]) -> dict[str, Any]:
    if not SERVICE_ID:
        return json_response(
            message.get("id"),
            error={"code": -32001, "message": "Missing MCP_BUILDER_SERVICE_ID"},
        )
    if not API_KEY:
        return json_response(
            message.get("id"),
            error={"code": -32001, "message": "Missing MCP_BUILDER_API_KEY"},
        )

    body = json.dumps(message, ensure_ascii=False).encode("utf-8")
    method = str(message.get("method") or "")
    request = urllib.request.Request(
        f"{BASE_URL}/mcp/{SERVICE_ID}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "MCP-Protocol-Version": PROTOCOL_VERSION,
            "Mcp-Method": method,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return json_response(
            message.get("id"),
            error={"code": exc.code, "message": detail or exc.reason},
        )
    except Exception as exc:
        return json_response(
            message.get("id"),
            error={"code": -32000, "message": str(exc)},
        )


def handle_message(message: dict[str, Any]) -> dict[str, Any] | None:
    method = str(message.get("method") or "")
    if method.startswith("notifications/") or "id" not in message:
        return None
    if method == "ping":
        return json_response(message.get("id"), {})
    return call_http_mcp(message)


def main() -> int:
    try:
        for mode, message in iter_messages(sys.stdin.buffer):
            response = handle_message(message)
            if response is not None:
                write_message(mode, response)
    except Exception as exc:
        error = json_response(None, error={"code": -32700, "message": str(exc)})
        write_message("line", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
