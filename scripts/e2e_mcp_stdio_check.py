#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx


REPO_ROOT = Path(__file__).resolve().parents[1]
BRIDGE = REPO_ROOT / "scripts" / "mcp_stdio_bridge.py"


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_health(base_url: str, process: subprocess.Popen[bytes]) -> None:
    deadline = time.time() + 15
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"uvicorn exited early with code {process.returncode}")
        try:
            with httpx.Client(timeout=1) as client:
                if client.get(f"{base_url}/health").status_code == 200:
                    return
        except httpx.HTTPError:
            time.sleep(0.2)
    raise TimeoutError("server did not become healthy")


def content_length_frame(message: dict[str, Any]) -> bytes:
    payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii") + payload


def parse_bridge_output(output: bytes) -> dict[str, Any]:
    if output.startswith(b"Content-Length:"):
        _, payload = output.split(b"\r\n\r\n", 1)
        return json.loads(payload.decode("utf-8"))
    lines = [line for line in output.decode("utf-8").splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("bridge returned no output")
    return json.loads(lines[-1])


def run_bridge(message: dict[str, Any], env: dict[str, str], framed: bool = False) -> dict[str, Any]:
    payload = content_length_frame(message) if framed else (json.dumps(message, ensure_ascii=False) + "\n").encode("utf-8")
    result = subprocess.run(
        [sys.executable, str(BRIDGE)],
        input=payload,
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=15,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace") or result.stdout.decode("utf-8", errors="replace"))
    return parse_bridge_output(result.stdout)


def create_published_service(base_url: str) -> tuple[str, str]:
    content = (
        "# 本地模型命中文档\n\n"
        "雨林协议支持本地 MCP 客户端通过 search_knowledge 命中 Markdown 文档。\n"
        "这句话用于端到端自检，不依赖外部网络。\n"
    )
    with httpx.Client(base_url=base_url, timeout=10) as client:
        register = client.post(
            "/api/auth/register",
            json={"email": "stdio-check@example.com", "password": "secret123", "display_name": "Stdio Check"},
        )
        register.raise_for_status()

        upload = client.post(
            "/api/documents",
            files=[("files", ("local-model-hit.md", content.encode("utf-8"), "text/markdown"))],
        )
        upload.raise_for_status()
        document_id = upload.json()[0]["id"]

        kb = client.post(
            "/api/knowledge-bases",
            json={"name": "本地模型自检知识库", "description": "stdio bridge e2e", "document_ids": [document_id]},
        )
        kb.raise_for_status()

        built = client.post(f"/api/knowledge-bases/{kb.json()['id']}/build")
        built.raise_for_status()
        revision_id = built.json()["knowledge_base_revision_id"]

        service = client.post(
            "/api/services",
            json={"name": "本地模型自检 MCP", "description": "验证 stdio bridge 命中文档", "knowledge_base_revision_id": revision_id},
        )
        service.raise_for_status()
        service_id = service.json()["id"]

        publish = client.post(f"/api/services/{service_id}/publish")
        publish.raise_for_status()

        key = client.post(f"/api/services/{service_id}/keys", json={"expires_in_days": 1})
        key.raise_for_status()
        return service_id, key.json()["api_key"]


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="mcp-builder-e2e-") as data_dir:
        port = free_port()
        base_url = f"http://127.0.0.1:{port}"
        env = {**os.environ, "MCP_BUILDER_DATA_DIR": data_dir}
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--log-level",
                "warning",
            ],
            cwd=REPO_ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            wait_for_health(base_url, server)
            service_id, api_key = create_published_service(base_url)
            bridge_env = {
                **os.environ,
                "MCP_BUILDER_BASE_URL": base_url,
                "MCP_BUILDER_SERVICE_ID": service_id,
                "MCP_BUILDER_API_KEY": api_key,
            }

            init = run_bridge(
                {"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"clientInfo": {"name": "self-check"}}},
                bridge_env,
                framed=True,
            )
            if "result" not in init or "tools" not in init["result"].get("capabilities", {}):
                raise RuntimeError(f"initialize did not expose tools capability: {init}")

            search = run_bridge(
                {
                    "jsonrpc": "2.0",
                    "id": "search",
                    "method": "tools/call",
                    "params": {"name": "search_knowledge", "arguments": {"query": "雨林协议", "top_k": 3}},
                },
                bridge_env,
            )
            results = search.get("result", {}).get("structuredContent", {}).get("results", [])
            if not results or results[0].get("file_name") != "local-model-hit.md":
                raise RuntimeError(f"search_knowledge did not hit the uploaded document: {search}")

            print(f"PASS stdio bridge hit {results[0]['file_name']} via service {service_id}")
            return 0
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
