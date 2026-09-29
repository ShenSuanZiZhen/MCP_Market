type ViewName = "documents" | "knowledge" | "services" | "myMcp" | "console" | "users";

type UserInfo = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "seller" | "viewer";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type DocumentInfo = {
  id: string;
  original_name: string;
  title: string;
  size: number;
  content_hash: string;
  status: string;
  created_at: string;
};

type DocumentDetail = DocumentInfo & {
  content: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  document_ids: string[];
  latest_ready_revision_id: string | null;
  status: string;
  revisions: Array<{ id: string; revision: number; status: string; created_at: string }>;
};

type ServiceInfo = {
  id: string;
  name: string;
  description: string;
  draft_config: ServiceDraft;
  active_revision_id: string | null;
  active_revision?: { id: string; revision: number; knowledge_base_revision_id: string; created_at: string } | null;
  runtime_status: string;
  updated_at: string;
};

type ServiceDraft = {
  knowledge_base_revision_id: string;
  tools: ToolConfig[];
  resources: ResourceConfig;
  prompts: PromptConfig[];
};

type ToolConfig = {
  preset_id?: string;
  template: string;
  name: string;
  description: string;
  enabled: boolean;
  execution_mode?: string;
  interaction_depth?: string;
  behavior_hints?: Record<string, boolean>;
  output_schema?: unknown;
  annotations?: Record<string, boolean>;
};

type ResourceConfig = {
  catalog_enabled?: boolean;
  uri_templates_enabled?: boolean;
  as_tools_enabled?: boolean;
  document_ids?: string[];
};

type PromptConfig = {
  preset_id?: string;
  template: string;
  name: string;
  description: string;
  enabled: boolean;
  template_text: string;
  arguments: Record<string, { description: string; required: boolean; default: string }>;
  depends_on?: string[];
  completions?: Record<string, string[]>;
  messages?: Array<{ role: "user" | "assistant"; text: string }> | null;
};

type ToolPreset = {
  id: string;
  template: string;
  defaultName: string;
  title: string;
  description: string;
  executionMode: string;
  interactionDepth: string;
  hints: Record<string, boolean>;
  schema: Record<string, string>;
  outputSchema?: unknown;
};

type PromptPreset = {
  id: string;
  template: string;
  defaultName: string;
  title: string;
  description: string;
  dependency: string;
  dependsOn: string[];
  templateText: string;
  arguments: PromptConfig["arguments"];
  completions?: Record<string, string[]>;
  messages?: PromptConfig["messages"];
};

type ConnectionArtifacts = {
  serviceId: string;
  mcpUrl: string;
  apiKey: string;
  authHeader: string;
  curl: string;
  stdioConfig: string;
};

type ConsoleMethodGuide = {
  id: string;
  title: string;
  does: string;
  input: string;
  output: string;
  defaultParams: Record<string, unknown>;
};

type PreviewItem = {
  title: string;
  meta: string;
  content: string;
};

type ContentPreview = {
  mode: "document" | "knowledge";
  title: string;
  subtitle: string;
  items: PreviewItem[];
};

const app = document.querySelector<HTMLElement>("#app")!;
const toastEl = document.querySelector<HTMLDivElement>("#toast")!;

const state = {
  view: "documents" as ViewName,
  documents: [] as DocumentInfo[],
  selectedDocs: new Set<string>(),
  kbBuilderOpen: false,
  kbBuilderName: "产品知识库",
  kbBuilderDescription: "",
  kbBuilderDocIds: new Set<string>(),
  knowledgeBases: [] as KnowledgeBase[],
  services: [] as ServiceInfo[],
  editingServiceId: "",
  myMcpSelectedId: "",
  apiKey: "",
  searchResult: "",
  consoleResult: "",
  serviceConnectionInfo: {} as Record<string, string>,
  consoleServiceId: "",
  consoleMethod: "tools/call",
  consoleParams: '{"name":"search_knowledge","arguments":{"query":"智能路由","top_k":5}}',
  connectionInfo: "",
  contentPreview: null as ContentPreview | null,
  currentUser: null as UserInfo | null,
  users: [] as UserInfo[],
  authMode: "login" as "login" | "register",
  serviceConfigTab: "tools" as "tools" | "resources" | "prompts",
  mcpStep: 1,
  mcpSourceMode: "documents" as "documents" | "knowledge",
  mcpName: "产品文档 MCP 服务",
  mcpIntro: "",
  mcpCreator: "",
  mcpSelectedKbIds: new Set<string>(),
  mcpSelectedRevisionId: "",
  sourceDocQuery: "",
  sourceKbQuery: "",
  accessKeyDays: 30,
  draftTestResult: "",
};

const toolPresets: ToolPreset[] = [
  preset("search_general", "search_knowledge", "search_knowledge", "通用知识搜索", "按关键词检索当前服务绑定知识库中的 Markdown 片段。", "synchronous", "single_call", { query: "必填，1-500 字符", top_k: "1-10，默认 5" }),
  preset("search_evidence", "search_knowledge", "find_evidence", "证据片段查找", "查找可引用的原文证据，强调文件名、标题路径和行号。", "synchronous", "single_call", { query: "实体、术语或问题", top_k: "建议 3-8" }),
  preset("search_faq", "search_knowledge", "search_faq", "FAQ 搜索", "面向常见问题的检索入口。", "synchronous", "single_call", { query: "用户问题或关键词", top_k: "默认 5" }),
  preset("search_terms", "search_knowledge", "lookup_terms", "术语查询", "查询产品术语、中文专有名词或英文技术词。", "synchronous", "single_call", { query: "术语或专有名词", top_k: "默认 5" }),
  preset("batch_search", "batch_search", "batch_search", "程序化批量检索", "一次调用编排多个关键词检索，减少模型与客户端往返。", "programmatic", "multi_step", { queries: "1-5 个查询", top_k: "默认 3" }),
  preset("async_search_task", "start_search_task", "start_search_task", "异步搜索任务", "立即返回任务 ID，适合把长耗时资料分析包装为可轮询任务。", "asynchronous", "task_polling", { query: "必填，1-500 字符", top_k: "默认 5" }, { long_running: true }),
  preset("task_status", "get_task_status", "get_task_status", "查询任务状态", "根据异步任务 ID 查询状态和结构化结果。", "synchronous", "task_polling", { job_id: "异步任务返回的 ID" }),
  preset("request_elicitation", "request_elicitation", "request_more_input", "请求补充信息", "输入不足时返回结构化 Elicitation 请求。", "interactive", "elicitation", { reason: "为什么需要补充", fields: "需要补充的字段名数组" }),
  preset("read_document", "get_document", "get_document", "读取文档正文", "读取授权文档的指定正文区间。", "synchronous", "single_call", { document_id: "必填", offset: "默认 0", limit: "1-20000" }),
  preset("read_excerpt", "get_document", "read_excerpt", "读取长文片段", "在搜索命中后继续读取上下文。", "synchronous", "single_call", { document_id: "必填", offset: "从命中附近开始", limit: "建议 2000-8000" }),
  preset("list_catalog", "list_documents", "list_documents", "列出文档目录", "分页列出当前服务绑定知识库中的文档清单。", "synchronous", "single_call", { cursor: "可选", page_size: "1-100" }),
  preset("list_sources", "list_documents", "list_sources", "列出可引用资料", "展示本服务可以引用的资料来源。", "synchronous", "single_call", { cursor: "可选", page_size: "1-100" }),
];

const promptPresets: PromptPreset[] = [
  prompt("answer_from_knowledge", "answer_from_knowledge", "answer_from_knowledge", "基于知识库回答", "根据检索结果回答问题。", ["search_knowledge"], "请使用 {{search_tool_name}} 检索知识库“{{knowledge_base_name}}”，根据检索到的资料回答：{{question}}。\n请注明文件名和行号；证据不足时明确说明。", { question: arg("用户问题") }),
  prompt("summarize_document", "summarize_document", "summarize_document", "总结指定文档", "总结指定文档。", ["get_document"], "请使用 {{get_document_tool_name}} 读取文档 {{document_id}} 并总结要点。{{focus}}", { document_id: arg("文档 ID"), focus: arg("可选关注点", false) }),
  prompt("faq_answer", "faq_answer", "answer_faq", "FAQ 问答", "把用户问题转成 FAQ 检索和回答流程。", ["search_knowledge"], "请使用 {{search_tool_name}} 查找和 FAQ 最接近的资料，回答：{{question}}。", { question: arg("用户问题") }),
  prompt("quote_evidence", "quote_evidence", "quote_evidence", "提取证据引用", "只整理证据，不直接扩写答案。", ["search_knowledge"], "请使用 {{search_tool_name}} 检索“{{topic}}”，只提取能支持判断的原文证据。", { topic: arg("要核对的主题") }),
  prompt("compare_topics", "compare_topics", "compare_topics", "对比两个概念", "检索两个概念并输出相同点、差异和引用。", ["search_knowledge"], "请使用 {{search_tool_name}} 分别检索 {{topic_a}} 和 {{topic_b}}，对比它们。", { topic_a: arg("概念 A"), topic_b: arg("概念 B") }),
  prompt("glossary_lookup", "glossary_lookup", "explain_term", "解释术语", "检索并解释一个术语或专有名词。", ["search_knowledge"], "请使用 {{search_tool_name}} 查询术语“{{term}}”。", { term: arg("术语或专有名词") }),
  prompt("onboarding_brief", "onboarding_brief", "onboarding_brief", "新人速览", "把指定主题整理成新人可读的入门说明。", ["search_knowledge"], "请使用 {{search_tool_name}} 检索主题“{{topic}}”，整理入门说明。", { topic: arg("入门主题") }),
  prompt("document_checklist", "document_checklist", "document_checklist", "文档检查清单", "读取文档并整理检查项。", ["get_document"], "请使用 {{get_document_tool_name}} 读取文档 {{document_id}}，围绕“{{goal}}”整理检查清单。", { document_id: arg("文档 ID"), goal: arg("检查目标") }),
  prompt("code_review_public", "code_review_public", "review_code", "代码审查", "参数化模板，接收代码和语言。", [], "请审查下面的 {{language}} 代码。\n```{{language}}\n{{code}}\n```", { language: arg("编程语言"), code: arg("待审查代码") }, { language: ["python", "typescript", "javascript", "go", "rust"] }),
  prompt("structured_report", "structured_report", "structured_report", "结构化报告", "要求模型按固定 JSON 结构组织结论。", ["search_knowledge"], "请使用 {{search_tool_name}} 检索“{{topic}}”，并返回 JSON：{\"summary\":\"...\",\"evidence\":[],\"unknowns\":[]}。", { topic: arg("报告主题") }),
  prompt("custom_plain", "custom_plain", "custom_prompt", "自定义纯文本提示词", "无工具依赖，适合固定说明。", [], "请根据用户输入完成任务：{{instruction}}", { instruction: arg("任务说明") }),
  {
    ...prompt("multi_message_analyst", "multi_message_analyst", "analyst_brief", "多消息分析工作流", "返回多条消息组成的对话序列。", ["search_knowledge"], "请使用 {{search_tool_name}} 检索主题“{{topic}}”。", { topic: arg("分析主题") }),
    messages: [
      { role: "user", text: "请使用 {{search_tool_name}} 检索知识库“{{knowledge_base_name}}”中的主题：{{topic}}。" },
      { role: "assistant", text: "我会先检索资料，再按“证据、判断、风险、下一步”输出。" },
      { role: "user", text: "请引用文件名和行号，证据不足时明确说明。" },
    ],
  },
];

function preset(id: string, template: string, defaultName: string, title: string, description: string, executionMode: string, interactionDepth: string, schema: Record<string, string>, hints: Record<string, boolean> = {}): ToolPreset {
  return {
    id,
    template,
    defaultName,
    title,
    description,
    executionMode,
    interactionDepth,
    schema,
    hints: { long_running: false, requires_secrets: false, structured_output: true, ...hints },
    outputSchema: { type: "object", additionalProperties: true },
  };
}

function arg(description: string, required = true) {
  return { description, required, default: "" };
}

function prompt(id: string, template: string, defaultName: string, title: string, description: string, dependsOn: string[], templateText: string, args: PromptPreset["arguments"], completions: Record<string, string[]> = {}): PromptPreset {
  return { id, template, defaultName, title, description, dependency: dependsOn.length ? `依赖 ${dependsOn.join(", ")}` : "无工具依赖", dependsOn, templateText, arguments: args, completions };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || data.error?.message || res.statusText);
  return data as T;
}

