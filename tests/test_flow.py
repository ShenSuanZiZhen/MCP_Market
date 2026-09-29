from fastapi.testclient import TestClient

from app.main import create_app


def authed_client(tmp_path):
    client = TestClient(create_app(tmp_path))
    res = client.post(
        "/api/auth/register",
        json={"email": "admin@example.com", "password": "secret123", "display_name": "Admin"},
    )
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "admin"
    return client


def test_markdown_to_mcp_service_flow(tmp_path):
    client = authed_client(tmp_path)

    upload = client.post(
        "/api/documents",
        files=[
            ("files", ("product.md", "# 产品说明\n\n智能路由支持按发布版本加载工具。\n", "text/markdown")),
            ("files", ("faq.md", "# FAQ\n\nMVP 不训练模型，只提供知识访问。\n", "text/markdown")),
        ],
    )
    assert upload.status_code == 200
    docs = upload.json()
    assert len(docs) == 2

    kb = client.post(
        "/api/knowledge-bases",
        json={"name": "产品知识库", "description": "", "document_ids": [doc["id"] for doc in docs]},
    )
    assert kb.status_code == 200
    kb_id = kb.json()["id"]

    built = client.post(f"/api/knowledge-bases/{kb_id}/build")
    assert built.status_code == 200
    revision_id = built.json()["knowledge_base_revision_id"]

    search = client.post(f"/api/knowledge-bases/{kb_id}/search", json={"query": "智能路由", "top_k": 5})
    assert search.status_code == 200
    assert search.json()["results"][0]["document_id"] == docs[0]["id"]

    service = client.post(
        "/api/services",
        json={"name": "产品文档服务", "description": "", "knowledge_base_revision_id": revision_id},
    )
    assert service.status_code == 200
    service_id = service.json()["id"]

    publish = client.post(f"/api/services/{service_id}/publish")
    assert publish.status_code == 200
    assert publish.json()["service_revision_id"]

    key = client.post(f"/api/services/{service_id}/keys", json={"expires_in_days": 30})
    assert key.status_code == 200
    api_key = key.json()["api_key"]

    discover = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"},
        json={"jsonrpc": "2.0", "id": "1", "method": "server/discover", "params": {}},
    )
    assert discover.status_code == 200
    assert "tools" in discover.json()["result"]["capabilities"]

    bracketed_auth = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer <{api_key}>", "MCP-Protocol-Version": "2026-07-28"},
        json={"jsonrpc": "2.0", "id": "bracketed", "method": "tools/list", "params": {}},
    )
    assert bracketed_auth.status_code == 200
    assert bracketed_auth.json()["result"]["tools"]

    initialize = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"},
        json={"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"clientInfo": {"name": "local-llm"}}},
    )
    assert initialize.status_code == 200
    assert initialize.json()["result"]["protocolVersion"] == "2026-07-28"

    connection = client.get(f"/api/services/{service_id}/connection")
    assert connection.status_code == 200
    assert connection.json()["stdio_bridge"]["env"]["MCP_BUILDER_SERVICE_ID"] == service_id

    tool_call = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"},
        json={
            "jsonrpc": "2.0",
            "id": "2",
            "method": "tools/call",
            "params": {"name": "search_knowledge", "arguments": {"query": "智能路由", "top_k": 5}},
        },
    )
    assert tool_call.status_code == 200
    result = tool_call.json()["result"]["structuredContent"]
    assert result["results"][0]["file_name"] == "product.md"

    blocked_doc_delete = client.delete(f"/api/documents/{docs[0]['id']}")
    assert blocked_doc_delete.status_code == 409
    assert "产品知识库" in blocked_doc_delete.json()["detail"]
    assert client.delete(f"/api/knowledge-bases/{kb_id}").status_code == 409

    pause = client.post(f"/api/services/{service_id}/pause")
    assert pause.status_code == 200
    paused_call = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"},
        json={"jsonrpc": "2.0", "id": "paused", "method": "tools/list", "params": {}},
    )
    assert paused_call.status_code == 503
    assert paused_call.json()["error"]["message"] == "服务已暂停"
    assert client.delete(f"/api/documents/{docs[0]['id']}").status_code == 200
    assert client.delete(f"/api/knowledge-bases/{kb_id}").status_code == 200

    deleted = client.delete(f"/api/services/{service_id}")
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"
    assert client.get(f"/api/services/{service_id}").status_code == 404
    retained_docs = client.get("/api/documents").json()["documents"]
    assert {doc["id"] for doc in retained_docs} == {docs[1]["id"]}
    deleted_call = client.post(
        f"/mcp/{service_id}",
        headers={"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"},
        json={"jsonrpc": "2.0", "id": "after-delete", "method": "tools/list", "params": {}},
    )
    assert deleted_call.status_code == 401


