# 客户端接入指南：EchoBridge-stdio

## 文档目的

本文用于验证真实 MCP 调用、Streamable HTTP 接入、本地 stdio 桥接脚本和客户端方法兼容性。本文的核心专有词是 `EchoBridge-stdio`。检索该词应命中本文，并可用于证明英文、连字符和大小写混合词的检索能力。

## HTTP 接入

发布服务并创建 API Key 后，客户端应向稳定地址发送 POST 请求：

```text
http://127.0.0.1:8000/mcp/{service_id}
```

请求体使用 JSON-RPC 风格结构：

```json
{
  "jsonrpc": "2.0",
  "id": "search-1",
  "method": "tools/call",
  "params": {
    "name": "search_knowledge",
    "arguments": {
      "query": "EchoBridge-stdio",
      "top_k": 5
    }
  }
}
```

`MCP-Protocol-Version` 必须是 `2026-07-28`。如果传入其他版本，例如 `2025-01-01`，服务应返回错误，说明不支持该协议版本。`Mcp-Method` 请求头如果同时出现，必须与请求体中的 `method` 一致，否则应返回方法不一致错误。

## stdio 桥接

`EchoBridge-stdio` 是测试中对项目内置 `scripts/mcp_stdio_bridge.py` 的称呼。某些本地模型客户端只支持 stdio MCP，此时可使用桥接脚本把标准输入输出消息转发到 HTTP `/mcp/{service_id}` 端点。

桥接脚本依赖三个环境变量：

```text
MCP_BUILDER_BASE_URL=http://127.0.0.1:8000
MCP_BUILDER_SERVICE_ID=<service_id>
MCP_BUILDER_API_KEY=<api_key>
```

如果缺少 `MCP_BUILDER_SERVICE_ID`，桥接脚本应返回 JSON-RPC 错误，消息包含 `Missing MCP_BUILDER_SERVICE_ID`。如果缺少 `MCP_BUILDER_API_KEY`，错误消息应包含 `Missing MCP_BUILDER_API_KEY`。

## 客户端调用顺序

推荐客户端按以下顺序执行：

1. `initialize`：确认协议版本、服务器名称和能力集合。
2. `tools/list`：获取工具名称、输入结构、输出结构和只读注解。
3. `resources/list`：如果客户端支持 Resources，读取目录和片段 URI。
4. `prompts/list`：如果客户端支持 Prompts，显示可选模板。
5. `tools/call`：根据任务调用搜索、读取、批量搜索或异步任务。
6. `prompts/get`：按用户选择渲染 Prompt 消息。

## 兼容性说明

当客户端不支持 Resources 但支持 Tools 时，可以开启 Resources-as-Tools 兼容模式。开启后 `tools/list` 应额外出现 `list_mcp_resources` 和 `read_mcp_resource` 两个工具。前者返回资源列表，后者按 URI 读取资源内容。它们的返回结构应与 `resources/list` 和 `resources/read` 保持一致。

## 验收关键词

| 关键词 | 预期用途 | 预期命中文档 |
| --- | --- | --- |
| EchoBridge-stdio | 验证 stdio 桥接说明 | 本文 |
| MCP_BUILDER_SERVICE_ID | 验证桥接环境变量 | 本文 |
| 2026-07-28 | 验证协议版本 | 本文 |
| list_mcp_resources | 验证 Resources-as-Tools | 本文 |