async function bootstrap(): Promise<void> {
  try {
    const me = await api<{ user: UserInfo }>("/api/auth/me");
    state.currentUser = me.user;
    await refresh();
  } catch {
    state.currentUser = null;
    render();
  }
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function connectionBundle(serviceId: string, apiKey: string, note: string): unknown {
  const baseUrl = window.location.origin;
  return {
    note,
    service_id: serviceId,
    api_key: apiKey,
    http: {
      url: `${baseUrl}/mcp/${serviceId}`,
      headers: {
        Authorization: "Bearer <上面的 api_key>",
        "MCP-Protocol-Version": "2026-07-28",
      },
    },
    local_llm_stdio: {
      mcpServers: {
        local_docs: {
          command: "python",
          args: ["scripts/mcp_stdio_bridge.py"],
          env: {
            MCP_BUILDER_BASE_URL: baseUrl,
            MCP_BUILDER_SERVICE_ID: serviceId,
            MCP_BUILDER_API_KEY: apiKey,
          },
        },
      },
    },
  };
}

function connectionArtifacts(serviceId: string, apiKey: string): ConnectionArtifacts {
  const baseUrl = window.location.origin;
  const mcpUrl = `${baseUrl}/mcp/${serviceId}`;
  const body = {
    jsonrpc: "2.0",
    id: "1",
    method: "tools/call",
    params: {
      name: "search_knowledge",
      arguments: {
        query: "智能路由",
        top_k: 5,
      },
    },
  };
  const stdioConfig = {
    mcpServers: {
      local_docs: {
        command: "python",
        args: ["scripts/mcp_stdio_bridge.py"],
        env: {
          MCP_BUILDER_BASE_URL: baseUrl,
          MCP_BUILDER_SERVICE_ID: serviceId,
          MCP_BUILDER_API_KEY: apiKey,
        },
      },
    },
  };
  return {
    serviceId,
    mcpUrl,
    apiKey,
    authHeader: `Authorization: Bearer ${apiKey}`,
    curl: [
      `curl -X POST "${mcpUrl}" \\`,
      `  -H "Authorization: Bearer ${apiKey}" \\`,
      `  -H "MCP-Protocol-Version: 2026-07-28" \\`,
      `  -H "Mcp-Method: tools/call" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '${JSON.stringify(body, null, 2)}'`,
    ].join("\n"),
    stdioConfig: JSON.stringify(stdioConfig, null, 2),
  };
}

function copyCard(label: string, value: string, multiline = false): string {
  return `
    <article class="copy-card ${multiline ? "wide" : ""}">
      <div class="copy-card-head">
        <span>${esc(label)}</span>
        <button class="btn btn-outline btn-sm" type="button" data-copy-value="${esc(value)}">复制</button>
      </div>
      <pre>${esc(value)}</pre>
    </article>`;
}

function publishConnectionPanel(serviceId: string): string {
  if (!serviceId || !state.apiKey) {
    return `
      <section class="connection-card">
        <div class="section-head"><div><h3>生成后的调用信息</h3><p>点击发布后会在这里展示 MCP URL、API Key、curl 命令和本地模型 stdio 配置。</p></div></div>
        <div class="notice-banner info">API Key 明文只会在创建时展示一次；请发布后立即复制保存。</div>
      </section>`;
  }
  const artifacts = connectionArtifacts(serviceId, state.apiKey);
  return `
    <section class="connection-card">
      <div class="section-head"><div><h3>生成后的调用信息</h3><p>下面内容已经填入当前服务和刚生成的 API Key，可直接复制到终端或本地模型客户端。</p></div></div>
      <div class="copy-grid">
        ${copyCard("MCP URL", artifacts.mcpUrl)}
        ${copyCard("API Key", artifacts.apiKey)}
        ${copyCard("Authorization Header", artifacts.authHeader)}
        ${copyCard("curl 搜索测试", artifacts.curl, true)}
        ${copyCard("本地模型 stdio 配置", artifacts.stdioConfig, true)}
      </div>
    </section>`;
}

function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2800);
}

async function refresh(): Promise<void> {
  if (!state.currentUser) {
    render();
    return;
  }
  const [docs, kbs, services] = await Promise.all([
    api<{ documents: DocumentInfo[] }>("/api/documents"),
    api<{ knowledge_bases: KnowledgeBase[] }>("/api/knowledge-bases"),
    api<{ services: ServiceInfo[] }>("/api/services"),
  ]);
  state.documents = docs.documents;
  state.knowledgeBases = kbs.knowledge_bases;
  state.services = services.services;
  if (state.currentUser.role === "admin") {
    const users = await api<{ users: UserInfo[] }>("/api/users");
    state.users = users.users;
  }
  render();
}

function setView(view: ViewName): void {
  if (view === "users" && state.currentUser?.role !== "admin") {
    toast("需要管理员权限");
    return;
  }
  if (view === "myMcp" && state.view !== "myMcp") {
    state.myMcpSelectedId = "";
  }
  state.view = view;
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  render();
}

function render(): void {
  document.body.classList.toggle("authed", Boolean(state.currentUser));
  document.querySelector<HTMLElement>("#sidebar")!.style.display = state.currentUser ? "flex" : "none";
  document.querySelectorAll<HTMLElement>(".admin-only").forEach((node) => {
    node.style.display = state.currentUser?.role === "admin" ? "flex" : "none";
  });
  if (!state.currentUser) {
    app.innerHTML = authView();
    bindAuth();
    return;
  }
  app.innerHTML = `
    <div class="container">
      ${hero()}
      ${state.view === "documents" ? documentsView() : ""}
      ${state.view === "knowledge" ? knowledgeView() : ""}
      ${state.view === "services" ? servicesView() : ""}
      ${state.view === "myMcp" ? myMcpView() : ""}
      ${state.view === "console" ? consoleView() : ""}
      ${state.view === "users" ? usersView() : ""}
      ${state.contentPreview ? contentPreviewModal() : ""}
    </div>`;
  bindView();
}

function authView(): string {
  const isLogin = state.authMode === "login";
  return `
    <section class="auth-shell">
      <div class="auth-left">
        <div class="auth-left-brand"><span class="mark">M</span><div><strong>MCP Knowledge Builder</strong><small>卖家端权限工作台</small></div></div>
        <h1>把 Markdown 知识库发布为可授权的 MCP 服务</h1>
        <div class="auth-features">
          <span>服务级 API Key</span>
          <span>角色权限</span>
          <span>只读运行时</span>
        </div>
      </div>
      <form id="authForm" class="auth-card">
        <h2>${isLogin ? "欢迎回来" : "创建账号"}</h2>
        <p>${isLogin ? "登录后管理知识库、MCP 服务和权限。" : "第一个注册账号会自动成为管理员。"}</p>
        <div class="auth-tabs">
          <button type="button" class="${isLogin ? "active" : ""}" data-auth-mode="login">登录</button>
          <button type="button" class="${!isLogin ? "active" : ""}" data-auth-mode="register">注册</button>
        </div>
        ${!isLogin ? '<div class="field"><label>显示名称</label><input id="authName" type="text" placeholder="例如 Cathy" /></div>' : ""}
        <div class="field"><label>邮箱</label><input id="authEmail" type="email" placeholder="you@example.com" /></div>
        <div class="field"><label>密码</label><input id="authPassword" type="password" placeholder="至少 6 位" /></div>
        <button class="btn btn-primary" type="submit">${isLogin ? "登录" : "注册并进入"}</button>
      </form>
    </section>`;
}

function hero(): string {
  const readyKbs = state.knowledgeBases.filter((kb) => kb.latest_ready_revision_id).length;
  const published = state.services.filter((svc) => svc.runtime_status === "published").length;
  return `
    <div class="breadcrumb">卖家端 <span>/</span> ${viewTitle()}</div>
    <section class="hero-panel">
      <div>
        <h1>${viewTitle()}</h1>
        <p>${viewSubtitle()}</p>
      </div>
      <div class="user-chip">
        <span class="avatar">${esc(state.currentUser?.display_name.slice(0, 2).toUpperCase() || "U")}</span>
        <span><b>${esc(state.currentUser?.display_name)}</b><small>${esc(state.currentUser?.role)}</small></span>
        <button id="logoutBtn" class="btn btn-outline btn-sm" type="button">退出</button>
      </div>
      <div class="hero-stats">
        ${stat("文档", state.documents.length)}
        ${stat("可用知识库", readyKbs)}
        ${stat("已发布服务", published)}
      </div>
    </section>`;
}

function viewTitle(): string {
  return { documents: "文档库", knowledge: "知识库", services: "MCP 服务构建", myMcp: "我的 MCP", console: "调用控制台", users: "权限管理" }[state.view];
}

function viewSubtitle(): string {
  return {
    documents: "上传 Markdown 资料，形成不可变文档记录。",
    knowledge: "选择文档并冻结为可检索的知识库版本。",
    services: "把知识库封装为带 Tools、Resources、Prompts 契约的 MCP 服务。",
    myMcp: "管理已保存和已发布的 MCP 服务，创建密钥并查看连接信息。",
    console: "通过真实 /mcp/{service_id} 端点验证能力发现与调用。",
    users: "管理工作台用户、角色和启停状态。",
  }[state.view];
}

function stat(label: string, value: number): string {
  return `<div class="stat-card"><b>${value}</b><span>${label}</span></div>`;
}

function documentsView(): string {
  return `
    <section class="panel">
      <div class="row-between">
        <div><h2>上传资料</h2><p>仅支持 UTF-8 Markdown；上传后按内容哈希去重。</p></div>
        <button id="refreshBtn" class="btn btn-outline">刷新</button>
      </div>
      <form id="uploadForm" class="upload-dropzone">
        <input id="files" name="files" type="file" accept=".md,.markdown" multiple />
        <div class="updz-icon">↑</div>
        <strong>点击或拖拽上传 Markdown</strong>
        <span>可批量选择 .md / .markdown 文件</span>
        <button class="btn btn-primary" type="submit">上传并加入选择</button>
      </form>
    </section>
    <section class="panel">
      <div class="row-between"><h2>文档清单</h2><span class="muted">${state.selectedDocs.size} 份已选</span></div>
      <div class="kb-grid">${state.documents.map(docCard).join("") || empty("还没有文档", "先上传 Markdown 文件。")}</div>
    </section>`;
}

function docCard(doc: DocumentInfo): string {
  const checked = state.selectedDocs.has(doc.id) ? "checked" : "";
  const relatedKbs = knowledgeBasesUsingDocument(doc.id);
  const usedBy = publishedMcpServicesUsingDocument(doc.id);
  const canDelete = usedBy.length === 0;
  const relationText = relatedKbs.length ? `关联知识库：${relatedKbs.map((kb) => kb.name).join("、")}` : "尚未关联知识库";
  return `
    <article class="kb-card">
      <label class="kb-card-top check-card">
        <input type="checkbox" data-doc="${doc.id}" ${checked} />
        <span class="kb-icon">MD</span>
        <span class="title">${esc(doc.title)}</span>
        <span class="brief">${esc(doc.original_name)}</span>
        <span class="stat-row">${doc.size} bytes · ${doc.content_hash.slice(0, 12)}</span>
        <span class="relation-hint">${esc(relationText)}</span>
      </label>
      <div class="kb-card-foot">
        <button class="btn btn-outline btn-sm" type="button" data-doc-preview="${doc.id}">预览文档</button>
        <button class="btn btn-danger btn-sm" type="button" data-doc-delete="${doc.id}" ${canDelete ? "" : "disabled"} title="${canDelete ? `删除该文档；${relationText}` : `被上架 MCP 使用：${usedBy.map((svc) => svc.name).join("、")}；${relationText}`}">删除文档</button>
      </div>
    </article>`;
}

function knowledgeView(): string {
  return `
    <section class="panel">
      <div class="row-between">
        <div><h2>知识库构建</h2><p>填写知识库名称和介绍，并从文档库中选择要纳入的 Markdown 文档。</p></div>
        <button class="btn btn-primary" type="button" id="openKbBuilderBtn">构建知识库</button>
      </div>
      <div class="notice-banner info">知识库构建会冻结所选文档的内容哈希和切片索引；后续 MCP 发布会绑定明确的知识库版本。</div>
    </section>
    ${state.kbBuilderOpen ? kbBuilderModal() : ""}
    <section class="panel">
      <div class="row-between"><h2>我的知识库</h2><span class="muted">服务发布后会绑定明确版本</span></div>
      <div class="kb-grid">${state.knowledgeBases.map(kbCard).join("") || empty("还没有知识库", "选择文档后创建知识库。")}</div>
    </section>
    <section class="panel">
      <h2>试检索</h2>
      <form id="searchForm" class="toolbar">
        <select id="searchKb">${readyKbOptions()}</select>
        <input id="searchQuery" placeholder="关键词，如 智能路由" />
        <button class="btn btn-outline" type="submit">检索</button>
      </form>
      <pre class="result">${esc(state.searchResult || "等待检索结果")}</pre>
    </section>`;
}

function kbBuilderModal(): string {
  const selectedCount = state.kbBuilderDocIds.size;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="kbBuilderTitle">
        <form id="kbForm" class="stack">
          <div class="section-head">
            <div>
              <h3 id="kbBuilderTitle">构建知识库</h3>
              <p>选择文档库中的资料，系统会立即创建知识库并构建一个可用于 MCP 的不可变版本。</p>
            </div>
            <button class="btn btn-outline btn-sm" type="button" id="closeKbBuilderBtn">关闭</button>
          </div>
          <div class="field-row">
            <div class="field"><label>知识库名称</label><input id="kbName" placeholder="例如：产品知识库" value="${esc(state.kbBuilderName)}" maxlength="50" /></div>
            <div class="field"><label>已选文档</label><input id="kbBuilderSelectedCount" value="${selectedCount} / ${state.documents.length} 份" disabled /></div>
          </div>
          <div class="field"><label>知识库介绍</label><textarea id="kbDescription" rows="4" maxlength="500" placeholder="说明该知识库覆盖的业务范围、适用对象和使用边界。">${esc(state.kbBuilderDescription)}</textarea></div>
          <section class="builder-doc-picker">
            <div class="row-between">
              <div><h4>选择文档</h4><span class="meta">来源于文档库；至少选择 1 份 Markdown 文档。</span></div>
              <div class="actions">
                <button class="btn btn-outline btn-sm" type="button" data-kb-builder-action="select-all">全选</button>
                <button class="btn btn-outline btn-sm" type="button" data-kb-builder-action="clear">清空</button>
              </div>
            </div>
            <div class="source-scroll kb-builder-docs" role="listbox" aria-label="知识库文档选择">${kbBuilderDocumentOptions()}</div>
          </section>
          <div class="wizard-nav">
            <button class="btn btn-outline" type="button" id="cancelKbBuilderBtn">取消</button>
            <button class="btn btn-primary" type="submit">创建并构建知识库</button>
          </div>
        </form>
      </section>
    </div>`;
}

function kbBuilderDocumentOptions(): string {
  if (!state.documents.length) return '<div class="source-empty">文档库暂无文档，请先到文档库上传 Markdown。</div>';
  return state.documents.map((doc) => {
    const relatedKbs = knowledgeBasesUsingDocument(doc.id);
    const relationText = relatedKbs.length ? `已关联：${relatedKbs.map((kb) => kb.name).join("、")}` : "尚未关联知识库";
    return `
      <label class="tree-node source-option kb-builder-option">
        <input type="checkbox" data-kb-builder-doc="${doc.id}" ${state.kbBuilderDocIds.has(doc.id) ? "checked" : ""} />
        <span>${esc(doc.title || doc.original_name)}</span>
        <small>${esc(doc.original_name)} · ${esc(relationText)}</small>
      </label>`;
  }).join("");
}

function contentPreviewModal(): string {
  const preview = state.contentPreview;
  if (!preview) return "";
  const documentMode = preview.mode === "document";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-panel preview-modal" role="dialog" aria-modal="true" aria-labelledby="contentPreviewTitle">
        <div class="section-head">
          <div>
            <h3 id="contentPreviewTitle">${esc(preview.title)}</h3>
            <p>${esc(preview.subtitle)}</p>
          </div>
          <button class="btn btn-outline btn-sm" type="button" id="closeContentPreviewBtn">关闭</button>
        </div>
        ${documentMode ? `
          <article class="markdown-reader">
            ${markdownToHtml(preview.items[0]?.content || "该文档暂无正文内容。")}
          </article>`
          : `<div class="content-preview-list">
            ${preview.items.map((item) => `
              <details class="preview-doc-block">
                <summary><span>${esc(item.title)}</span><small>${esc(item.meta)}</small><b class="expand-label"></b></summary>
                <article class="markdown-reader compact">
                  ${markdownToHtml(item.content || "该文档暂无正文内容。")}
                </article>
              </details>`).join("")}
          </div>`}
      </section>
    </div>`;
}

