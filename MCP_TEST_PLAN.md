# MCP Knowledge Builder 测试知识库与 MCP 能力测试方案

## 1. 测试资料设计

本方案基于 `USER_MANUAL.md` 和 `PRODUCT_DESCRIPTION.md`，并新增 `test_knowledge_docs/` 下 5 份 Markdown 文档。前 4 份用于构建“公开产品知识库”，第 5 份用于构建“内部隔离知识库”。

| 文件 | 用途 | 核心检索词 | 是否加入公开产品知识库 |
| --- | --- | --- | --- |
| `01_product_operations_playbook.md` | 产品流程、能力配置、发布前检查 | 青松路由、资料冻结、能力配置 | 是 |
| `02_security_release_governance.md` | 鉴权、权限、发布、暂停、删除 | Key-R7、服务已暂停、active_revision_id | 是 |
| `03_client_integration_stdio_bridge.md` | HTTP 调用、stdio 桥接、协议版本 | EchoBridge-stdio、MCP_BUILDER_SERVICE_ID、2026-07-28 | 是 |
| `04_troubleshooting_faq.md` | FAQ、错误码、资源与工具区别 | NoTrain-01、Resources 和 Tools、has_more | 是 |
| `99_internal_shadow_boundary.md` | 范围隔离负向测试 | Shadow Plan | 否 |

建议构建两个知识库：

| 知识库 | 文档选择 | 用途 |
| --- | --- | --- |
| 公开产品知识库 | 01、02、03、04 | 测试所有正向 tools、prompts、resources |
| 内部隔离知识库 | 99 | 验证服务范围隔离 |

## 2. 服务配置建议

发布一个“公开产品 MCP 测试服务”，绑定公开产品知识库版本。能力配置建议如下：

| 类别 | 配置 |
| --- | --- |
| Tools | 启用全部预设工具，至少覆盖 `search_knowledge`、`get_document`、`list_documents`、`batch_search`、`start_search_task`、`get_task_status`、`request_elicitation` |
| Resources | 开启目录资源、URI 模板、Resources-as-Tools；资源文档先只勾选 01 和 02，再执行资源范围测试 |
| Prompts | 启用全部预设 Prompt，至少覆盖问答、总结、FAQ、证据、对比、术语、新人速览、检查清单、代码审查、结构化报告、自定义、多消息分析 |

发布后创建 API Key，真实调用都使用：

```text
Authorization: Bearer <api_key>
MCP-Protocol-Version: 2026-07-28
Content-Type: application/json
```

## 3. 基础 MCP 方法测试

| 编号 | 方法 | 输入要点 | 预计结果 | 可用判定 |
| --- | --- | --- | --- | --- |
| M-01 | `server/discover` | 空 `params` | 返回 `protocolVersion=2026-07-28`、`transport=streamable-http`、`serverInfo.name` 为服务名，`capabilities` 至少包含已启用的 `tools/resources/prompts` | 能看到协议、服务名和能力集合 |
| M-02 | `initialize` | `clientInfo.name=local-test` | 返回结构同 `server/discover`，协议版本正确 | 客户端初始化可用 |
| M-03 | `tools/list` | 空 `params` | 返回已启用工具；每个工具包含 `name`、`description`、`inputSchema`、`outputSchema`、只读 annotations；开启 Resources-as-Tools 时包含 `list_mcp_resources` 和 `read_mcp_resource` | 工具发现完整 |
| M-04 | `resources/list` | `page_size=20` | 返回 catalog URI 和 01、02 文档的 chunk URI，不返回 03、04 的 chunk URI | 资源范围正确 |
| M-05 | `resources/templates/list` | 空 `params` | 若开启 URI 模板，返回 `kb://{service_id}/{revision}/documents/{document_id}/chunks/{chunk_id}` 风格模板 | URI 模板可发现 |
| M-06 | `prompts/list` | 空 `params` | 返回所有启用 Prompt，包含参数名、描述、required 和 messageCount | Prompt 发现完整 |

## 4. Tools 模块测试

