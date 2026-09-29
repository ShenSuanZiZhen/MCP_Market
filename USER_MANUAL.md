# MCP Knowledge Builder 用户使用手册

## 1. 登录与注册

打开本地地址：

```text
http://127.0.0.1:8000/
```

首次使用时注册账号。第一个注册账号会自动成为管理员。

后续使用时直接登录。

## 2. 上传文档

进入左侧“文档库”。

操作步骤：

1. 点击上传区域。
2. 选择 `.md` 或 `.markdown` 文件。
3. 点击“上传并加入选择”。
4. 上传成功后，文档会出现在文档清单中。

说明：

- 系统仅支持 UTF-8 Markdown。
- 重复内容会按哈希去重。
- 可以勾选文档用于创建知识库。

删除文档：

- 点击文档卡片中的“删除文档”。
- 只有未被 MCP 使用的文档可以删除。
- 如果按钮禁用，说明该文档仍被某个 MCP 使用。

## 3. 创建知识库

进入左侧“知识库”。

操作步骤：

1. 在文档库中先勾选文档。
2. 在知识库页面填写知识库名称。
3. 点击“创建并构建”。
4. 系统会生成一个可检索的知识库版本。

试检索：

1. 在“试检索”区域选择知识库。
2. 输入关键词，例如 `智能路由`。
3. 点击“检索”。
4. 查看返回的命中文档和片段。

删除知识库：

- 点击知识库卡片中的“删除知识库”。
- 只有未被 MCP 使用的知识库可以删除。
- 删除知识库不会删除原始文档。

## 4. 构建 MCP 服务

进入左侧“MCP 服务”。

系统提供 8 步构建流程。

### 第 1 步：定义 MCP

填写：

- MCP 名称
- MCP 简介
- 创建者

这些信息会显示在构建预览和“我的 MCP”详情中。

### 第 2 步：选择资料

可以同时选择：

- 新上传或已有文档
- 已有知识库

也可以在此步骤上传新 Markdown 文档，上传后会同步加入文档库。

### 第 3 步：构建新的不可变 MCP 知识库

系统会把选择的文档和知识库内容合并去重，并生成新的不可变 MCP 知识库版本。

如果只选择了一个已有知识库，且没有选择新文档，则系统会直接复用该知识库版本。

### 第 4 步：配置能力

配置三类 MCP 能力：

- Tools：模型可调用的工具。
- Resources：模型可读取的资源。
- Prompts：模型可使用的提示词模板。

Tools 示例：

- `search_knowledge`：搜索知识库。
- `get_document`：读取文档正文。
- `list_documents`：列出文档目录。
- `batch_search`：批量检索。
- `start_search_task`：异步搜索任务。

Resources 示例：

- 可枚举知识库目录。
- URI 模板。
- Resources-as-Tools 兼容模式。

Prompts 示例：

- 基于知识库回答。
- 总结指定文档。
- 提取证据引用。
- 对比两个概念。
- 代码审查。
- 多消息分析工作流。

### 第 5 步：选择发布接入方式

当前系统使用：

- Streamable HTTP
- Bearer API Key
- MCP Protocol Version：`2026-07-28`

可以设置 API Key 有效期。

### 第 6 步：生成 MCP 构建预览

确认：

- MCP 名称
- 简介
- 创建者
- 知识库版本
- Tools 数量
- Resources 数量
- Prompts 数量
- 发布方式

### 第 7 步：进行 MCP 测试

可以测试：

- `server/discover`
- `tools/list`
- `resources/templates/list`
- `prompts/list`

草稿测试不会发布 MCP，也不会覆盖线上版本。

### 第 8 步：发布生成不可变 MCP

点击“发布不可变 MCP”。

发布成功后，页面会生成：

- MCP URL
- API Key
- Authorization Header
- curl 搜索测试命令
- 本地模型 stdio 配置

API Key 明文只展示一次，请及时复制保存。

## 5. 管理我的 MCP

进入左侧“我的 MCP”。

默认不会展开任何 MCP 配置。

点击“载入配置”后，可以查看该 MCP 的只读详情：

- MCP ID
- MCP 名称
- 简介
- 创建者
- 绑定知识库版本
- 已发布版本
- 运行状态
- Tools 配置
- Resources 配置
- Prompts 配置

可执行操作：

- 未发布 MCP：可以发布。
- 已发布 MCP：可以显示连接信息、创建密钥、下架。
- 已下架 MCP：可以重新上架。
- 任意 MCP：可以删除。

删除 MCP：

- 删除 MCP 会删除服务、服务版本、API Key 和调用日志。
- 删除 MCP 不会删除文档。
- 删除 MCP 不会删除知识库。

下架 MCP：

- 下架后服务仍保留。
- 外部 `/mcp/{service_id}` 调用会返回服务已暂停。
- 可以重新上架恢复调用。

## 6. 使用调用控制台

进入左侧“调用控制台”。

操作步骤：

1. 选择已发布 MCP 服务。
2. 输入 API Key。
3. 选择 MCP 方法。
4. 在可视化输入区填写参数。
5. 点击“生成 JSON 输入”。
6. 点击“调用 /mcp/{service_id}”。
7. 查看可视化输出和 JSON 输出。

常用方法：

- `server/discover`：查看服务能力。
- `tools/list`：查看可调用工具。
- `tools/call`：调用工具。
- `resources/list`：列出资源。
- `resources/read`：读取资源。
- `prompts/list`：列出提示词。
- `prompts/get`：渲染提示词。

## 7. curl 调用示例

```bash
curl -X POST "http://127.0.0.1:8000/mcp/{service_id}" \
  -H "Authorization: Bearer {api_key}" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "search_knowledge",
      "arguments": {
        "query": "智能路由",
        "top_k": 5
      }
    }
  }'
```

注意：

```text
Authorization: Bearer mkb_xxxxx
```

不要写成：

```text
Authorization: Bearer <mkb_xxxxx>
```

## 8. 常见问题

### API Key 无效

确认使用的是最新创建的 Key，并且 Header 不包含尖括号。

### MCP 调用返回服务已暂停

说明该 MCP 已下架。进入“我的 MCP”，点击“重新上架”。

### 文档不能删除

说明该文档仍被某个 MCP 使用。需要先删除相关 MCP，或确保 MCP 不再引用它。

### 知识库不能删除

说明该知识库仍被某个 MCP 草稿或已发布版本引用。

### 发布后还能修改吗

发布版本是不可变的。可以修改草稿后重新发布，生成新的 Service Revision。

### 下架会删除 MCP 吗

不会。下架只暂停外部调用，配置和版本仍保留。

### 删除 MCP 会删除文件吗

不会。删除 MCP 只删除服务本身、服务版本、密钥和调用日志。原始文档和知识库保留。