function markdownInline(text: string): string {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  let listType: "ul" | "ol" | "" = "";
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = "";
    }
  };
  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${esc(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuffer.push(line);
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      html.push(`<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${markdownInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${markdownInline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      return;
    }
    if (trimmed.startsWith(">")) {
      closeList();
      html.push(`<blockquote>${markdownInline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      return;
    }
    if (/^-{3,}$/.test(trimmed)) {
      closeList();
      html.push("<hr />");
      return;
    }
    closeList();
    html.push(`<p>${markdownInline(trimmed)}</p>`);
  });
  if (inCode) html.push(`<pre><code>${esc(codeBuffer.join("\n"))}</code></pre>`);
  closeList();
  return html.join("");
}

function kbCard(kb: KnowledgeBase): string {
  const usedBy = publishedMcpServicesUsingKnowledgeBase(kb);
  const canDelete = usedBy.length === 0;
  return `
    <article class="kb-card">
      <div class="kb-card-top">
        <span class="kb-icon">KB</span>
        <div class="title">${esc(kb.name)}</div>
        <div class="brief">${esc(kb.description || "未填写描述")}</div>
        <div class="stat-row">${kb.document_ids.length} 份文档 · ${kb.status} · ${kb.latest_ready_revision_id || "未构建"}</div>
      </div>
      <div class="kb-card-foot">
        <button class="btn btn-outline btn-sm" type="button" data-kb-preview="${kb.id}">预览知识库</button>
        <button data-build="${kb.id}" type="button">构建新版本</button>
        <button class="btn btn-danger btn-sm" type="button" data-kb-delete="${kb.id}" ${canDelete ? "" : "disabled"} title="${canDelete ? "删除该知识库，保留原始文档" : `被上架 MCP 使用：${usedBy.map((svc) => svc.name).join("、")}`}">删除知识库</button>
      </div>
    </article>`;
}

function publishedMcpServicesUsingKnowledgeBase(kb: KnowledgeBase): ServiceInfo[] {
  const revisionIds = new Set(kb.revisions.map((revision) => revision.id));
  if (kb.latest_ready_revision_id) revisionIds.add(kb.latest_ready_revision_id);
  return state.services.filter((svc) => {
    if (svc.runtime_status !== "published") return false;
    const activeRevisionId = svc.active_revision?.knowledge_base_revision_id || "";
    return revisionIds.has(activeRevisionId);
  });
}

function knowledgeBasesUsingDocument(documentId: string): KnowledgeBase[] {
  return state.knowledgeBases.filter((kb) => kb.document_ids.includes(documentId));
}

function publishedMcpServicesUsingDocument(documentId: string): ServiceInfo[] {
  const kbsWithDoc = knowledgeBasesUsingDocument(documentId);
  const serviceIds = new Set<string>();
  kbsWithDoc.forEach((kb) => publishedMcpServicesUsingKnowledgeBase(kb).forEach((svc) => serviceIds.add(svc.id)));
  state.services.forEach((svc) => {
    if (svc.runtime_status !== "published") return;
    if ((svc.draft_config.resources.document_ids || []).includes(documentId)) serviceIds.add(svc.id);
  });
  return state.services.filter((svc) => serviceIds.has(svc.id));
}

function servicesView(): string {
  const editing = currentService();
  return `
    <section class="wizard-shell">
      <div class="wizard-grid">
        <div class="wizard-main">${mcpStepBody(editing)}</div>
        <aside class="wizard-side">
          <h4>构建流程</h4>
          <div class="steps-vertical">
            ${step(1, "定义 MCP", "名称、简介、创建者")}
            ${step(2, "选择资料", "新文档 + 已有知识库")}
            ${step(3, "构建 MCP 知识库", "生成不可变版本")}
            ${step(4, "配置能力", "Tools / Resources / Prompts")}
            ${step(5, "发布接入", "协议与鉴权")}
            ${step(6, "构建预览", "冻结快照预览")}
            ${step(7, "MCP 测试", "候选配置冒烟")}
            ${step(8, "正式发布", "生成不可变 MCP")}
          </div>
          <h4>当前配置摘要</h4>
          <div class="summary-item"><span class="k">MCP 名称</span><span class="v">${esc(state.mcpName || editing?.name || "未填写")}</span></div>
          <div class="summary-item"><span class="k">创建者</span><span class="v">${esc(state.mcpCreator || state.currentUser?.display_name || "未填写")}</span></div>
          <div class="summary-item"><span class="k">正在编辑</span><span class="v">${editing ? esc(editing.name) : "新服务草稿"}</span></div>
          <div class="summary-item"><span class="k">知识库版本</span><span class="v">${esc(activeWizardRevisionId() || "未选择")}</span></div>
          <div class="summary-item"><span class="k">来源</span><span class="v">${state.selectedDocs.size} 份新文档 · ${state.mcpSelectedKbIds.size} 个已有知识库</span></div>
          <div class="summary-item"><span class="k">发布方式</span><span class="v">Streamable HTTP · Bearer API Key</span></div>
          <div class="autosave-line"><span class="dot-pulse"></span> 第 8 步发布后才会生成不可变 MCP 版本</div>
        </aside>
      </div>
    </section>`;
}

function myMcpView(): string {
  const selected = state.services.find((svc) => svc.id === state.myMcpSelectedId);
  if (!selected && state.myMcpSelectedId) state.myMcpSelectedId = "";
  const rows = state.services.map((svc) => `${serviceRow(svc)}${svc.id === state.myMcpSelectedId ? serviceReadonlyPanel(svc) : ""}`).join("");
  return `
    <section class="panel">
      <div class="row-between">
        <div><h2>我的 MCP</h2><p>查看 MCP 服务草稿和发布状态，创建 API Key，复制模型接入信息。</p></div>
        <span class="muted">${state.services.length} 个服务</span>
      </div>
      <div class="my-mcp-layout">
        <div class="list-panel">${rows || empty("还没有 MCP 服务", "先保存一个服务草稿。")}</div>
      </div>
    </section>`;
}

function mcpStepBody(editing?: ServiceInfo): string {
  if (state.mcpStep === 1) return defineMcpStep();
  if (state.mcpStep === 2) return sourceStep();
  if (state.mcpStep === 3) return buildKbStep();
  if (state.mcpStep === 4) return capabilityStep(editing);
  if (state.mcpStep === 5) return accessStep();
  if (state.mcpStep === 6) return previewStep(editing);
  if (state.mcpStep === 7) return testStep();
  return publishStep(editing);
}

function abilityTab(tab: "tools" | "resources" | "prompts", label: string, count: number): string {
  return `<button class="ability-tab ${state.serviceConfigTab === tab ? "active" : ""}" type="button" data-config-tab="${tab}"><b>${label}</b><span>${count} 项已选</span></button>`;
}

function step(n: number, label: string, sub: string): string {
  const cls = n < state.mcpStep ? "done" : n === state.mcpStep ? "current" : "";
  return `<button class="step-node ${cls}" type="button" data-mcp-step="${n}"><span class="circle">${n}</span><span><b class="label">${label}</b><small class="sub">${sub}</small></span></button>`;
}

function defineMcpStep(): string {
  return `
    <div class="section-head"><div><h3>第一步：定义这个 MCP</h3><p>先确定商品化展示与发布预览中的基础信息。</p></div></div>
    <div class="field-row">
      <div class="field"><label>MCP 名称</label><input id="mcpName" type="text" maxlength="50" value="${esc(state.mcpName)}" placeholder="例如：产品文档 MCP 服务" /></div>
      <div class="field"><label>创建者</label><input id="mcpCreator" type="text" maxlength="80" value="${esc(state.mcpCreator || state.currentUser?.display_name || "")}" placeholder="例如：Cathy / Docs Team" /></div>
    </div>
    <div class="field"><label>MCP 简介</label><textarea id="mcpIntro" rows="5" maxlength="500" placeholder="说明这个 MCP 覆盖的知识范围、适用场景和使用边界。">${esc(state.mcpIntro)}</textarea></div>
    <div class="wizard-nav"><button class="btn btn-primary" type="button" id="saveMcpMetaBtn">保存基础信息，选择资料</button></div>`;
}

function sourceStep(): string {
  return `
    <div class="section-head"><div><h3>第二步：同时选择新的文档和现有知识库</h3><p>两类来源可以叠加；下一步会把它们合并成一个新的不可变 MCP 知识库版本。</p></div></div>
    <div class="source-grid">
      <section class="source-card ${state.selectedDocs.size ? "active" : ""}">
        <div class="source-card-head">
          <b>文档库</b>
          <span>${state.selectedDocs.size} / ${state.documents.length} 份已选</span>
        </div>
        <form id="sourceUploadForm" class="source-upload">
          <input id="sourceFiles" type="file" accept=".md,.markdown,text/markdown" multiple />
          <button class="btn btn-outline btn-sm" type="submit">上传并勾选</button>
        </form>
        <div class="source-tools">
          <input id="sourceDocQuery" type="search" value="${esc(state.sourceDocQuery)}" placeholder="搜索文档名称 / ID" />
          <button class="btn btn-outline btn-sm" type="button" data-source-action="docs-clear">清空</button>
        </div>
        <div class="source-scroll" role="listbox" aria-label="文档库选择">${documentSourceCheckboxes()}</div>
      </section>
      <section class="source-card ${state.mcpSelectedKbIds.size ? "active" : ""}">
        <div class="source-card-head">
          <b>已有知识库</b>
          <span>${state.mcpSelectedKbIds.size} / ${readyKnowledgeBases().length} 个已选</span>
        </div>
        <div class="source-tools">
          <input id="sourceKbQuery" type="search" value="${esc(state.sourceKbQuery)}" placeholder="搜索知识库名称 / 版本" />
          <button class="btn btn-outline btn-sm" type="button" data-source-action="kbs-clear">清空</button>
        </div>
        <div class="source-scroll" role="listbox" aria-label="知识库选择">${existingKbCheckboxes()}</div>
      </section>
    </div>
    <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="1">上一步</button><button class="btn btn-primary" type="button" data-next-step="3">下一步：构建 MCP 知识库</button></div>`;
}