| 编号 | Tool 模板/公开名 | 输入 | 预计结果 | 可用判定 |
| --- | --- | --- | --- | --- |
| T-01 | `search_knowledge` / `search_knowledge` | `query=青松路由, top_k=5` | `structuredContent.results[0]` 或前几条命中 `01_product_operations_playbook.md`；文本包含“青松路由”；返回 `line_start`、`line_end`、`content_hash`、`knowledge_base_revision`、`service_revision` | 中文搜索可用 |
| T-02 | `search_knowledge` / `find_evidence` | `query=Key-R7, top_k=3` | 命中 `02_security_release_governance.md`；文本包含 `Key-R7` 和 API Key 生命周期 | 自定义公开名工具可用 |
| T-03 | `search_knowledge` / `search_faq` | `query=NoTrain-01, top_k=3` | 命中 `04_troubleshooting_faq.md`；文本说明系统不训练模型 | FAQ 检索可用 |
| T-04 | `search_knowledge` / `lookup_terms` | `query=EchoBridge-stdio, top_k=3` | 命中 `03_client_integration_stdio_bridge.md` | 术语检索可用 |
| T-05 | `batch_search` | `queries=["青松路由","Key-R7","NoTrain-01"], top_k=2` | 返回 `queries` 数组，3 个子查询分别命中 01、02、04；顶层含知识库和服务版本 | 批量检索可用 |
| T-06 | `start_search_task` | `query=EchoBridge-stdio, top_k=1` | 返回 `job_id`、`status=succeeded`、`result_preview` 命中 03 | 异步任务启动可用 |
| T-07 | `get_task_status` | 使用 T-06 的 `job_id` | 返回同一 `job_id`、`status=succeeded`、`progress=100`、`result.results` 命中 03 | 任务轮询可用 |
| T-08 | `request_more_input` | `reason=需要确定测试范围, fields=["service_id","api_key"]` | 返回 `elicitation.type=missing_input`，fields 中包含 `service_id` 和 `api_key` | Elicitation 结构可用 |
| T-09 | `list_documents` | `page_size=2` | 返回前 2 个文档，`next_cursor` 非空；继续用 cursor 可取后续文档；不返回本地磁盘路径 | 文档目录分页可用 |
| T-10 | `get_document` | 使用 T-09 任一 `document_id`，`offset=0, limit=200` | 返回文件名、标题、正文前 200 字以内、`has_more` 和 `next_offset`；不返回磁盘路径 | 文档读取可用 |
| T-11 | `read_excerpt` | 使用 T-01 命中文档 ID，`offset` 接近命中片段起始，`limit=800` | 返回对应上下文，字段结构同 `get_document` | 同模板多公开名可用 |
| T-12 | `search_knowledge` 负向 | `query=Shadow Plan, top_k=5` | 公开产品服务返回空 `results` | 未绑定文档不泄漏 |
| T-13 | 未启用工具负向 | 调用一个未启用或不存在的 `name` | 返回 MCP error，code 为 404，message 包含未知或未启用工具 | 禁用能力不可调用 |
| T-14 | 参数负向 | `search_knowledge` 的 `top_k=99` 或空 query | 返回错误，message 指出参数无效 | 参数校验生效 |

## 5. Resources 模块测试

| 编号 | Resource 模块 | 输入 | 预计结果 | 可用判定 |
| --- | --- | --- | --- | --- |
| R-01 | Catalog | `resources/read` 读取 `resources/list` 返回的 `/catalog` URI | 返回 `mimeType=application/json`，text 为文档目录 JSON；包含 01-04 的文档元数据 | 目录资源可读 |
| R-02 | Chunk resource | 读取 01 文档的 chunk URI | 返回 `mimeType=text/markdown`，text 包含“青松路由”或相关章节内容 | 片段资源可读 |
| R-03 | Resource scope | `resources/list` | 只出现 01、02 的 chunk URI；不出现 03、04 的 chunk URI | 资源勾选范围生效 |
| R-04 | 手工构造未开放资源 | 用 03 或 04 的 `document_id/chunk_id` 构造 URI 读取 | 返回 404，message 包含资源未开放、不可读取或 URI 无效 | 未开放资源不可读 |
| R-05 | URI 模板 | `resources/templates/list` | 返回模板数组；模板包含 `{document_id}` 和 `{chunk_id}` | 模板发现可用 |
| R-06 | Resources-as-Tools 列表 | `tools/call` 调用 `list_mcp_resources`，`page_size=20` | `structuredContent.resources` 与 `resources/list` 等价 | 兼容工具列表可用 |
| R-07 | Resources-as-Tools 读取 | `tools/call` 调用 `read_mcp_resource`，传 R-02 URI | `structuredContent.contents[0].text` 与 `resources/read` 等价 | 兼容工具读取可用 |
| R-08 | 旧 revision URI | 重新发布后读取旧 revision 的资源 URI | 返回 404 或提示 URI 已失效/不可读取 | 资源绑定当前版本 |

## 6. Prompts 模块测试

`prompts/get` 只渲染消息，不执行检索、不调用模型。以下预计结果都以返回消息结构为判定标准。