def test_service_multiselect_capability_config(tmp_path):
    client = authed_client(tmp_path)

    docs = client.post(
        "/api/documents",
        files=[
            ("files", ("product.md", "# 产品\n\n智能路由在产品资料中。\n", "text/markdown")),
            ("files", ("internal.md", "# 内部\n\nShadow Plan 在内部资料中。\n", "text/markdown")),
        ],
    ).json()
    kb = client.post(
        "/api/knowledge-bases",
        json={"name": "范围测试", "description": "", "document_ids": [doc["id"] for doc in docs]},
    ).json()
    revision_id = client.post(f"/api/knowledge-bases/{kb['id']}/build").json()["knowledge_base_revision_id"]
    service_id = client.post(
        "/api/services",
        json={"name": "多选服务", "description": "", "knowledge_base_revision_id": revision_id},
    ).json()["id"]

    patch = client.patch(
        f"/api/services/{service_id}",
        json={
            "tools": [
                {"template": "search_knowledge", "name": "search_docs", "description": "Search only.", "enabled": True},
                {"template": "search_knowledge", "name": "find_evidence", "description": "Find evidence.", "enabled": True},
                {"template": "get_document", "name": "get_document", "description": "Disabled.", "enabled": False},
                {"template": "list_documents", "name": "list_documents", "description": "Disabled.", "enabled": False},
            ],
            "resources": {"catalog_enabled": False, "document_ids": [docs[0]["id"]]},
            "prompts": [
                {
                    "template": "answer_from_knowledge",
                    "name": "ask_docs",
                    "description": "Ask selected docs.",
                    "enabled": True,
                    "template_text": "请调用 {{search_tool_name}} 回答：{{question}}",
                    "arguments": {"question": {"description": "问题", "required": True, "default": ""}},
                },
                {
                    "template": "summarize_document",
                    "name": "summarize_document",
                    "description": "Disabled.",
                    "enabled": False,
                    "template_text": "总结 {{document_id}}",
                    "arguments": {"document_id": {"description": "文档 ID", "required": True, "default": ""}},
                },
            ],
        },
    )
    assert patch.status_code == 200
    assert client.post(f"/api/services/{service_id}/publish").status_code == 200
    api_key = client.post(f"/api/services/{service_id}/keys", json={"expires_in_days": 30}).json()["api_key"]
    headers = {"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"}

    tools = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}},
    ).json()["result"]["tools"]
    assert [tool["name"] for tool in tools] == ["search_docs", "find_evidence"]

    disabled_call = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "bad", "method": "tools/call", "params": {"name": "get_document", "arguments": {"document_id": docs[0]["id"]}}},
    )
    assert disabled_call.json()["error"]["code"] == 404

    resources = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "resources", "method": "resources/list", "params": {}},
    ).json()["result"]["resources"]
    assert resources
    assert all(docs[0]["id"] in item["uri"] for item in resources)
    assert all("catalog" not in item["uri"] for item in resources)

    prompts = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "prompts", "method": "prompts/list", "params": {}},
    ).json()["result"]["prompts"]
    assert [prompt["name"] for prompt in prompts] == ["ask_docs"]


