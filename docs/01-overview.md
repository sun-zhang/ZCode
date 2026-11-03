# 01 · 项目总览

> 依据源码：v3.14.3。ZCode 是 **AI 编程工作台**，提供桌面应用（Electron）、浏览器 Web 界面、终端 Agent（CLI/TUI）三种使用形态，本仓库包含客户端、后端服务、共享 UI 以及 Agent CLI 与运行时源码（`apps/zcode-cli` 随仓库一起克隆，不是 submodule）。

## 1. 产品形态

| 形态      | 入口                                   | 说明                                                                                                                  |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 桌面版    | `pnpm dev:desktop` → Electron 41 应用  | 全功能形态：本地工作区、SSH/WSL/Docker 远程工作区、内嵌浏览器控制（browser-use）、Computer Use 契约、自动更新、多窗口 |
| Web 版    | `pnpm dev:web`，或发行包 `zcode --web` | 浏览器访问 `http://localhost:5173`（dev）/ 发行包自动开端口，前端经 `/ws` WebSocket 走同一套 RPC 服务                 |
| 终端 TUI  | `zcode`（无参数）                      | React + OpenTUI 渲染的终端交互界面，进程内直连 Agent 运行时                                                           |
| Agent CLI | `zcode <args>` / `zcode -p "<prompt>"` | headless 与交互式 Agent 命令行；`app-server --stdio` 子进程形态是桌面/Web 的 Agent 后端                               |
| 手机远控  | Web 页面带 `?remote=<id>`              | 手机浏览器经 relay 连接桌面已有会话（详见 [10-remote-workspace.md](10-remote-workspace.md)）                          |

## 2. 技术栈

- **语言与运行时**：TypeScript（`tsc -b` project references）、Node.js 24.14.0（桌面 Agent 打包目标 node22，兼顾远端）、pnpm 10.33.2（版本以 `mise.toml` 为准）。
- **桌面**：Electron 41 + `utilityProcess`（Host 进程）+ electron-builder。
- **前端**：React 19、Vite 8、Tailwind CSS v4、Zustand 5、shadcn 风格基础组件（`packages/ui/src/components/ui/`）、Lexical（mentions 编辑器）、`@tanstack/react-virtual`。
- **后端**：Hono 4（`@hono/node-server`）+ `ws`。
- **Agent**：AI SDK（`@ai-sdk/anthropic`、`@ai-sdk/openai-compatible` 等，含 patches/）、自研协议服务器、SQLite 会话存储（`@zcode/adapters/storage`）。
- **校验与工具链**：zod 4（全部协议边界）、oxlint / oxfmt、knip（未使用导出）、turbo（`apps/zcode-cli` 子工作区）、esbuild（CLI bundle）、tsup（desktop/server）、release-it。
- **测试**：各包自持（以目标包 `package.json` 与实际测试文件为准，无统一命令；详见 [13-development-guide.md](13-development-guide.md)）。

## 3. 仓库布局