| 编号 | Prompt 名称 | 输入参数 | 预计结果 | 可用判定 |
| --- | --- | --- | --- | --- |
| P-01 | `answer_from_knowledge` | `question=青松路由如何保证草稿不影响线上？` | 返回 1 条 user 消息；文本包含实际搜索工具名和问题；包含知识库名称 | 问答模板可渲染 |
| P-02 | `summarize_document` | `document_id=<01文档ID>, focus=发布流程` | 文本包含实际读取工具名、文档 ID 和“发布流程” | 总结模板可渲染 |
| P-03 | `answer_faq` | `question=系统是否会训练模型？` | 文本要求使用搜索工具查找 FAQ 并回答问题 | FAQ Prompt 可渲染 |
| P-04 | `quote_evidence` | `topic=Key-R7` | 文本要求检索 `Key-R7` 并只提取证据 | 证据 Prompt 可渲染 |
| P-05 | `compare_topics` | `topic_a=Tools, topic_b=Resources` | 文本包含两个主题并要求对比 | 对比 Prompt 可渲染 |
| P-06 | `explain_term` | `term=EchoBridge-stdio` | 文本要求查询该术语 | 术语 Prompt 可渲染 |
| P-07 | `onboarding_brief` | `topic=青松路由` | 文本要求整理入门说明 | 新人速览 Prompt 可渲染 |
| P-08 | `document_checklist` | `document_id=<02文档ID>, goal=安全发布` | 文本包含文档 ID 和检查目标 | 检查清单 Prompt 可渲染 |
| P-09 | `review_code` | `language=python, code=print("hello")` | 文本包含 fenced code block 和待审查代码；不要求工具依赖 | 纯参数 Prompt 可渲染 |
| P-10 | `structured_report` | `topic=NoTrain-01` | 文本包含 JSON 结构要求和主题 | 结构化报告 Prompt 可渲染 |
| P-11 | `custom_prompt` | `instruction=列出测试风险` | 文本替换为用户 instruction | 自定义 Prompt 可渲染 |
| P-12 | `analyst_brief` | `topic=Key-R7` | 返回 3 条 messages，角色顺序为 user、assistant、user；文本包含实际搜索工具名和主题 | 多消息 Prompt 可渲染 |
| P-13 | 缺参负向 | `answer_from_knowledge` 不传 `question` | 返回错误，message 包含缺少提示词参数 | 必填参数校验生效 |
| P-14 | 依赖负向 | 禁用 `search_knowledge` 后发布 `answer_from_knowledge` | 发布失败，message 包含依赖未启用工具 | Prompt 依赖校验生效 |

## 7. 鉴权、状态和隔离测试

| 编号 | 场景 | 操作 | 预计结果 |
| --- | --- | --- | --- |
| A-01 | 缺少 API Key | 不传 Authorization 调 `/mcp/{service_id}` | HTTP 401，error message 为缺少 Bearer API Key |
| A-02 | 错误协议版本 | `MCP-Protocol-Version=2025-01-01` | 返回错误，message 包含不支持的 MCP-Protocol-Version |
| A-03 | Header/body 方法不一致 | Header 为 `tools/list`，body 为 `tools/call` | 返回错误，message 包含方法不一致 |
| A-04 | 暂停服务 | 调 `/api/services/{id}/pause` 后再 `tools/list` | HTTP 503，message 为服务已暂停 |
| A-05 | 恢复服务 | 调 `/api/services/{id}/resume` 后再 `tools/list` | 恢复 200，返回工具列表 |
| A-06 | 删除保护 | 服务存在时删除绑定文档或知识库 | 返回 409，提示仍被 MCP 使用 |
| A-07 | 删除服务后清理 | 删除服务后再删除文档和知识库 | 服务删除成功；文档和知识库不再被阻止 |
| A-08 | 内部隔离 | 公开服务检索 `Shadow Plan` | 空结果；内部隔离服务检索应命中 99 文档 |

## 8. 自动化执行建议

可在现有 `tests/test_flow.py` 基础上增加数据驱动测试：

1. 上传 `test_knowledge_docs/01` 到 `04`，构建公开产品知识库。
2. 上传 `test_knowledge_docs/99`，构建内部隔离知识库。
3. 创建公开产品 MCP，patch 启用全部 tool/prompt/resource 配置。
4. 发布、创建 API Key，依次执行本方案 M/T/R/P/A 表格中的真实 `/mcp/{service_id}` 调用。
5. 对每个调用断言结构字段、命中文档、错误码和错误信息。

最低通过标准：基础方法 M-01 到 M-06 全部通过；Tools 中 T-01、T-05、T-09、T-10、T-12 通过；Resources 中 R-01 到 R-07 通过；Prompts 中 P-01 到 P-12 通过；鉴权和隔离 A-01 到 A-08 通过。

