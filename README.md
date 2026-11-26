# coridis

一个基于 Cordis 的最小 agent harness，代码架构对齐 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，实现了一个最小可用的 agent：`read_file`、`web_search`、`web_fetch` 三个工具 + DeepSeek 模型适配器 + turn/step 驱动。

## 架构

运行中的 coridis 是一棵由有序层合成的 Cordis 插件树：

```text
profile (profiles/minimal)
  └─ bundles (package.json: coridis.profile.bundles)
       └─ bundle patch (cordis.patch.yml: insert / config / disable rows)
            └─ profile patch (profiles/minimal/cordis.patch.yml)
```

- **profile**：一次运行使用的组合，记录 bundle 顺序与用户自己的 patch。
- **bundle**：可分发的一组插件行；`package.json` 的 `coridis.bundle.patch` 指向它的 patch 文件。
- **patch**：按 `id` 覆盖某行配置、禁用某行，或 `insert` 新行；上层 patch 覆盖下层。
- **seam**：一个可替换能力由三部分组成：服务定义（如 `ctx.web`）、服务提供者（如 `web-fetch-http`）、消费者（如 `tool-web`）。
- **可逆注册**：所有注册都通过 Cordis effect / `ctx.on()` 安装，插件卸载时自动撤销。

## 目录

```text
apps/cli                       # coridis 启动器（bin: coridis）+ 最小 profile 组装/启动
packages/core/llm              # ctx.llm：消息/流词汇 + 适配器注册
packages/core/session          # ctx.sessions：append-only 事件日志 + deriveMessages()
packages/core/tools            # ctx.tools：注册 + defineTool + 执行管线
packages/core/system-prompt    # ctx.systemPrompt：section + 工具 schema 装配
packages/core/agent            # ctx.agents：Agent 接口/注册表 + agent/created
packages/core/agent-loop       # ctx.agentLoop：turn/step 驱动
packages/llm/llm-deepseek      # DeepSeek 流式适配器
packages/web/web               # ctx.web：搜索/抓取 seam（定义）
packages/web/web-fetch-http    # HTTP 抓取提供者（HTML→纯文本）
packages/web/web-search-tavily # Tavily 搜索提供者
packages/tool/tool-read-file   # read_file
packages/tool/tool-web         # web_search / web_fetch
packages/bundle/minimal        # 最小 bundle 的完整插件树
profiles/minimal               # 最小 profile
```

## 与 DeepSeek Harness 的对应

| DSH | coridis | 说明 |
|---|---|---|
| `@deepseek-ai/cordis` | 同左 | 直接复用 Cordis 4.x |
| `dsh.profile.bundles` | `coridis.profile.bundles` | profile 清单字段 |
| `dsh.bundle.patch` | `coridis.bundle.patch` | bundle patch 字段 |
| `dsh-agent-loop` | `@coridis/agent-loop` | 默认 agent 驱动 |
| `dsh-tools` | `@coridis/tools` | 工具注册表 |
| `dsh-web` + `dsh-tool-web` | `@coridis/web` + `@coridis/tool-web` | seam 与消费者分离 |
| `dsh-sdk-minimal` | `@coridis/bundle-minimal` | 不继承其它 bundle 的完整树 |

Cordis 直接作为依赖使用，版本 `^4.1.0`，与 DSH 当前 vendored 版本一致。

## 运行

```sh
npm install        # 需要网络（typescript、@deepseek-ai/cordis 等）
npm run build      # tsc -b 编译全部包

# 需要 DeepSeek API key；web_search 需要 Tavily key
export DEEPSEEK_API_KEY=...
export TAVILY_API_KEY=...

# 交互式命令行聊天（默认）
npm run coridis

# 一次性任务
npm run coridis -- "读一下 README.md 并总结"
```

聊天里可以直接让 agent 用工具，例如：

```
coridis> 帮我搜一下 deepseek-harness 是什么，再读一下 README.md 的目录结构
```

命令：`/help`、`/exit`（或 `/quit`、`/q`）。回复会通过 `agent/assistant-stream` 实时流式输出。

启动器读 profile 的 `coridis.profile.bundles`，应用 bundle 的 `cordis.patch.yml`，用 `ctx.plugin()` 逐个装载插件，再创建 agent、进入聊天循环。

## 实现说明

- 每个 seam 是一个 `Service` 子类（`super(ctx, '<key>')`），提供 `ctx.<key>`，`export default` 供 loader 装载。
- 提供者（`llm-deepseek`、`web-fetch-http`、`web-search-tavily`）是普通函数插件，`inject` 声明依赖，`apply` 里 `ctx.effect(() => ctx.<seam>.register(...))`。
- 工具用 `defineTool({ name, description, parameters, execute, render })` 注册到 `ctx.tools`。
- `deriveMessages()` 把会话事件投影成模型可见的消息；agent-loop 负责「组装 prompt → 流式调用 → 执行工具 → 回填结果」的循环。

## 尚未实现 / 刻意省略

- 事件扩展点（`tools/pre-execute`、`agent/request` 等）只声明未接线。
- 会话持久化、上下文压缩、子 agent、HMR、Web UI、完整 loader（`cordis-plugin-loader`/`include`）——当前 `apps/cli/src/boot.ts` 是一个最小 profile 组装器。
- 错误码分类、参数 DSL 校验只做了最基本的类型/必填检查。