```text
ZCode/
├── AGENTS.md / CONTEXT.md / DESIGN.md / README.md   # 工作规范、领域词汇、UI 规范、命令速查
├── architecture-policy.yaml                          # 架构治理策略（模块/层/入口声明）
├── apps/
│   └── zcode-cli/                                    # Agent CLI 与运行时（独立 pnpm 子工作区 + turbo）
│       ├── packages/                                 #   cli / core / bootstrap / adapters / contracts /
│       │                                             #   tui / i18n / shared-types / telemetry /
│       │                                             #   dynamic-workflow(-runtime) / browser-use-plugin /
│       │                                             #   node-repl-host / debug 等
│       └── tools/                                    #   prompt-trajectory、共享 tsconfig
├── packages/
│   ├── shared/            # 跨进程契约：协议 schema、领域类型、IPlatformService（≈190 文件）
│   ├── rpc/               # 自研 RPC/IPC 框架（VS Code 风格，零业务依赖）
│   ├── services/          # 宿主侧业务服务集合（file/git/terminal/zcode-agent/...）
│   ├── client/            # 前端侧服务访问 SDK（RemoteServiceAccess）
│   ├── provider/          # 模型 Provider 配置内核（纯逻辑）
│   ├── provider-node/     # Provider 配置 Node 落地（文件仓库、内置配置物化）
│   ├── model-option-map/  # 受限 CEL → JSON Merge Patch（模型请求改写）
│   ├── ui/                # 共享 React 组件/hooks/Zustand store（TS 源码直发，无构建产物）
│   ├── web/               # Web 客户端（极薄宿主壳，~10 文件）
│   ├── server/            # Web 后端（Hono HTTP + /ws RPC + remote/* 远程后端）
│   ├── zcode-server-cli/  # 可独立发行的服务端守护 CLI（Supervisor 进程模型）
│   ├── desktop/           # Electron 桌面应用（main/host/renderer/preload/scheduler）
│   ├── zcode-cua/         # Computer Use 契约占位包（本构建 fail-closed）
│   └── formal-proof/      # 产品行为状态空间枚举器（d3 可视化小工具）
├── scripts/               # bootstrap、dev-desktop-env、build-zcode、architecture/* 等编排脚本
├── config/                # 随客户端发布的默认配置（见 config/README.md）
├── patches/               # pnpm 补丁：@arms/rum-electron、@ai-sdk/openai-compatible、@ai-sdk/anthropic
├── third-party/           # 第三方声明生成与发行校验
└── harness/               # 评测/测试 harness 资源
```

## 4. 核心概念一览

- **Agent 进程**：所有会话/任务/工具执行的真正主体。宿主以 `zcode app-server --stdio` 拉起子进程，通过 stdio 上的 NDJSON JSON-RPC 风格协议通信（详见 [03-protocols.md](03-protocols.md)、[04-agent-runtime.md](04-agent-runtime.md)）。
- **服务集合（ServiceCollection）**：宿主把 `@zcode/services` 的几十个服务经 `ProxyChannel` 自动挂成 RPC channel，前端通过 `@zcode/client` 还原为类型安全的本地对象（详见 [08-services-layer.md](08-services-layer.md)）。
- **Host（窗口服务进程）**：桌面形态下每个主窗口一个 Electron `utilityProcess` Host，聚合本地服务与远程连接注册表；Renderer、手机均以 attachment 接入（详见 [05-desktop.md](05-desktop.md)）。
- **双实时链路**：`desktop-continuous`（桌面常连，30ms 档）与 `web-remote-replayable`（手机回放，150ms 档）是贯穿协议、任务实时总线、快照/重放设计的核心区分（详见 [11-state-and-data-flow.md](11-state-and-data-flow.md)）。
- **workspaceIdentity**：`remote:ssh:<host>:<port>:<user>:<path>` 等格式的身份键，与 `workspacePath`（文件路径）分离，是去重/绑定/缓存/路由的统一键（详见 [11-state-and-data-flow.md](11-state-and-data-flow.md)）。

## 5. 特殊包说明

### packages/zcode-cua（Computer Use 契约占位）

本开源构建**不包含 CUA 实现**：包内是预编译的 `.d.ts` + `.js`，`createComputerUseRuntime` 恒返回 unavailable（fail-closed）。保留它是为了维持类型面与权限端口兼容——调用方（`packages/services/src/cua-permission-broker/`、desktop 的 CUA 权限面板等）在闭源实现接入时无需改动。broker 契约基于 Unix socket（`BROKER_SOCKET_ENV`、`callBrokerMethod`、`probeHelperHealth`）。

### packages/formal-proof（产品行为状态空间枚举器）

独立的 Vite + d3 小应用（`pnpm --filter @zcode/formal-proof dev`，127.0.0.1:4176）。对对话场景中 compact、fork、goal、消息队列、query 编辑的组合决策做穷举枚举并可视化（`src/model.ts` 的 `evaluate(context, candidate): Decision`、`buildTraceTree`），用于证明交互规则无死路、无未定义行为。纯逻辑模型经 `./model` 入口导出，可被测试复用。
