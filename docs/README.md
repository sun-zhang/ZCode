# ZCode 项目设计文档

本目录是基于当前仓库源码反向整理的设计文档，目标是帮助读者快速掌控整个工程的架构、模块边界与关键链路。文档以检出的源码为准（v3.14.3），随代码演进而更新；如与源码不符，以源码为准并欢迎修正文档。

其他权威文档（本目录不重复其内容）：

- [AGENTS.md](../AGENTS.md)：仓库工作规范（架构纪律、日志、验证要求）。
- [CONTEXT.md](../CONTEXT.md)：插件商店领域词汇表。
- [DESIGN.md](../DESIGN.md)：UI 设计规范（字体、色彩、主题）。
- [README.md](../README.md)：初始化、开发与打包命令速查。

## 阅读路径

**初次接触项目**：按 `01 → 02 → 03` 顺序阅读，可建立整体认知。

**定位某段代码**：先查 `02-architecture.md` 的分层与进程拓扑，再进入对应模块文档。

**修改特定领域**：直接跳转对应专题文档。

## 文档索引

| 文档                                                   | 内容                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [01-overview.md](01-overview.md)                       | 项目定位、产品形态、技术栈、仓库目录结构                                                     |
| [02-architecture.md](02-architecture.md)               | 进程拓扑、包依赖分层、核心数据链路、关键架构决策                                             |
| [03-protocols.md](03-protocols.md)                     | RPC 框架分层、zcode-protocol（v3 / v4 wire）、Host 消息、Electron IPC、CommandInbox          |
| [04-agent-runtime.md](04-agent-runtime.md)             | `apps/zcode-cli`：Agent CLI 与运行时内核（AgentRuntime、turn 状态机、工具/权限/上下文）、TUI |
| [05-desktop.md](05-desktop.md)                         | `packages/desktop`：Electron Main / Host / Renderer / Scheduler 进程模型与桌面能力           |
| [06-web-server.md](06-web-server.md)                   | `packages/web`、`packages/server`、`packages/zcode-server-cli`：Web 客户端与后端形态         |
| [07-ui-layer.md](07-ui-layer.md)                       | `packages/ui`：组件组织、hooks 服务访问、Zustand store、跨窗口广播、移动端适配               |
| [08-services-layer.md](08-services-layer.md)           | `packages/services`：ServiceDescriptor / ServiceCollection 机制、服务清单、zcode-agent 核心  |
| [09-provider-model.md](09-provider-model.md)           | `packages/provider(-node)`、`packages/model-option-map`：模型配置体系与请求改写              |
| [10-remote-workspace.md](10-remote-workspace.md)       | 远程工作区（SSH / WSL / Docker）、资产部署、手机远控、Bot 接入                               |
| [11-state-and-data-flow.md](11-state-and-data-flow.md) | 状态所有权总览：会话事实、UI 投影、owner/lease、实时双链路                                   |
| [12-build-and-release.md](12-build-and-release.md)     | 构建体系：bootstrap、各包构建、桌面打包、CLI 发行包、SEA                                     |
| [13-development-guide.md](13-development-guide.md)     | 开发工作流：命令、架构治理、测试入口、日志规范                                               |

## 辅助包速查

以下小包在主文档中单独成节或一句话带过，此处给出速查：

| 包                          | 职责                                                                                  | 详见                                         |
| --------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/rpc`              | VS Code 风格的自研 RPC/IPC 框架（传输无关）                                           | [03-protocols.md](03-protocols.md)           |
| `packages/shared`           | 跨进程契约层：协议 schema（zod）、领域类型、`IPlatformService`                        | [03-protocols.md](03-protocols.md)           |
| `packages/client`           | 消费侧服务访问 SDK（MessagePort / WebSocket / 任意 protocol → `RemoteServiceAccess`） | [08-services-layer.md](08-services-layer.md) |
| `packages/provider`         | 模型 Provider 配置内核（平台无关纯逻辑）                                              | [09-provider-model.md](09-provider-model.md) |
| `packages/provider-node`    | Provider 配置的 Node 落地（文件仓库、内置配置下载物化）                               | [09-provider-model.md](09-provider-model.md) |
| `packages/model-option-map` | 受限 CEL 解释器：reasoning/输出长度 → JSON Merge Patch                                | [09-provider-model.md](09-provider-model.md) |
| `packages/zcode-cua`        | Computer Use 契约占位包（本构建无实现，fail-closed）                                  | [01-overview.md](01-overview.md)             |
| `packages/formal-proof`     | 对话产品行为状态空间枚举器（独立 d3 小工具）                                          | [01-overview.md](01-overview.md)             |

## 术语约定

- **Host**：Electron `utilityProcess` 形式的窗口服务进程，承载本地服务集合与远程连接（不是网络意义上的 host）。
- **Agent**：`apps/zcode-cli` 构建出的 `zcode` 可执行（`zcode.cjs`），以 `app-server --stdio` 子进程形态被宿主拉起。
- **宿主（Host App）**：承载 Agent 进程并向前端暴露服务的进程，当前有三种：Desktop Host、`@zcode/server`、`zcode-server-cli` 的 server-core。
- **workspaceIdentity / workspacePath**：身份键 vs 文件路径，见 [11-state-and-data-flow.md](11-state-and-data-flow.md)。
- **desktop-continuous / web-remote-replayable**：实时链路 vs 可回放链路两种 clientMode，见 [11-state-and-data-flow.md](11-state-and-data-flow.md)。