function documentSourceCheckboxes(): string {
  const query = state.sourceDocQuery.trim().toLowerCase();
  const docs = state.documents.filter((doc) => {
    const haystack = `${doc.title} ${doc.original_name} ${doc.id}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (!state.documents.length) return '<div class="source-empty">还没有文档，可以直接在上方上传 Markdown。</div>';
  if (!docs.length) return '<div class="source-empty">没有匹配的文档。</div>';
  return docs.map((doc) => `
    <label class="tree-node source-option" data-source-kind="doc" data-source-text="${esc(`${doc.title} ${doc.original_name} ${doc.id}`.toLowerCase())}">
      <input type="checkbox" data-doc="${doc.id}" ${state.selectedDocs.has(doc.id) ? "checked" : ""} />
      <span>${esc(doc.title || doc.original_name)}</span>
      <small>${esc(doc.original_name)} · ${doc.id}</small>
    </label>`).join("");
}

function readyKnowledgeBases(): KnowledgeBase[] {
  return state.knowledgeBases.filter((kb) => kb.latest_ready_revision_id);
}

function reusableSelectedKnowledgeBase(): KnowledgeBase | undefined {
  if (state.selectedDocs.size || state.mcpSelectedKbIds.size !== 1) return undefined;
  const [kbId] = [...state.mcpSelectedKbIds];
  return state.knowledgeBases.find((kb) => kb.id === kbId && kb.latest_ready_revision_id);
}

function existingKbCheckboxes(): string {
  const query = state.sourceKbQuery.trim().toLowerCase();
  const ready = readyKnowledgeBases();
  const kbs = ready.filter((kb) => {
    const haystack = `${kb.name} ${kb.description} ${kb.id} ${kb.latest_ready_revision_id}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (!ready.length) return '<div class="source-empty">还没有可用知识库版本。</div>';
  if (!kbs.length) return '<div class="source-empty">没有匹配的知识库。</div>';
  return kbs.map((kb) => `
    <label class="tree-node source-option" data-source-kind="kb" data-source-text="${esc(`${kb.name} ${kb.description} ${kb.id} ${kb.latest_ready_revision_id}`.toLowerCase())}">
      <input type="checkbox" data-source-kb="${kb.id}" ${state.mcpSelectedKbIds.has(kb.id) ? "checked" : ""} />
      <span>${esc(kb.name)}</span>
      <small>${kb.document_ids.length} 份文档 · ${esc(kb.latest_ready_revision_id || "")}</small>
    </label>`).join("");
}

function selectedKnowledgeBases(): KnowledgeBase[] {
  return [...state.mcpSelectedKbIds]
    .map((id) => state.knowledgeBases.find((kb) => kb.id === id))
    .filter((kb): kb is KnowledgeBase => Boolean(kb));
}

function selectedSourceDocumentIds(): string[] {
  const kbDocIds = selectedKnowledgeBases().flatMap((kb) => kb.document_ids);
  return [...new Set([...state.selectedDocs, ...kbDocIds])];
}

function documentPreviewList(documentIds: string[]): string {
  if (!documentIds.length) return '<div class="source-empty">还没有可用于构建的文档。</div>';
  return documentIds.map((id) => {
    const doc = state.documents.find((item) => item.id === id);
    const fromDirect = state.selectedDocs.has(id);
    const kbSources = selectedKnowledgeBases().filter((kb) => kb.document_ids.includes(id)).map((kb) => kb.name);
    const source = [fromDirect ? "直接选择" : "", ...kbSources].filter(Boolean).join(" / ") || "未知来源";
    return `
      <div class="tree-node source-option build-doc-row">
        <span class="kb-icon">MD</span>
        <span>${esc(doc?.title || doc?.original_name || id)}</span>
        <small>${esc(source)} · ${esc(doc?.original_name || id)}</small>
      </div>`;
  }).join("");
}

function buildKbStep(): string {
  const reusableKb = reusableSelectedKnowledgeBase();
  const selectedKbs = selectedKnowledgeBases();
  const documentIds = reusableKb ? reusableKb.document_ids : selectedSourceDocumentIds();
  const modeLabel = reusableKb ? "复用已有不可变版本" : "合并并构建新版本";
  const versionLabel = reusableKb?.latest_ready_revision_id || activeWizardRevisionId() || "尚未生成";
  const notice = reusableKb
    ? `当前只选择了一个已有知识库，确认后会直接绑定版本 ${reusableKb.latest_ready_revision_id}，不重复构建。`
    : "系统会合并直接选择的文档和所选知识库中的文档，去重后生成新的不可变 MCP 知识库版本。";
  return `
    <div class="section-head"><div><h3>第三步：构建新的不可变 MCP 知识库</h3><p>系统会冻结合并后的文档清单、内容哈希和切片索引。服务发布后只引用这个明确版本。</p></div></div>
    <div class="build-panel">
      <div class="build-summary-grid">
        ${previewItem("处理方式", modeLabel)}
        ${previewItem("直接选择文档", `${state.selectedDocs.size} 份`)}
        ${previewItem("已有知识库", `${selectedKbs.length} 个`)}
        ${previewItem("合并后文档", `${documentIds.length} 份`)}
        ${previewItem("目标版本", versionLabel)}
        ${previewItem("来源状态", reusableKb ? reusableKb.status : "待构建")}
      </div>
      <div class="build-source-block">
        <h4>已选知识库</h4>
        <div class="build-chip-row">
          ${selectedKbs.map((kb) => `<span class="source-chip">${esc(kb.name)} · ${kb.document_ids.length} 份 · ${esc(kb.latest_ready_revision_id || "未构建")}</span>`).join("") || '<span class="source-chip muted">未选择已有知识库</span>'}
        </div>
      </div>
      <div class="build-source-block">
        <h4>将进入 MCP 知识库的文档</h4>
        <div class="source-scroll build-doc-list" role="list" aria-label="将进入 MCP 知识库的文档">
          ${documentPreviewList(documentIds)}
        </div>
      </div>
      <div class="notice-banner info">${esc(notice)}</div>
    </div>
    <div class="wizard-nav">
      <button class="btn btn-outline" type="button" data-prev-step="2">上一步</button>
      <button class="btn btn-primary" type="button" id="buildMcpKbBtn">${reusableKb ? "确认复用该知识库版本" : "构建新的不可变 MCP 知识库"}</button>
      ${activeWizardRevisionId() ? '<button class="btn btn-outline" type="button" data-next-step="4">继续配置能力</button>' : ""}
    </div>`;
}

function capabilityStep(editing?: ServiceInfo): string {
  const selectedToolCount = (editing?.draft_config.tools || []).filter((item) => item.enabled).length || 3;
  const selectedResourceCount = editing?.draft_config.resources.document_ids?.length || selectedKb()?.document_ids.length || 0;
  const selectedPromptCount = (editing?.draft_config.prompts || []).filter((item) => item.enabled).length || 2;
  return `
    <form id="serviceForm">
      <div class="section-head"><div><h3>第四步：配置 Tools、Resources、Prompts</h3><p>这里保存的是服务草稿；发布前可以反复调整。</p></div></div>
      <div class="field-row">
        <div class="field"><label>服务名称</label><input id="serviceName" type="text" value="${esc(editing?.name || state.mcpName || "产品文档 MCP 服务")}" maxlength="50" /></div>
        <div class="field"><label>绑定 MCP 知识库版本</label><select id="serviceKbRevision">${readyRevisionOptions(activeWizardRevisionId() || editing?.draft_config.knowledge_base_revision_id)}</select></div>
      </div>
      <input id="editingServiceId" type="hidden" value="${esc(state.editingServiceId)}" />
      <div class="ability-tabs">
        ${abilityTab("tools", "Tools 智能契约", selectedToolCount)}
        ${abilityTab("resources", "Resources 数据源", selectedResourceCount)}
        ${abilityTab("prompts", "Prompts 工作流", selectedPromptCount)}
      </div>
      <div class="builder">
        <section class="capability-panel ${state.serviceConfigTab === "tools" ? "active" : ""}" data-config-panel="tools"><div class="section-head"><div><h3>Tools 智能契约</h3><p>选择模型可调用的只读工具。</p></div></div><div class="template-grid">${toolCards(editing?.draft_config.tools)}</div></section>
        <section class="capability-panel ${state.serviceConfigTab === "resources" ? "active" : ""}" data-config-panel="resources"><div class="section-head"><div><h3>Resources 数据源</h3><p>控制资源列表、URI 模板和兼容工具包装。</p></div></div><div class="config-list">${resourceCards(editing?.draft_config.resources)}</div></section>
        <section class="capability-panel ${state.serviceConfigTab === "prompts" ? "active" : ""}" data-config-panel="prompts"><div class="section-head"><div><h3>Prompts 工作流</h3><p>选择可复用提示词模板。</p></div></div><div class="template-grid">${promptCards(editing?.draft_config.prompts)}</div></section>
      </div>
      <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="3">上一步</button><button class="btn btn-primary" type="submit">保存草稿并继续</button></div>
    </form>`;
}

function accessStep(): string {
  return `
    <div class="section-head"><div><h3>第五步：选择发布接入方式</h3><p>MVP 固定为 Streamable HTTP + 服务级 Bearer API Key；这里选择 Key 有效期和兼容策略。</p></div></div>
    <div class="field-row">
      <div class="field"><label>传输协议</label><input value="Streamable HTTP · MCP-Protocol-Version 2026-07-28" disabled /></div>
      <div class="field"><label>API Key 有效期（天）</label><input id="accessKeyDays" type="number" min="1" max="365" value="${state.accessKeyDays}" /></div>
    </div>
    <div class="notice-banner info">发布后会生成稳定地址 /mcp/{service_id}；密钥明文只显示一次。</div>
    <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="4">上一步</button><button class="btn btn-primary" type="button" id="saveAccessBtn">保存接入设置</button></div>`;
}

function previewStep(editing?: ServiceInfo): string {
  const draft = editing?.draft_config;
  return `
    <div class="section-head"><div><h3>第六步：生成 MCP 构建预览</h3><p>发布前确认冻结范围、能力列表、创建者和接入方式。</p></div></div>
    <div class="preview-grid">
      ${previewItem("MCP 名称", state.mcpName || editing?.name || "未填写")}
      ${previewItem("简介", state.mcpIntro || editing?.description || "未填写")}
      ${previewItem("创建者", state.mcpCreator || state.currentUser?.display_name || "未填写")}
      ${previewItem("知识库版本", activeWizardRevisionId() || "未选择")}
      ${previewItem("Tools", String(draft?.tools.filter((x) => x.enabled).length || 0))}
      ${previewItem("Resources", String(draft?.resources.document_ids?.length || 0))}
      ${previewItem("Prompts", String(draft?.prompts.filter((x) => x.enabled).length || 0))}
      ${previewItem("接入方式", `HTTP + Bearer Key · ${state.accessKeyDays} 天`)}
      ${previewItem("发布性质", "生成不可变 Service Revision")}
    </div>
    <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="5">上一步</button><button class="btn btn-primary" type="button" data-next-step="7">进入 MCP 测试</button></div>`;
}

function previewItem(label: string, value: string): string {
  return `<div class="preview-item"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function testStep(): string {
  return `
    <div class="section-head"><div><h3>第七步：进行 MCP 测试</h3><p>通过受保护的草稿测试通道验证候选配置，不发布、不覆盖当前线上版本。</p></div></div>
    <div class="toolbar"><select id="draftTestMethod">${["server/discover", "tools/list", "resources/templates/list", "prompts/list"].map((m) => `<option>${m}</option>`).join("")}</select><button class="btn btn-primary" type="button" id="runDraftTestBtn">运行草稿测试</button></div>
    <pre class="result">${esc(state.draftTestResult || "测试结果会显示在这里")}</pre>
    <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="6">上一步</button><button class="btn btn-primary" type="button" data-next-step="8">测试通过，准备发布</button></div>`;
}

function publishStep(editing?: ServiceInfo): string {
  const serviceId = state.editingServiceId || editing?.id || "";
  return `
    <div class="section-head"><div><h3>第八步：发布生成不可变 MCP</h3><p>发布会原子生成 Service Revision，外部客户端只读取该冻结版本。</p></div></div>
    <div class="notice-banner info">发布成功后会自动创建 API Key，并在下方生成可复制的调用信息。请求头格式是 Bearer 后直接跟 Key，不需要尖括号。</div>
    <div class="preview-grid">
      ${previewItem("MCP 名称", state.mcpName || editing?.name || "未保存草稿")}
      ${previewItem("简介", state.mcpIntro || "未填写")}
      ${previewItem("创建者", state.mcpCreator || state.currentUser?.display_name || "未填写")}
      ${previewItem("知识库版本", activeWizardRevisionId() || "未选择")}
      ${previewItem("测试状态", state.draftTestResult ? "已有草稿测试结果" : "尚未运行草稿测试")}
    </div>
    <div class="wizard-nav"><button class="btn btn-outline" type="button" data-prev-step="7">上一步</button><button class="btn btn-primary" type="button" id="finalPublishBtn">发布不可变 MCP</button></div>
    ${publishConnectionPanel(serviceId)}`;
}

function toolCards(saved: ToolConfig[] = []): string {
  return toolPresets.map((tool) => {
    const existing = saved.find((item) => item.preset_id === tool.id || (!item.preset_id && item.template === tool.template && item.name === tool.defaultName));
    const enabled = existing?.enabled ?? ["search_general", "read_document", "list_catalog"].includes(tool.id);
    const badges = [tool.executionMode, tool.interactionDepth, tool.hints.long_running ? "long_running" : "short", "structured_output"].join(" · ");
    return `
      <article class="template-card">
        <div class="template-main">
          <label class="checkline"><input type="checkbox" data-tool-enabled="${tool.id}" ${enabled ? "checked" : ""} /><b>${esc(tool.title)}</b></label>
          <p>${esc(tool.description)}</p>
          <div class="arg-row">${badges.split(" · ").map((badge) => `<span class="arg-pill">${esc(badge)}</span>`).join("")}</div>
        </div>
        <details class="template-details">
          <summary>公开名称与契约</summary>
          <input data-tool-name="${tool.id}" value="${esc(existing?.name || tool.defaultName)}" />
          <textarea data-tool-desc="${tool.id}" rows="2">${esc(existing?.description || tool.description)}</textarea>
          <pre class="schema">${esc(pretty(tool.schema))}</pre>
        </details>
      </article>`;
  }).join("");
}

function resourceCards(resources: ResourceConfig = {}): string {
  const kb = selectedKb();
  const ids = kb?.document_ids || [];
  const selected = new Set(resources.document_ids || ids);
  return `
    ${toggle("resourceCatalog", "可枚举知识库目录", "公开 catalog 并允许 resources/list 枚举。", resources.catalog_enabled ?? true)}
    ${toggle("resourceUriTemplates", "URI 模板", "公开 kb://.../documents/{document_id}/chunks/{chunk_id}。", resources.uri_templates_enabled ?? true)}
    ${toggle("resourcesAsTools", "Resources-as-Tools", "为不支持 Resources 的客户端生成兼容工具。", resources.as_tools_enabled ?? false)}
    <article class="config-card muted"><b>实时同步模板</b><span class="meta">Subscriptions 和 listChanged 需要推送通道，本 MVP 不对外宣告。</span></article>
    ${ids.map((id) => {
      const doc = state.documents.find((item) => item.id === id);
      return `<label class="tree-node"><input type="checkbox" data-resource-doc="${id}" ${selected.has(id) ? "checked" : ""} /><span>${esc(doc?.title || id)}</span><small>${id}</small></label>`;
    }).join("") || '<div class="meta">请先构建知识库版本。</div>'}`;
}

function toggle(id: string, title: string, desc: string, checked: boolean): string {
  return `<article class="export-toggle-row"><span><b>${title}</b><small>${desc}</small></span><label class="switch"><input id="${id}" type="checkbox" ${checked ? "checked" : ""} /><span class="track"></span></label></article>`;
}

function promptCards(saved: PromptConfig[] = []): string {
  return promptPresets.map((promptItem) => {
    const existing = saved.find((item) => item.preset_id === promptItem.id || item.template === promptItem.template);
    const enabled = existing?.enabled ?? ["answer_from_knowledge", "summarize_document"].includes(promptItem.id);
    const args = Object.entries(promptItem.arguments).map(([name, spec]) => `<span class="arg-pill">{{${name}}}：${esc(spec.description)}</span>`).join("");
    const extra = promptItem.messages ? `<span class="arg-pill">多消息：${promptItem.messages.length} 条</span>` : "";
    return `
      <article class="template-card">
        <div class="template-main">
          <label class="checkline"><input type="checkbox" data-prompt-enabled="${promptItem.id}" ${enabled ? "checked" : ""} /><b>${esc(promptItem.title)}</b></label>
          <p>${esc(promptItem.description)}</p>
          <div class="arg-row"><span class="arg-pill">${esc(promptItem.dependency)}</span>${extra}</div>
        </div>
        <details class="template-details">
          <summary>变量与模板正文</summary>
          <span class="meta">双大括号是占位符，不是代码；调用 prompts/get 时会替换。</span>
          <input data-prompt-name="${promptItem.id}" value="${esc(existing?.name || promptItem.defaultName)}" />
          <textarea data-prompt-desc="${promptItem.id}" rows="2">${esc(existing?.description || promptItem.description)}</textarea>
          <div class="arg-row">${args}<button class="chip" type="button" data-token="{{search_tool_name}}" data-prompt="${promptItem.id}">插入搜索工具名</button></div>
          <textarea data-prompt-template="${promptItem.id}" rows="5">${esc(existing?.template_text || promptItem.templateText)}</textarea>
        </details>
      </article>`;
  }).join("");
}

function serviceRow(svc: ServiceInfo): string {
  const status = serviceStatusText(svc);
  const hasPublishedRevision = Boolean(svc.active_revision_id);
  const isLive = svc.runtime_status === "published";
  const isPaused = svc.runtime_status === "paused";
  const isSelected = state.myMcpSelectedId === svc.id;
  return `
    <article class="list-row my-mcp-row ${isSelected ? "selected" : ""}">
      <div class="main">
        <div class="name">${esc(svc.name)} <span class="status-badge ${serviceStatusClass(svc)}">${status}</span></div>
        <div class="sub-line">${svc.id} · 当前版本 ${svc.active_revision_id || "未发布"}</div>
        <div class="actions">
          <button class="btn btn-outline btn-sm" data-view-mcp="${svc.id}">载入配置</button>
          ${hasPublishedRevision ? "" : `<button class="btn btn-primary btn-sm" data-publish="${svc.id}">发布</button>`}
          ${isLive ? `<button class="btn btn-outline btn-sm" data-pause="${svc.id}">下架 MCP</button>` : ""}
          ${isPaused ? `<button class="btn btn-outline btn-sm" data-resume="${svc.id}">重新上架</button>` : ""}
          <button class="btn btn-danger btn-sm" data-delete-service="${svc.id}">删除 MCP</button>
        </div>
      </div>
      <div class="mcp-metrics">${statBlock("Tools", svc.draft_config.tools.filter((x) => x.enabled).length)}${statBlock("Resources", svc.draft_config.resources.document_ids?.length || 0)}${statBlock("Prompts", svc.draft_config.prompts.filter((x) => x.enabled).length)}</div>
    </article>`;
}

function statBlock(label: string, value: number): string {
  return `<div class="stat-block"><b>${value}</b><span>${label}</span></div>`;
}

function serviceStatusText(svc: ServiceInfo): string {
  if (svc.runtime_status === "published") return "已发布";
  if (svc.runtime_status === "paused") return "已下架";
  return "未发布";
}

function serviceStatusClass(svc: ServiceInfo): string {
  if (svc.runtime_status === "published") return "";
  if (svc.runtime_status === "paused") return "off";
  return "draft";
}

function serviceMeta(svc: ServiceInfo): { intro: string; creator: string } {
  const lines = svc.description.split("\n");
  const intro = lines.find((line) => line.startsWith("简介："))?.replace("简介：", "").trim();
  const creator = lines.find((line) => line.startsWith("创建者："))?.replace("创建者：", "").trim();
  return {
    intro: intro && intro !== "未填写" ? intro : "未填写",
    creator: creator && creator !== "未填写" ? creator : "未填写",
  };
}

function serviceReadonlyPanel(svc: ServiceInfo): string {
  const meta = serviceMeta(svc);
  const hasPublishedRevision = Boolean(svc.active_revision_id);
  const isLive = svc.runtime_status === "published";
  const isPaused = svc.runtime_status === "paused";
  const connection = state.serviceConnectionInfo[svc.id] || "";
  return `
    <section class="mcp-readonly-panel">
      <div class="section-head">
        <div>
          <h3>${esc(svc.name)}</h3>
          <p>只读配置展示页。这里展示当前 MCP 草稿配置与发布状态，不会修改 Tools、Resources 或 Prompts。</p>
        </div>
        <span class="status-badge ${serviceStatusClass(svc)}">${serviceStatusText(svc)}</span>
      </div>
      <div class="preview-grid">
        ${previewItem("MCP ID", svc.id)}
        ${previewItem("MCP 名称", svc.name)}
        ${previewItem("简介", meta.intro)}
        ${previewItem("创建者", meta.creator)}
        ${previewItem("绑定知识库版本", svc.draft_config.knowledge_base_revision_id || "未绑定")}
        ${previewItem("已发布版本", svc.active_revision_id || "未发布")}
        ${previewItem("运行状态", serviceStatusText(svc))}
        ${previewItem("更新时间", svc.updated_at)}
      </div>
      <div class="readonly-sections">
        ${readonlyCapabilityBlock("Tools", svc.draft_config.tools.filter((tool) => tool.enabled).map((tool) => readonlyCapabilityItem(tool.name, tool.description, [tool.execution_mode || "synchronous", tool.interaction_depth || "single_call"])))}
        ${readonlyResourceBlock(svc)}
        ${readonlyCapabilityBlock("Prompts", svc.draft_config.prompts.filter((prompt) => prompt.enabled).map((prompt) => readonlyCapabilityItem(prompt.name, prompt.description, Object.keys(prompt.arguments || {}).map((argName) => `参数：${argName}`))))}
      </div>
      <div class="connection-card readonly-connection">
        <div class="section-head">
          <div><h3>连接信息与密钥</h3><p>${isLive ? "连接信息和新创建的 API Key 会显示在当前 MCP 下方。" : isPaused ? "该 MCP 已下架，外部 /mcp/{service_id} 调用会返回服务已暂停；可重新上架后继续使用。" : "未发布 MCP 暂不能生成有效连接信息，请先发布。"} API Key 明文只显示一次。</p></div>
        </div>
        <div class="actions">
          ${isLive ? `<button class="btn btn-outline btn-sm" data-conn="${svc.id}">显示连接信息</button><button class="btn btn-primary btn-sm" data-key="${svc.id}">创建密钥</button><button class="btn btn-outline btn-sm" data-pause="${svc.id}">下架 MCP</button>` : ""}
          ${isPaused ? `<button class="btn btn-outline btn-sm" data-resume="${svc.id}">重新上架</button>` : ""}
          ${!hasPublishedRevision ? `<button class="btn btn-primary btn-sm" data-publish="${svc.id}">发布 MCP</button>` : ""}
        </div>
        <pre class="result">${esc(connection || (isLive ? "点击“显示连接信息”或“创建密钥”后，内容会显示在这里。" : isPaused ? "该 MCP 已下架，当前不可调用；重新上架后可继续使用原服务地址。" : "发布后这里会展示 /mcp/{service_id}、请求头、curl 示例和 stdio 配置。"))}</pre>
      </div>
    </section>`;
}

function readonlyCapabilityBlock(title: string, items: string[]): string {
  return `
    <section class="readonly-block">
      <div class="readonly-block-head"><b>${esc(title)}</b><span>${items.length} 项已启用</span></div>
      <div class="readonly-list">${items.join("") || '<div class="source-empty">没有启用项。</div>'}</div>
    </section>`;
}

function readonlyResourceBlock(svc: ServiceInfo): string {
  const resources = svc.draft_config.resources || {};
  const items = [
    readonlyCapabilityItem("可枚举目录", resources.catalog_enabled ? "已开启 resources/list 文档目录枚举。" : "未开启。", []),
    readonlyCapabilityItem("URI 模板", resources.uri_templates_enabled ? "已开启 kb://... 参数化访问。" : "未开启。", []),
    readonlyCapabilityItem("Resources-as-Tools", resources.as_tools_enabled ? "已开启兼容工具包装。" : "未开启。", []),
    ...(resources.document_ids || []).map((id) => {
      const doc = state.documents.find((item) => item.id === id);
      return readonlyCapabilityItem(doc?.title || id, doc?.original_name || id, ["资源文档"]);
    }),
  ];
  return readonlyCapabilityBlock("Resources", items);
}

function readonlyCapabilityItem(name: string, description: string, tags: string[]): string {
  return `
    <article class="readonly-item">
      <b>${esc(name)}</b>
      <span>${esc(description || "未填写描述")}</span>
      ${tags.length ? `<small>${tags.map((tag) => esc(tag)).join(" · ")}</small>` : ""}
    </article>`;
}

const consoleMethodGuides: ConsoleMethodGuide[] = [
  {
    id: "server/discover",
    title: "能力发现",
    does: "读取该 MCP 服务当前发布版本、协议版本、服务状态以及它开放了 Tools / Resources / Prompts 中哪些能力。",
    input: "通常不需要参数，适合第一步验证服务是否发布、Key 是否有效。",
    output: "返回 protocolVersion、serverInfo、capabilities 和 service revision。",
    defaultParams: {},
  },
  {
    id: "tools/list",
    title: "列出工具",
    does: "查看模型可以调用的工具清单，以及每个工具的 inputSchema、outputSchema、执行模式和行为注解。",
    input: "通常不需要参数。",
    output: "返回 tools 数组。可用它确认 search_knowledge、get_document 等工具是否已经发布。",
    defaultParams: {},
  },
  {
    id: "tools/call",
    title: "调用工具",
    does: "真正执行某个 Tool。常见用法是调用 search_knowledge 检索文档，或 get_document 读取文档正文。",
    input: "必须填写工具公开名称 name；arguments 根据工具 schema 填写。例如 search_knowledge 需要 query 和 top_k。",
    output: "返回 content 文本和 structuredContent 结构化结果。搜索工具会返回命中的文件名、标题路径、行号和片段。",
    defaultParams: { name: "search_knowledge", arguments: { query: "智能路由", top_k: 5 } },
  },
  {
    id: "resources/list",
    title: "列出资源",
    does: "列出该 MCP 服务开放的 Resources，例如文档目录、文档片段 URI。",
    input: "可选 cursor 和 page_size，用于分页。",
    output: "返回 resources 数组和 nextCursor。每个资源有 uri、name、mimeType。",
    defaultParams: { page_size: 10 },
  },
  {
    id: "resources/read",
    title: "读取资源",
    does: "根据 resources/list 或 URI 模板得到的 uri 读取具体资源内容。",
    input: "必须填写 uri，例如 kb://.../documents/{document_id}/chunks/{chunk_id}。",
    output: "返回 contents 数组，通常包含 text/markdown 内容。",
    defaultParams: { uri: "kb://<service_id>/<revision_id>/documents/<document_id>/chunks/<chunk_id>" },
  },
  {
    id: "resources/templates/list",
    title: "列出资源 URI 模板",
    does: "查看服务是否开放参数化资源模板，供客户端按 document_id、chunk_id 拼接资源 URI。",
    input: "通常不需要参数。",
    output: "返回 resourceTemplates 数组，包含 uriTemplate、name、description、mimeType。",
    defaultParams: {},
  },
  {
    id: "prompts/list",
    title: "列出提示词",
    does: "查看服务发布的 Prompt 模板，包括参数、描述、补全建议和多消息数量。",
    input: "通常不需要参数。",
    output: "返回 prompts 数组。可用它确认 answer_from_knowledge、summarize_document 等模板是否可用。",
    defaultParams: {},
  },
  {
    id: "prompts/get",
    title: "渲染提示词",
    does: "按名称和参数渲染一个 Prompt，得到模型可直接使用的一组消息。",
    input: "必须填写 name；arguments 中填对应参数，例如 question、document_id、topic。",
    output: "返回 description 和 messages。messages 是多轮结构，适合直接交给模型上下文。",
    defaultParams: { name: "answer_from_knowledge", arguments: { question: "智能路由是什么？" } },
  },
];

function consoleGuide(method = state.consoleMethod): ConsoleMethodGuide {
  return consoleMethodGuides.find((item) => item.id === method) || consoleMethodGuides[0];
}

function enabledToolNamesForConsole(): string[] {
  const serviceId = document.querySelector<HTMLSelectElement>("#consoleService")?.value || state.consoleServiceId || state.services.find((svc) => svc.active_revision_id)?.id || "";
  const service = state.services.find((svc) => svc.id === serviceId) || state.services.find((svc) => svc.active_revision_id);
  const names = service?.draft_config.tools.filter((tool) => tool.enabled).map((tool) => tool.name) || [];
  return names.length ? names : ["search_knowledge", "get_document", "list_documents"];
}

function enabledPromptNamesForConsole(): string[] {
  const serviceId = document.querySelector<HTMLSelectElement>("#consoleService")?.value || state.consoleServiceId || state.services.find((svc) => svc.active_revision_id)?.id || "";
  const service = state.services.find((svc) => svc.id === serviceId) || state.services.find((svc) => svc.active_revision_id);
  const names = service?.draft_config.prompts.filter((prompt) => prompt.enabled).map((prompt) => prompt.name) || [];
  return names.length ? names : ["answer_from_knowledge", "summarize_document"];
}

function consoleVisualInputs(method = state.consoleMethod): string {
  if (method === "tools/call") {
    const current = safeJson(state.consoleParams);
    const args = (current.arguments || {}) as Record<string, unknown>;
    return `
      <div class="console-form-grid">
        <div class="field"><label>工具名称 name</label><select id="consoleToolName">${enabledToolNamesForConsole().map((name) => `<option value="${esc(name)}" ${current.name === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div>
        <div class="field"><label>检索问题 query</label><input id="consoleQuery" value="${esc(String(args.query || "智能路由"))}" placeholder="例如：智能路由" /></div>
        <div class="field"><label>返回数量 top_k</label><input id="consoleTopK" type="number" min="1" max="10" value="${esc(String(args.top_k || 5))}" /></div>
        <div class="field"><label>文档 ID document_id</label><input id="consoleDocumentId" value="${esc(String(args.document_id || ""))}" placeholder="get_document 时填写" /></div>
        <div class="field"><label>任务 ID job_id</label><input id="consoleJobId" value="${esc(String(args.job_id || ""))}" placeholder="get_task_status 时填写" /></div>
      </div>`;
  }
  if (method === "resources/list") {
    const current = safeJson(state.consoleParams);
    return `<div class="console-form-grid"><div class="field"><label>分页大小 page_size</label><input id="consolePageSize" type="number" min="1" max="100" value="${esc(String(current.page_size || 10))}" /></div><div class="field"><label>游标 cursor</label><input id="consoleCursor" value="${esc(String(current.cursor || ""))}" placeholder="下一页时填写" /></div></div>`;
  }
  if (method === "resources/read") {
    const current = safeJson(state.consoleParams);
    return `<div class="field"><label>资源 URI</label><input id="consoleUri" value="${esc(String(current.uri || ""))}" placeholder="从 resources/list 输出中复制 uri" /></div>`;
  }
  if (method === "prompts/get") {
    const current = safeJson(state.consoleParams);
    const args = (current.arguments || {}) as Record<string, unknown>;
    return `
      <div class="console-form-grid">
        <div class="field"><label>Prompt 名称 name</label><select id="consolePromptName">${enabledPromptNamesForConsole().map((name) => `<option value="${esc(name)}" ${current.name === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div>
        <div class="field"><label>问题 question</label><input id="consoleQuestion" value="${esc(String(args.question || "智能路由是什么？"))}" /></div>
        <div class="field"><label>文档 ID document_id</label><input id="consolePromptDocumentId" value="${esc(String(args.document_id || ""))}" placeholder="总结文档时填写" /></div>
        <div class="field"><label>主题 topic</label><input id="consoleTopic" value="${esc(String(args.topic || ""))}" placeholder="分析/报告类 Prompt 使用" /></div>
      </div>`;
  }
  return `<div class="console-empty-input">该方法不需要请求参数，可以直接调用。</div>`;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function consoleView(): string {
  const guide = consoleGuide();
  const activeServices = state.services.filter((svc) => svc.active_revision_id);
  const activeServiceId = state.consoleServiceId || activeServices[0]?.id || "";
  return `
    <section class="panel">
      <div class="row-between">
        <div><h2>真实 MCP 调用</h2><p>用真实 /mcp/{service_id} 端点验证能力发现、工具调用、资源读取和提示词渲染。</p></div>
        <button id="refreshBtn" class="btn btn-outline">刷新</button>
      </div>
      <form id="consoleForm" class="stack">
        ${activeServices.length ? "" : '<div class="notice-banner info"><b>还没有可调用的 MCP</b><span>请先在“MCP 服务”完成第八步发布，并复制生成的 API Key。</span></div>'}
        <div class="toolbar">
          <select id="consoleService">${activeServices.map((svc) => `<option value="${svc.id}" ${svc.id === activeServiceId ? "selected" : ""}>${esc(svc.name)}</option>`).join("")}</select>
          <input id="apiKey" placeholder="API Key" value="${esc(state.apiKey)}" />
        </div>
        <div class="console-layout">
          <aside class="console-methods">
            <label>选择 MCP 方法</label>
            <select id="method">
              ${consoleMethodGuides.map((item) => `<option value="${item.id}" ${item.id === state.consoleMethod ? "selected" : ""}>${item.id} · ${item.title}</option>`).join("")}
            </select>
            <div class="console-guide">
              <b>${esc(guide.title)}</b>
              <p>${esc(guide.does)}</p>
              <dl>
                <dt>应该输入</dt><dd>${esc(guide.input)}</dd>
                <dt>预计输出</dt><dd>${esc(guide.output)}</dd>
              </dl>
            </div>
          </aside>
          <section class="console-editor">
            <div class="console-pane">
              <div class="console-pane-head"><b>可视化输入</b><button class="btn btn-outline btn-sm" id="syncConsoleParamsBtn" type="button">生成 JSON 输入</button></div>
              ${consoleVisualInputs()}
            </div>
            <div class="console-pane">
              <div class="console-pane-head"><b>JSON 输入 params</b><button class="btn btn-outline btn-sm" id="resetConsoleParamsBtn" type="button">填入示例</button></div>
              <textarea id="params" rows="10">${esc(state.consoleParams)}</textarea>
            </div>
          </section>
        </div>
        <div class="wizard-nav">
          <button class="btn btn-primary" type="submit">调用 /mcp/{service_id}</button>
          <span class="meta">请求会携带 MCP-Protocol-Version: 2026-07-28 和 Bearer API Key。</span>
        </div>
      </form>
      <section class="console-output-grid">
        <div class="console-pane">
          <div class="console-pane-head"><b>可视化输出</b></div>
          ${consoleOutputSummary()}
        </div>
        <div class="console-pane">
          <div class="console-pane-head"><b>JSON 输出</b></div>
          <pre class="result">${esc(state.consoleResult || "等待调用结果")}</pre>
        </div>
      </section>
    </section>`;
}

function consoleOutputSummary(): string {
  if (!state.consoleResult) return '<div class="console-empty-input">调用后会在这里展示结构化摘要，例如工具数量、资源 URI、搜索命中文档或 Prompt 消息。</div>';
  const payload = safeJson(state.consoleResult);
  if (payload.error) {
    const error = payload.error as Record<string, unknown>;
    return `<div class="notice-banner info"><b>调用失败</b><span>${esc(error.message || "未知错误")}</span></div>`;
  }
  const result = (payload.result || {}) as Record<string, unknown>;
  if (Array.isArray(result.tools)) {
    return `<div class="console-summary-list">${result.tools.map((tool) => {
      const item = tool as Record<string, unknown>;
      return `<article><b>${esc(item.name)}</b><span>${esc(item.description || "")}</span><small>${esc(item.executionMode || "synchronous")} · ${esc(item.interactionDepth || "single_call")}</small></article>`;
    }).join("")}</div>`;
  }
  if (Array.isArray(result.resources)) {
    return `<div class="console-summary-list">${result.resources.map((resource) => {
      const item = resource as Record<string, unknown>;
      return `<article><b>${esc(item.name || item.uri)}</b><span>${esc(item.uri || "")}</span><small>${esc(item.mimeType || "resource")}</small></article>`;
    }).join("")}</div>`;
  }
  if (Array.isArray(result.resourceTemplates)) {
    return `<div class="console-summary-list">${result.resourceTemplates.map((template) => {
      const item = template as Record<string, unknown>;
      return `<article><b>${esc(item.name)}</b><span>${esc(item.uriTemplate)}</span><small>${esc(item.mimeType || "")}</small></article>`;
    }).join("")}</div>`;
  }
  if (Array.isArray(result.prompts)) {
    return `<div class="console-summary-list">${result.prompts.map((prompt) => {
      const item = prompt as Record<string, unknown>;
      return `<article><b>${esc(item.name)}</b><span>${esc(item.description || "")}</span><small>${esc(item.messageCount || 1)} 条消息</small></article>`;
    }).join("")}</div>`;
  }
  if (Array.isArray(result.messages)) {
    return `<div class="console-summary-list">${result.messages.map((message) => {
      const item = message as Record<string, unknown>;
      const content = item.content as Record<string, unknown> | undefined;
      return `<article><b>${esc(item.role)}</b><span>${esc(content?.text || "")}</span></article>`;
    }).join("")}</div>`;
  }
  const structured = result.structuredContent as Record<string, unknown> | undefined;
  if (structured && Array.isArray(structured.results)) {
    return `<div class="console-summary-list">${structured.results.map((hit) => {
      const item = hit as Record<string, unknown>;
      return `<article><b>${esc(item.file_name || item.title || "命中片段")}</b><span>${esc(item.text || item.snippet || "")}</span><small>${esc(item.document_id || "")} ${item.score ? `· score ${item.score}` : ""}</small></article>`;
    }).join("")}</div>`;
  }
  if (result.capabilities) {
    const capabilities = result.capabilities as Record<string, unknown>;
    return `<div class="preview-grid">${previewItem("协议版本", String(result.protocolVersion || ""))}${previewItem("服务", String((result.serverInfo as Record<string, unknown> | undefined)?.name || ""))}${previewItem("Tools", capabilities.tools ? "已开放" : "未开放")}${previewItem("Resources", capabilities.resources ? "已开放" : "未开放")}${previewItem("Prompts", capabilities.prompts ? "已开放" : "未开放")}${previewItem("Revision", String((result.service as Record<string, unknown> | undefined)?.revision || ""))}</div>`;
  }
  return '<div class="console-empty-input">已返回结果，请查看右侧 JSON 输出。</div>';
}

function consoleParamsFromVisual(method: string): Record<string, unknown> {
  if (method === "tools/call") {
    const name = value("#consoleToolName") || "search_knowledge";
    const args: Record<string, unknown> = {};
    const query = value("#consoleQuery");
    const documentId = value("#consoleDocumentId");
    const jobId = value("#consoleJobId");
    const topK = Number(value("#consoleTopK") || 5);
    if (query) args.query = query;
    if (Number.isFinite(topK)) args.top_k = topK;
    if (documentId) args.document_id = documentId;
    if (jobId) args.job_id = jobId;
    return { name, arguments: args };
  }
  if (method === "resources/list") {
    const params: Record<string, unknown> = {};
    const pageSize = Number(value("#consolePageSize") || 10);
    const cursor = value("#consoleCursor");
    if (Number.isFinite(pageSize)) params.page_size = pageSize;
    if (cursor) params.cursor = cursor;
    return params;
  }
  if (method === "resources/read") return { uri: value("#consoleUri") };
  if (method === "prompts/get") {
    const args: Record<string, unknown> = {};
    const question = value("#consoleQuestion");
    const documentId = value("#consolePromptDocumentId");
    const topic = value("#consoleTopic");
    if (question) args.question = question;
    if (documentId) args.document_id = documentId;
    if (topic) args.topic = topic;
    return { name: value("#consolePromptName") || "answer_from_knowledge", arguments: args };
  }
  return {};
}

function usersView(): string {
  return `
    <section class="panel">
      <div class="row-between">
        <div><h2>用户与权限</h2><p>角色说明：admin 可管理用户；seller 可管理文档、知识库和服务；viewer 仅可查看与测试。</p></div>
        <button id="refreshBtn" class="btn btn-outline">刷新</button>
      </div>
      <div class="list-panel">
        ${state.users.map((user) => `
          <article class="list-row">
            <div class="main">
              <div class="name">${esc(user.display_name)} <span class="status-badge">${esc(user.role)}</span> ${user.is_active ? "" : '<span class="status-badge off">已停用</span>'}</div>
              <div class="sub-line">${esc(user.email)} · ${user.id}</div>
            </div>
            <div class="permission-controls">
              <select data-user-role="${user.id}" ${user.id === state.currentUser?.id ? "disabled" : ""}>
                ${["admin", "seller", "viewer"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`).join("")}
              </select>
              <button class="btn btn-outline btn-sm" data-user-save="${user.id}" ${user.id === state.currentUser?.id ? "disabled" : ""}>保存</button>
              <button class="btn btn-outline btn-sm" data-user-active="${user.id}" data-active="${user.is_active ? "0" : "1"}" ${user.id === state.currentUser?.id ? "disabled" : ""}>${user.is_active ? "停用" : "启用"}</button>
            </div>
          </article>`).join("")}
      </div>
    </section>`;
}

function empty(title: string, desc: string): string {
  return `<div class="empty-state"><div class="icon">◇</div><h3>${title}</h3><p>${desc}</p></div>`;
}

function readyKbOptions(): string {
  return state.knowledgeBases.filter((kb) => kb.latest_ready_revision_id).map((kb) => `<option value="${kb.id}">${esc(kb.name)}</option>`).join("");
}

function readyRevisionOptions(current?: string): string {
  const selected = current || activeWizardRevisionId();
  return state.knowledgeBases.filter((kb) => kb.latest_ready_revision_id).map((kb) => `<option value="${kb.latest_ready_revision_id}" ${kb.latest_ready_revision_id === selected ? "selected" : ""}>${esc(kb.name)} · ${kb.latest_ready_revision_id}</option>`).join("");
}

function activeWizardRevisionId(): string {
  return state.mcpSelectedRevisionId || currentService()?.draft_config.knowledge_base_revision_id || "";
}

function selectedKb(): KnowledgeBase | undefined {
  const select = document.querySelector<HTMLSelectElement>("#serviceKbRevision");
  const existingSelect = document.querySelector<HTMLSelectElement>("#existingKbRevision");
  const revision = select?.value || existingSelect?.value || activeWizardRevisionId();
  return state.knowledgeBases.find((kb) => kb.latest_ready_revision_id === revision);
}

function currentService(): ServiceInfo | undefined {
  return state.services.find((svc) => svc.id === state.editingServiceId);
}

function bindView(): void {
  document.querySelector("#refreshBtn")?.addEventListener("click", () => refresh().catch((err) => toast(err.message)));
  document.querySelector("#logoutBtn")?.addEventListener("click", logout);
  document.querySelectorAll<HTMLInputElement>("[data-doc]").forEach((box) => box.addEventListener("change", () => {
    box.checked ? state.selectedDocs.add(box.dataset.doc!) : state.selectedDocs.delete(box.dataset.doc!);
    if (state.view === "services" && state.mcpStep === 2) render();
  }));
  document.querySelector("#uploadForm")?.addEventListener("submit", uploadDocuments);
  document.querySelector("#openKbBuilderBtn")?.addEventListener("click", openKnowledgeBaseBuilder);
  document.querySelector("#closeKbBuilderBtn")?.addEventListener("click", closeKnowledgeBaseBuilder);
  document.querySelector("#cancelKbBuilderBtn")?.addEventListener("click", closeKnowledgeBaseBuilder);
  document.querySelector("#kbForm")?.addEventListener("submit", createKnowledgeBase);
  document.querySelector("#kbName")?.addEventListener("input", (event) => {
    state.kbBuilderName = (event.target as HTMLInputElement).value;
  });
  document.querySelector("#kbDescription")?.addEventListener("input", (event) => {
    state.kbBuilderDescription = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelectorAll<HTMLInputElement>("[data-kb-builder-doc]").forEach((box) => box.addEventListener("change", () => {
    box.checked ? state.kbBuilderDocIds.add(box.dataset.kbBuilderDoc!) : state.kbBuilderDocIds.delete(box.dataset.kbBuilderDoc!);
    const countInput = document.querySelector<HTMLInputElement>("#kbBuilderSelectedCount");
    if (countInput) countInput.value = `${state.kbBuilderDocIds.size} / ${state.documents.length} 份`;
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-kb-builder-action]").forEach((button) => {
    button.addEventListener("click", () => handleKnowledgeBaseBuilderAction(button.dataset.kbBuilderAction || ""));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-build]").forEach((btn) => btn.addEventListener("click", () => buildKnowledgeBase(btn.dataset.build!)));
  document.querySelectorAll<HTMLButtonElement>("[data-doc-preview]").forEach((btn) => btn.addEventListener("click", () => previewDocument(btn.dataset.docPreview!)));
  document.querySelectorAll<HTMLButtonElement>("[data-kb-preview]").forEach((btn) => btn.addEventListener("click", () => previewKnowledgeBase(btn.dataset.kbPreview!)));
  document.querySelector("#closeContentPreviewBtn")?.addEventListener("click", closeContentPreview);
  document.querySelectorAll<HTMLButtonElement>("[data-doc-delete]").forEach((btn) => btn.addEventListener("click", () => deleteDocument(btn.dataset.docDelete!)));
  document.querySelectorAll<HTMLButtonElement>("[data-kb-delete]").forEach((btn) => btn.addEventListener("click", () => deleteKnowledgeBase(btn.dataset.kbDelete!)));
  document.querySelector("#searchForm")?.addEventListener("submit", searchKnowledgeBase);
  document.querySelector("#serviceForm")?.addEventListener("submit", saveServiceDraft);
  document.querySelector("#serviceKbRevision")?.addEventListener("change", render);
  document.querySelectorAll<HTMLInputElement>('input[name="sourceMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.mcpSourceMode = input.value as "documents" | "knowledge";
      render();
    });
  });
  document.querySelector("#existingKbRevision")?.addEventListener("change", (event) => {
    state.mcpSelectedRevisionId = (event.target as HTMLSelectElement).value;
  });
  document.querySelector("#saveMcpMetaBtn")?.addEventListener("click", saveMcpMeta);
  document.querySelector("#sourceUploadForm")?.addEventListener("submit", uploadSourceDocuments);
  document.querySelector("#sourceDocQuery")?.addEventListener("input", (event) => {
    state.sourceDocQuery = (event.target as HTMLInputElement).value;
    filterSourceList("doc", state.sourceDocQuery);
  });
  document.querySelector("#sourceKbQuery")?.addEventListener("input", (event) => {
    state.sourceKbQuery = (event.target as HTMLInputElement).value;
    filterSourceList("kb", state.sourceKbQuery);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-source-action]").forEach((button) => {
    button.addEventListener("click", () => handleSourceAction(button.dataset.sourceAction || ""));
  });
  document.querySelectorAll<HTMLInputElement>("[data-source-kb]").forEach((input) => {
    input.addEventListener("change", () => {
      input.checked ? state.mcpSelectedKbIds.add(input.dataset.sourceKb!) : state.mcpSelectedKbIds.delete(input.dataset.sourceKb!);
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view-shortcut]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewShortcut as ViewName));
  });
  document.querySelector("#buildMcpKbBtn")?.addEventListener("click", buildMcpKnowledgeBase);
  document.querySelector("#saveAccessBtn")?.addEventListener("click", saveAccessSettings);
  document.querySelector("#runDraftTestBtn")?.addEventListener("click", runDraftTest);
  document.querySelector("#finalPublishBtn")?.addEventListener("click", finalPublishMcp);
  document.querySelectorAll<HTMLButtonElement>("[data-copy-value]").forEach((btn) => btn.addEventListener("click", () => copyGeneratedValue(btn)));
  document.querySelectorAll<HTMLButtonElement>("[data-next-step]").forEach((btn) => btn.addEventListener("click", () => goMcpStep(Number(btn.dataset.nextStep))));
  document.querySelectorAll<HTMLButtonElement>("[data-prev-step]").forEach((btn) => btn.addEventListener("click", () => goMcpStep(Number(btn.dataset.prevStep))));
  document.querySelectorAll<HTMLButtonElement>("[data-mcp-step]").forEach((btn) => btn.addEventListener("click", () => goMcpStep(Number(btn.dataset.mcpStep))));
  document.querySelectorAll<HTMLButtonElement>("[data-view-mcp]").forEach((btn) => btn.addEventListener("click", () => {
    state.myMcpSelectedId = btn.dataset.viewMcp!;
    render();
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => btn.addEventListener("click", () => {
    state.editingServiceId = btn.dataset.edit!;
    state.apiKey = "";
    const svc = currentService();
    state.mcpSelectedRevisionId = svc?.draft_config.knowledge_base_revision_id || state.mcpSelectedRevisionId;
    if (svc) {
      state.mcpName = svc.name;
      const intro = svc.description.match(/简介：(.*)/)?.[1];
      const creator = svc.description.match(/创建者：(.*)/)?.[1];
      state.mcpIntro = intro && intro !== "未填写" ? intro : state.mcpIntro;
      state.mcpCreator = creator && creator !== "未填写" ? creator : state.mcpCreator;
    }
    state.view = "services";
    state.mcpStep = 4;
    render();
    toast("已载入服务草稿");
  }));
  document.querySelectorAll<HTMLButtonElement>("[data-publish]").forEach((btn) => btn.addEventListener("click", () => publishService(btn.dataset.publish!)));
  document.querySelectorAll<HTMLButtonElement>("[data-pause]").forEach((btn) => btn.addEventListener("click", () => pauseService(btn.dataset.pause!)));
  document.querySelectorAll<HTMLButtonElement>("[data-resume]").forEach((btn) => btn.addEventListener("click", () => resumeService(btn.dataset.resume!)));
  document.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((btn) => btn.addEventListener("click", () => createKey(btn.dataset.key!)));
  document.querySelectorAll<HTMLButtonElement>("[data-conn]").forEach((btn) => btn.addEventListener("click", () => loadConnection(btn.dataset.conn!)));
  document.querySelectorAll<HTMLButtonElement>("[data-delete-service]").forEach((btn) => btn.addEventListener("click", () => deleteService(btn.dataset.deleteService!)));
  document.querySelectorAll<HTMLButtonElement>("[data-token]").forEach((btn) => btn.addEventListener("click", () => insertToken(btn)));
  document.querySelectorAll<HTMLButtonElement>("[data-config-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchConfigTab(btn.dataset.configTab as "tools" | "resources" | "prompts");
    });
  });
  document.querySelector("#consoleService")?.addEventListener("change", (event) => {
    state.consoleServiceId = (event.target as HTMLSelectElement).value;
    render();
  });
  document.querySelector("#method")?.addEventListener("change", (event) => {
    state.consoleMethod = (event.target as HTMLSelectElement).value;
    state.consoleParams = pretty(consoleGuide(state.consoleMethod).defaultParams);
    render();
  });
  document.querySelector("#params")?.addEventListener("input", (event) => {
    state.consoleParams = (event.target as HTMLTextAreaElement).value;
  });
  document.querySelector("#resetConsoleParamsBtn")?.addEventListener("click", () => {
    state.consoleParams = pretty(consoleGuide().defaultParams);
    state.consoleResult = "";
    render();
  });
  document.querySelector("#syncConsoleParamsBtn")?.addEventListener("click", () => {
    syncConsoleParamsFromVisual(true);
  });
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".console-form-grid input, .console-form-grid select, #consoleUri").forEach((control) => {
    control.addEventListener("input", () => syncConsoleParamsFromVisual(false));
    control.addEventListener("change", () => syncConsoleParamsFromVisual(false));
  });
  document.querySelector("#consoleForm")?.addEventListener("submit", callMcp);
  document.querySelectorAll<HTMLButtonElement>("[data-user-save]").forEach((btn) => btn.addEventListener("click", () => updateUserRole(btn.dataset.userSave!)));
  document.querySelectorAll<HTMLButtonElement>("[data-user-active]").forEach((btn) => btn.addEventListener("click", () => updateUserActive(btn.dataset.userActive!, btn.dataset.active === "1")));
}

async function copyGeneratedValue(button: HTMLButtonElement): Promise<void> {
  const value = button.dataset.copyValue || "";
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast("已复制");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    toast("已复制");
  }
}