def test_advanced_contract_templates(tmp_path):
    client = authed_client(tmp_path)

    docs = client.post(
        "/api/documents",
        files=[("files", ("product.md", "# 产品\n\n智能路由支持高级 MCP 契约。\n", "text/markdown"))],
    ).json()
    kb = client.post(
        "/api/knowledge-bases",
        json={"name": "高级契约", "description": "", "document_ids": [docs[0]["id"]]},
    ).json()
    revision_id = client.post(f"/api/knowledge-bases/{kb['id']}/build").json()["knowledge_base_revision_id"]
    service_id = client.post(
        "/api/services",
        json={"name": "高级契约服务", "description": "", "knowledge_base_revision_id": revision_id},
    ).json()["id"]

    patch = client.patch(
        f"/api/services/{service_id}",
        json={
            "tools": [
                {
                    "template": "start_search_task",
                    "name": "start_search_task",
                    "description": "Start async search.",
                    "enabled": True,
                    "execution_mode": "asynchronous",
                    "interaction_depth": "task_polling",
                    "annotations": {"longRunningHint": True, "structuredOutput": True},
                },
                {
                    "template": "get_task_status",
                    "name": "get_task_status",
                    "description": "Poll task.",
                    "enabled": True,
                    "execution_mode": "synchronous",
                    "interaction_depth": "task_polling",
                },
                {
                    "template": "batch_search",
                    "name": "batch_search",
                    "description": "Programmatic search.",
                    "enabled": True,
                    "execution_mode": "programmatic",
                    "interaction_depth": "multi_step",
                },
            ],
            "resources": {
                "catalog_enabled": True,
                "uri_templates_enabled": True,
                "as_tools_enabled": True,
                "document_ids": [docs[0]["id"]],
            },
            "prompts": [
                {
                    "template": "multi_message_analyst",
                    "name": "analyst_brief",
                    "description": "Multi message prompt.",
                    "enabled": True,
                    "template_text": "请分析 {{topic}}",
                    "arguments": {"topic": {"description": "主题", "required": True, "default": ""}},
                    "depends_on": ["batch_search"],
                    "messages": [
                        {"role": "user", "text": "请分析 {{topic}}"},
                        {"role": "assistant", "text": "我会先列证据，再给结论。"},
                    ],
                }
            ],
        },
    )
    assert patch.status_code == 200, patch.text
    draft_test = client.post(
        f"/api/services/{service_id}/draft-test",
        json={"method": "tools/list", "params": {}},
    )
    assert draft_test.status_code == 200
    assert any(tool["name"] == "start_search_task" for tool in draft_test.json()["result"]["tools"])
    assert client.post(f"/api/services/{service_id}/publish").status_code == 200
    api_key = client.post(f"/api/services/{service_id}/keys", json={"expires_in_days": 30}).json()["api_key"]
    headers = {"Authorization": f"Bearer {api_key}", "MCP-Protocol-Version": "2026-07-28"}

    tools = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "tools", "method": "tools/list", "params": {}},
    ).json()["result"]["tools"]
    tool_names = [tool["name"] for tool in tools]
    assert "start_search_task" in tool_names
    assert "list_mcp_resources" in tool_names
    async_tool = next(tool for tool in tools if tool["name"] == "start_search_task")
    assert async_tool["executionMode"] == "asynchronous"
    assert async_tool["annotations"]["longRunningHint"] is True
    assert "outputSchema" in async_tool

    task = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": "task",
            "method": "tools/call",
            "params": {"name": "start_search_task", "arguments": {"query": "智能路由", "top_k": 1}},
        },
    ).json()["result"]["structuredContent"]
    assert task["job_id"]
    status = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": "status",
            "method": "tools/call",
            "params": {"name": "get_task_status", "arguments": {"job_id": task["job_id"]}},
        },
    ).json()["result"]["structuredContent"]
    assert status["status"] == "succeeded"

    templates = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={"jsonrpc": "2.0", "id": "templates", "method": "resources/templates/list", "params": {}},
    ).json()["result"]["resourceTemplates"]
    assert templates and "{document_id}" in templates[0]["uriTemplate"]

    prompt = client.post(
        f"/mcp/{service_id}",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": "prompt",
            "method": "prompts/get",
            "params": {"name": "analyst_brief", "arguments": {"topic": "智能路由"}},
        },
    ).json()["result"]
    assert len(prompt["messages"]) == 2


def test_auth_and_role_permissions(tmp_path):
    client = TestClient(create_app(tmp_path))
    assert client.get("/api/documents").status_code == 401

    admin = client.post(
        "/api/auth/register",
        json={"email": "admin@example.com", "password": "secret123", "display_name": "Admin"},
    )
    assert admin.status_code == 200
    assert admin.json()["user"]["role"] == "admin"

    seller = client.post(
        "/api/auth/register",
        json={"email": "viewer@example.com", "password": "secret123", "display_name": "Viewer"},
    )
    assert seller.status_code == 200
    viewer_id = seller.json()["user"]["id"]

    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "secret123"})
    users = client.get("/api/users")
    assert users.status_code == 200
    assert len(users.json()["users"]) == 2
    role_patch = client.patch(f"/api/users/{viewer_id}", json={"role": "viewer"})
    assert role_patch.status_code == 200

    client.post("/api/auth/login", json={"email": "viewer@example.com", "password": "secret123"})
    assert client.get("/api/documents").status_code == 200
    upload = client.post(
        "/api/documents",
        files=[("files", ("readonly.md", "# readonly\n", "text/markdown"))],
    )
    assert upload.status_code == 403
