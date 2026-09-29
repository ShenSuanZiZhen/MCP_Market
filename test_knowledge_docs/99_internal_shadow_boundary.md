# 内部隔离资料：Shadow Plan

## 文档目的

本文是负向测试资料，不应加入公开产品服务的知识库。它用于验证知识库范围隔离、服务范围隔离、资源范围隔离和删除保护。本文的核心专有词是 `Shadow Plan`。如果公开产品服务检索 `Shadow Plan` 返回命中，说明服务绑定范围错误。

## 内部内容

`Shadow Plan` 是内部测试代号，只能出现在单独的隔离知识库或隔离 MCP 服务中。公开产品服务不应通过 `search_knowledge`、`batch_search`、`get_document`、`resources/list`、`resources/read`、`list_mcp_resources` 或 `read_mcp_resource` 返回本文内容。

## 负向测试规则

1. 构建“公开产品知识库”时，不选择本文。
2. 构建“内部隔离知识库”时，只选择本文。
3. 发布公开产品 MCP 后，检索 `Shadow Plan` 应返回空结果。
4. 手工构造本文的 Resource URI 读取公开产品 MCP，应返回资源不可读或 URI 无效错误。
5. 只有内部隔离 MCP 才能命中 `Shadow Plan`。