function switchConfigTab(tab: "tools" | "resources" | "prompts"): void {
  state.serviceConfigTab = tab;
  document.querySelectorAll<HTMLElement>("[data-config-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.configPanel === tab);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-config-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.configTab === tab);
  });
}

function bindAuth(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode as "login" | "register";
      render();
    });
  });
  document.querySelector("#authForm")?.addEventListener("submit", submitAuth);
}

async function submitAuth(event: Event): Promise<void> {
  event.preventDefault();
  const email = value("#authEmail");
  const password = value("#authPassword");
  const path = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  const body = state.authMode === "login"
    ? { email, password }
    : { email, password, display_name: value("#authName") };
  try {
    const result = await api<{ user: UserInfo }>(path, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
    state.currentUser = result.user;
    state.view = "documents";
    toast(state.authMode === "login" ? "登录成功" : "注册成功");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "认证失败");
  }
}

async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
  state.currentUser = null;
  state.documents = [];
  state.knowledgeBases = [];
  state.services = [];
  state.users = [];
  state.apiKey = "";
  render();
}

async function uploadDocuments(event: Event): Promise<void> {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#files")!;
  const form = new FormData();
  [...(input.files || [])].forEach((file) => form.append("files", file));
  const result = await api<DocumentInfo[]>("/api/documents", { method: "POST", body: form });
  result.forEach((doc) => state.selectedDocs.add(doc.id));
  toast(`上传完成：${result.length} 份文档`);
  await refresh();
}

