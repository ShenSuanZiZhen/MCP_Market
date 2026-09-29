# MCP Knowledge Builder MVP

基于 `mcp_builder_mvp_prd.md` 实现的本地 MVP：上传 Markdown 文件，构建知识库版本，配置并发布只读 MCP 风格知识服务。

## 快速启动

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm install
npm run build:frontend
.venv/bin/uvicorn app.main:app --reload --port 8000
```

打开工作台：

```text
http://127.0.0.1:8000
```

可直接上传 `samples/` 下的 Markdown 文件走通流程。

## 已实现能力

- Markdown 上传、UTF-8/扩展名/大小/空文件校验、内容哈希去重。
- 知识库草稿、版本构建、Markdown 切片、中文 n-gram 与英文关键词全文检索。
- 服务草稿、Tools/Resources/Prompts 配置、发布为冻结服务版本。
- 用户登录注册与会话鉴权；首个注册用户自动成为管理员。
- 角色权限管理：`admin` 可管理用户，`seller` 可管理文档/知识库/服务，`viewer` 仅可查看与测试。
- 高级 MCP 契约模板：
  - Tools 支持同步、异步任务、任务轮询、批量编排、Elicitation 请求和结构化输出 Schema。
  - Tools 列表会暴露执行模式、交互深度和行为注解，例如 `longRunningHint`、`requiresSecrets`、`structuredOutput`。
  - Resources 支持可枚举目录、URI 模板和 Resources-as-Tools 兼容转换。
  - Prompts 支持参数化模板、补全建议元数据和多消息结构。
- 服务级 Bearer API Key、暂停/恢复、基础调用日志。
- `/mcp/{service_id}` 单端点运行时，支持：
  - `initialize`
  - `server/discover`
  - `tools/list`
  - `tools/call`
  - `resources/list`
  - `resources/read`
  - `resources/templates/list`
  - `prompts/list`
  - `prompts/get`

## 测试

```bash
npm run check:frontend
.venv/bin/python -m pytest -q
```

验证本地 MCP 客户端 stdio 接入与文档命中：

```bash
.venv/bin/python scripts/e2e_mcp_stdio_check.py
```

## 前端开发

前端源码在 `frontend/src/main.ts`，编译产物输出到 `static/main.js`，页面外壳与样式仍由 FastAPI 从 `static/` 提供：

```bash
npm run build:frontend
```

## MCP 调用示例

发布服务并创建密钥后：

```bash
curl -X POST "http://127.0.0.1:8000/mcp/<service_id>" \
  -H "Authorization: Bearer <api_key>" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "search_knowledge",
      "arguments": {"query": "智能路由", "top_k": 5}
    }
  }'
```

本地大模型客户端如果只支持 stdio MCP，可以使用项目内置桥接脚本。先在页面发布服务并创建 API Key，然后把下面配置中的三个值替换为实际值：

```json
{
  "mcpServers": {
    "local-docs": {
      "command": "/Users/memo/MCP_Market/.venv/bin/python",
      "args": ["/Users/memo/MCP_Market/scripts/mcp_stdio_bridge.py"],
      "env": {
        "MCP_BUILDER_BASE_URL": "http://127.0.0.1:8000",
        "MCP_BUILDER_SERVICE_ID": "<service_id>",
        "MCP_BUILDER_API_KEY": "<api_key>"
      }
    }
  }
}
```

也可以直接用命令行快速验证桥接脚本：

```bash
printf '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}\n' \
  | MCP_BUILDER_BASE_URL=http://127.0.0.1:8000 \
    MCP_BUILDER_SERVICE_ID=<service_id> \
    MCP_BUILDER_API_KEY=<api_key> \
    .venv/bin/python scripts/mcp_stdio_bridge.py
```

## 数据位置

默认运行数据写入 `data/`：

- `data/mcp_builder.sqlite3`
- `data/documents/*.md`

测试会使用临时目录，不污染默认数据。