async function uploadSourceDocuments(event: Event): Promise<void> {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("#sourceFiles")!;
  const files = [...(input.files || [])];
  if (!files.length) return toast("请选择 Markdown 文件");
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  try {
    const result = await api<DocumentInfo[]>("/api/documents", { method: "POST", body: form });
    result.forEach((doc) => state.selectedDocs.add(doc.id));
    state.view = "services";
    state.mcpStep = 2;
    state.sourceDocQuery = "";
    toast(`上传并勾选：${result.length} 份文档`);
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "上传失败");
  }
}

function handleSourceAction(action: string): void {
  if (action === "docs-clear") {
    state.selectedDocs.clear();
  }
  if (action === "kbs-clear") {
    state.mcpSelectedKbIds.clear();
  }
  render();
}

function filterSourceList(kind: "doc" | "kb", query: string): void {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>(`[data-source-kind="${kind}"]`).forEach((node) => {
    const text = node.dataset.sourceText || "";
    node.hidden = Boolean(normalized) && !text.includes(normalized);
  });
}

function openKnowledgeBaseBuilder(): void {
  state.kbBuilderDocIds = new Set(state.selectedDocs);
  state.kbBuilderOpen = true;
  render();
}

function closeKnowledgeBaseBuilder(): void {
  state.kbBuilderOpen = false;
  render();
}

function handleKnowledgeBaseBuilderAction(action: string): void {
  if (action === "select-all") {
    state.kbBuilderDocIds = new Set(state.documents.map((doc) => doc.id));
  }
  if (action === "clear") {
    state.kbBuilderDocIds.clear();
  }
  render();
}

async function createKnowledgeBase(event: Event): Promise<void> {
  event.preventDefault();
  const ids = [...state.kbBuilderDocIds];
  if (!ids.length) return toast("请至少选择 1 份文档");
  const name = document.querySelector<HTMLInputElement>("#kbName")!.value.trim();
  if (!name) return toast("请填写知识库名称");
  const description = document.querySelector<HTMLTextAreaElement>("#kbDescription")!.value.trim();
  try {
    const kb = await api<KnowledgeBase>("/api/knowledge-bases", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ name, description, document_ids: ids }) });
    await buildKnowledgeBase(kb.id);
    state.kbBuilderOpen = false;
    state.kbBuilderName = "产品知识库";
    state.kbBuilderDescription = "";
    state.kbBuilderDocIds.clear();
    state.view = "knowledge";
    toast("知识库已创建并构建");
    render();
  } catch (err) {
    toast(err instanceof Error ? err.message : "知识库创建失败");
  }
}

function goMcpStep(stepNumber: number): void {
  if (stepNumber >= 2 && !state.mcpName.trim()) {
    toast("请先填写 MCP 名称");
    return;
  }
  if (stepNumber >= 3 && !state.selectedDocs.size && !state.mcpSelectedKbIds.size && !state.mcpSelectedRevisionId) {
    toast("请先选择新文档或已有知识库");
    return;
  }
  if (stepNumber >= 4 && !state.mcpSelectedRevisionId) {
    toast("请先完成第 3 步，生成不可变 MCP 知识库版本");
    return;
  }
  if (stepNumber >= 6 && !state.editingServiceId) {
    toast("请先在第 4 步保存服务草稿");
    return;
  }
  state.mcpStep = Math.min(8, Math.max(1, stepNumber));
  render();
}

function saveMcpMeta(): void {
  state.mcpName = value("#mcpName");
  state.mcpIntro = value("#mcpIntro");
  state.mcpCreator = value("#mcpCreator") || state.currentUser?.display_name || "";
  if (!state.mcpName) return toast("请填写 MCP 名称");
  toast("MCP 基础信息已保存");
  goMcpStep(2);
}

async function buildMcpKnowledgeBase(): Promise<void> {
  const reusableKb = reusableSelectedKnowledgeBase();
  if (reusableKb?.latest_ready_revision_id) {
    state.mcpSelectedRevisionId = reusableKb.latest_ready_revision_id;
    toast(`已复用知识库版本：${reusableKb.latest_ready_revision_id}`);
    state.mcpStep = 4;
    render();
    return;
  }
  const kbDocIds = [...state.mcpSelectedKbIds]
    .map((id) => state.knowledgeBases.find((kb) => kb.id === id))
    .filter((kb): kb is KnowledgeBase => Boolean(kb))
    .flatMap((kb) => kb.document_ids);
  const ids = [...new Set([...state.selectedDocs, ...kbDocIds])];
  if (!ids.length) return toast("请先选择新文档或已有知识库");
  const kb = await api<KnowledgeBase>("/api/knowledge-bases", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ name: `${state.mcpName || "MCP"} 知识库`, description: `由 ${state.mcpCreator || "未知创建者"} 通过 MCP 构建向导创建`, document_ids: ids }),
  });
  const built = await api<{ knowledge_base_revision_id: string }>(`/api/knowledge-bases/${kb.id}/build`, { method: "POST" });
  state.mcpSelectedRevisionId = built.knowledge_base_revision_id;
  toast("MCP 知识库版本已构建");
  await refresh();
  state.mcpStep = 4;
  render();
}

async function buildKnowledgeBase(id: string): Promise<void> {
  const result = await api<{ knowledge_base_revision_id: string }>(`/api/knowledge-bases/${id}/build`, { method: "POST" });
  toast(`构建成功：${result.knowledge_base_revision_id}`);
  await refresh();
}

async function previewDocument(id: string): Promise<void> {
  try {
    const doc = await api<DocumentDetail>(`/api/documents/${id}`);
    state.contentPreview = {
      mode: "document",
      title: doc.title || doc.original_name,
      subtitle: `${doc.original_name} · ${doc.size} bytes · ${doc.content_hash.slice(0, 12)}`,
      items: [{ title: doc.title || doc.original_name, meta: `${doc.id} · ${doc.created_at}`, content: doc.content }],
    };
    render();
  } catch (err) {
    toast(err instanceof Error ? err.message : "文档预览失败");
  }
}

async function previewKnowledgeBase(id: string): Promise<void> {
  const kb = state.knowledgeBases.find((item) => item.id === id);
  if (!kb) return toast("知识库不存在");
  if (!kb.document_ids.length) return toast("该知识库还没有文档");
  try {
    const docs = await Promise.all(kb.document_ids.map((docId) => api<DocumentDetail>(`/api/documents/${docId}`)));
    state.contentPreview = {
      mode: "knowledge",
      title: kb.name,
      subtitle: `${kb.description || "未填写介绍"} · ${docs.length} 份文档 · ${kb.latest_ready_revision_id || "未构建版本"}`,
      items: docs.map((doc) => ({
        title: doc.title || doc.original_name,
        meta: `${doc.original_name} · ${doc.id} · ${doc.size} bytes`,
        content: doc.content,
      })),
    };
    render();
  } catch (err) {
    toast(err instanceof Error ? err.message : "知识库预览失败");
  }
}

function closeContentPreview(): void {
  state.contentPreview = null;
  render();
}

async function deleteDocument(id: string): Promise<void> {
  const doc = state.documents.find((item) => item.id === id);
  const relatedKbs = knowledgeBasesUsingDocument(id).map((kb) => kb.name);
  const relationHint = relatedKbs.length ? `\n关联知识库：${relatedKbs.join("、")}\n删除后这些知识库会移除该文档或失去相关版本。` : "\n该文档当前没有关联知识库。";
  if (!window.confirm(`确定删除文档「${doc?.title || id}」吗？只要没有上架 MCP 正在使用，就允许删除。${relationHint}`)) return;
  try {
    await api(`/api/documents/${id}`, { method: "DELETE" });
    state.selectedDocs.delete(id);
    toast("文档已删除");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "删除失败");
  }
}

async function deleteKnowledgeBase(id: string): Promise<void> {
  const kb = state.knowledgeBases.find((item) => item.id === id);
  if (!window.confirm(`确定删除知识库「${kb?.name || id}」吗？原始文档不会被删除。只有未被 MCP 使用的知识库可以删除。`)) return;
  try {
    await api(`/api/knowledge-bases/${id}`, { method: "DELETE" });
    state.mcpSelectedKbIds.delete(id);
    if (kb?.latest_ready_revision_id === state.mcpSelectedRevisionId) state.mcpSelectedRevisionId = "";
    toast("知识库已删除，原始文档已保留");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "删除失败");
  }
}

async function searchKnowledgeBase(event: Event): Promise<void> {
  event.preventDefault();
  const kbId = document.querySelector<HTMLSelectElement>("#searchKb")!.value;
  const query = document.querySelector<HTMLInputElement>("#searchQuery")!.value;
  const result = await api<unknown>(`/api/knowledge-bases/${kbId}/search`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ query, top_k: 5 }) });
  state.searchResult = pretty(result);
  render();
}

async function saveServiceDraft(event: Event): Promise<void> {
  event.preventDefault();
  const revisionId = document.querySelector<HTMLSelectElement>("#serviceKbRevision")!.value;
  if (!revisionId) return toast("请先构建知识库版本");
  state.mcpSelectedRevisionId = revisionId;
  const name = document.querySelector<HTMLInputElement>("#serviceName")!.value;
  state.mcpName = name || state.mcpName;
  const description = [`简介：${state.mcpIntro || "未填写"}`, `创建者：${state.mcpCreator || state.currentUser?.display_name || "未填写"}`].join("\n");
  const draft = collectDraft();
  if (state.editingServiceId) {
    await api<ServiceInfo>(`/api/services/${state.editingServiceId}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ name, description, knowledge_base_revision_id: revisionId, ...draft }) });
    toast("服务草稿已更新");
  } else {
    const svc = await api<ServiceInfo>("/api/services", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ name, description, knowledge_base_revision_id: revisionId }) });
    state.editingServiceId = svc.id;
    await api<ServiceInfo>(`/api/services/${svc.id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(draft) });
    toast("服务草稿已创建");
  }
  state.mcpStep = 5;
  await refresh();
}

function collectDraft(): { tools: ToolConfig[]; resources: ResourceConfig; prompts: PromptConfig[] } {
  const tools = toolPresets.map((tool) => ({
    preset_id: tool.id,
    template: tool.template,
    name: value(`[data-tool-name="${tool.id}"]`),
    description: value(`[data-tool-desc="${tool.id}"]`),
    enabled: checked(`[data-tool-enabled="${tool.id}"]`),
    execution_mode: tool.executionMode,
    interaction_depth: tool.interactionDepth,
    behavior_hints: tool.hints,
    output_schema: tool.outputSchema,
    annotations: { longRunningHint: tool.hints.long_running, requiresSecrets: tool.hints.requires_secrets, structuredOutput: tool.hints.structured_output },
  }));
  const enabledTemplates = new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.template));
  const prompts = promptPresets.map((item) => ({
    preset_id: item.id,
    template: item.template,
    name: value(`[data-prompt-name="${item.id}"]`),
    description: value(`[data-prompt-desc="${item.id}"]`),
    enabled: checked(`[data-prompt-enabled="${item.id}"]`),
    template_text: value(`[data-prompt-template="${item.id}"]`),
    arguments: item.arguments,
    depends_on: item.dependsOn,
    completions: item.completions || {},
    messages: item.messages || null,
  }));
  const missing = prompts.find((promptItem) => promptItem.enabled && (promptItem.depends_on || []).some((dep) => !enabledTemplates.has(dep)));
  if (missing) throw new Error(`${missing.name} 需要同时启用：${missing.depends_on?.join(", ")}`);
  const resources = {
    catalog_enabled: checked("#resourceCatalog"),
    uri_templates_enabled: checked("#resourceUriTemplates"),
    as_tools_enabled: checked("#resourcesAsTools"),
    document_ids: [...document.querySelectorAll<HTMLInputElement>("[data-resource-doc]:checked")].map((node) => node.dataset.resourceDoc!),
  };
  return { tools, resources, prompts };
}

async function publishService(id: string): Promise<void> {
  const result = await api<{ connection_url: string }>(`/api/services/${id}/publish`, { method: "POST" });
  toast(`发布成功：${result.connection_url}`);
  await refresh();
}

async function pauseService(id: string): Promise<void> {
  try {
    await api(`/api/services/${id}/pause`, { method: "POST" });
    toast("MCP 已下架，外部调用会暂停");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "下架失败");
  }
}

async function resumeService(id: string): Promise<void> {
  try {
    await api(`/api/services/${id}/resume`, { method: "POST" });
    toast("MCP 已重新上架");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "重新上架失败");
  }
}

async function createKey(id: string): Promise<void> {
  const result = await api<{ api_key: string }>(`/api/services/${id}/keys`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ expires_in_days: 30 }) });
  state.apiKey = result.api_key;
  state.myMcpSelectedId = id;
  state.serviceConnectionInfo[id] = pretty(connectionBundle(id, result.api_key, "明文密钥只显示这一次"));
  toast("密钥已创建");
  render();
}

async function loadConnection(id: string): Promise<void> {
  state.myMcpSelectedId = id;
  state.serviceConnectionInfo[id] = pretty(await api<unknown>(`/api/services/${id}/connection`));
  render();
}

async function deleteService(id: string): Promise<void> {
  const service = state.services.find((svc) => svc.id === id);
  if (!window.confirm(`确定彻底删除 MCP「${service?.name || id}」吗？文档库和知识库不会被删除。`)) return;
  await api(`/api/services/${id}`, { method: "DELETE" });
  delete state.serviceConnectionInfo[id];
  if (state.editingServiceId === id) state.editingServiceId = "";
  if (state.myMcpSelectedId === id) state.myMcpSelectedId = "";
  toast("MCP 已删除，文档和知识库已保留");
  await refresh();
}

function saveAccessSettings(): void {
  const days = Number(document.querySelector<HTMLInputElement>("#accessKeyDays")?.value || 30);
  state.accessKeyDays = Math.min(365, Math.max(1, days));
  toast("接入设置已保存");
  goMcpStep(6);
}

async function runDraftTest(): Promise<void> {
  if (!state.editingServiceId) return toast("请先保存服务草稿");
  const method = document.querySelector<HTMLSelectElement>("#draftTestMethod")?.value || "server/discover";
  try {
    const result = await api<unknown>(`/api/services/${state.editingServiceId}/draft-test`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ method, params: {} }),
    });
    state.draftTestResult = pretty(result);
    toast("草稿测试完成");
    render();
  } catch (err) {
    state.draftTestResult = err instanceof Error ? err.message : "草稿测试失败";
    render();
  }
}

async function finalPublishMcp(): Promise<void> {
  if (!state.editingServiceId) return toast("请先保存服务草稿");
  await publishService(state.editingServiceId);
  const result = await api<{ api_key: string }>(`/api/services/${state.editingServiceId}/keys`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ expires_in_days: state.accessKeyDays }),
  });
  state.apiKey = result.api_key;
  state.connectionInfo = pretty(connectionBundle(state.editingServiceId, result.api_key, "不可变 MCP 已发布；密钥明文只显示这一次"));
  state.myMcpSelectedId = state.editingServiceId;
  state.serviceConnectionInfo[state.editingServiceId] = state.connectionInfo;
  toast("不可变 MCP 已发布并生成 API Key");
  await refresh();
}

async function updateUserRole(id: string): Promise<void> {
  const role = document.querySelector<HTMLSelectElement>(`[data-user-role="${id}"]`)!.value;
  try {
    await api(`/api/users/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ role }) });
    toast("权限已更新");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "更新失败");
  }
}

async function updateUserActive(id: string, isActive: boolean): Promise<void> {
  try {
    await api(`/api/users/${id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ is_active: isActive }) });
    toast(isActive ? "用户已启用" : "用户已停用");
    await refresh();
  } catch (err) {
    toast(err instanceof Error ? err.message : "更新失败");
  }
}

async function callMcp(event: Event): Promise<void> {
  event.preventDefault();
  const serviceId = document.querySelector<HTMLSelectElement>("#consoleService")!.value;
  const key = document.querySelector<HTMLInputElement>("#apiKey")!.value;
  const method = document.querySelector<HTMLSelectElement>("#method")!.value;
  state.apiKey = key;
  state.consoleServiceId = serviceId;
  state.consoleMethod = method;
  state.consoleParams = document.querySelector<HTMLTextAreaElement>("#params")!.value || "{}";
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(state.consoleParams || "{}");
  } catch (err) {
    state.consoleResult = pretty({ jsonrpc: "2.0", id: "local-validation", error: { code: -32700, message: err instanceof Error ? `JSON 输入格式错误：${err.message}` : "JSON 输入格式错误" } });
    render();
    return;
  }
  try {
    const result = await api<unknown>(`/mcp/${serviceId}`, {
      method: "POST",
      headers: { ...jsonHeaders(), Authorization: `Bearer ${key}`, "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method },
      body: JSON.stringify({ jsonrpc: "2.0", id: String(Date.now()), method, params }),
    });
    state.consoleResult = pretty(result);
    render();
  } catch (err) {
    state.consoleResult = pretty({ jsonrpc: "2.0", id: "http-error", error: { code: -32000, message: err instanceof Error ? err.message : "调用失败" } });
    render();
  }
}

function syncConsoleParamsFromVisual(showToast: boolean): void {
  const method = document.querySelector<HTMLSelectElement>("#method")?.value || state.consoleMethod;
  state.consoleMethod = method;
  state.consoleParams = pretty(consoleParamsFromVisual(method));
  const textarea = document.querySelector<HTMLTextAreaElement>("#params");
  if (textarea) textarea.value = state.consoleParams;
  if (showToast) toast("已根据可视化输入生成 JSON");
}

function insertToken(button: HTMLButtonElement): void {
  const id = button.dataset.prompt!;
  const textarea = document.querySelector<HTMLTextAreaElement>(`[data-prompt-template="${id}"]`)!;
  const token = button.dataset.token!;
  textarea.setRangeText(token, textarea.selectionStart, textarea.selectionEnd, "end");
  textarea.focus();
}

function value(selector: string): string {
  return (document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value || "").trim();
}

function checked(selector: string): boolean {
  return Boolean(document.querySelector<HTMLInputElement>(selector)?.checked);
}

function jsonHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view as ViewName));
});

bootstrap().catch((err) => {
  app.innerHTML = `<div class="container"><section class="panel"><h1>加载失败</h1><p>${esc(err.message)}</p></section></div>`;
});
