# 06 · Web 客户端与服务端（packages/web、packages/server、packages/zcode-server-cli）

## 1. packages/web（Web 客户端）

极薄宿主壳（约 10 文件），与 Electron renderer 平行：依赖仅 `@zcode/client`、`@zcode/shared`、`@zcode/ui` + react。

- **技术栈**：Vite 8 + React 19 + Tailwind v4；`@` 别名指向 `../ui/src`（ui 源码中的 `@/` 导入在 web 构建可解析）；`define` 注入 `__ZCODE_VERSION__`、`VITE_ZAI_OAUTH_*` 等。
- **无路由库**：`src/main.tsx` 的 `bootstrapWebApp()` 按路径手动分发三类页面：
  1. **OAuth 回调页**（`/cn/share/callback`、`/share/callback` 带 state+code）→ `src/auth/WebCallbackPage.tsx`；
  2. **会话分享页**（`isConversationSharePath()` 识别 `/share`、`/cn/share`）→ `ConversationShareLandingPage.tsx`，复用 ui 子入口 `@zcode/ui/conversation-share-readonly`（只读时间线，静态 import 受安全边界约束）；preview 数据经 `/api/v1` HTTP fetch；
  3. **主应用**：`resolveWebBootstrap()` 解析 wsUrl 后渲染完整 `Root`。
- **通信**：主通道 `connectViaWebSocket(wsUrl)`——默认 `wss|ws://<host>/ws`；带 `?remote=<id>` 时连 `/ws/remote/<remoteId>`（手机远控入口）。辅助通道：`/api/server-info`（首个 workspace 路径与 identity）、`/api/v1`（分享/OAuth token）。
- **dev 代理**（vite.config.ts）：`/ws` → `localhost:3030`、`/api` → `localhost:3030`、`/api/v1/oauth/token` → 线上 endpoint。
- **平台适配**：`createWebPlatform()` 实现 Web 版 `IPlatformService`——文件选择返回 null、`openExternal` 用 `window.open`、通知用浏览器 Notification API、更新器/Dock 徽标 no-op、`getDeviceId` 用设备指纹。
- **宿主开关**：`RootProps`（`packages/ui/src/root/types.ts`）——`preferDirectoryBrowser`（Web 无系统目录框）、`supportsEmbeddedBrowser=false`（仅桌面）、`allowRemoteWorkspace=false` 等。
- **主题防闪烁**：`index.html` 内联脚本在读 JS 前设置 `data-zcode-bootstrap-theme`；分享页默认 `zai-light`，其余默认 `zai-dark`（`src/webThemeSeed.ts`）。

## 2. packages/server（Web 后端，Hono）

- **框架**：Hono 4 + `@hono/node-server` + `ws`（不是 Fastify/Express）。入口：`.` → `createHttpServer`；`./stdio` → stdio 服务；`./remote/*` → 远程后端。
- **路由**（`src/http.ts`）：

| 路由                                | 作用                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/server-info`              | 返回 `ServerRemoteInfo`（serverId、版本、协议版本、workspaces、capabilities） |
| `POST /api/rpc-host-capability`     | 签发一次性 host capability（`src/hostCapability.ts`）                         |
| `GET /ws`                           | WebSocket 升级 → `setupChannelServer(..., "web-remote-replayable")`           |
| `GET /ws/host`                      | 需 capability 头，`clientMode = "desktop-continuous"`（trusted-host-relay）   |
| `POST /api/connect-remote`          | Web 发起远程连接（内存 `remoteConnections` Map，返回随机 id）                 |
| `GET /ws/remote/:id`                | 把远程连接的 file/git/system/terminal 服务桥接给浏览器                        |
| `POST /api/bots/:provider(/:botId)` | Bot webhook 回调（校验 `x-zcode-bot-secret`）                                 |
| `GET *`                             | 静态资源 + SPA fallback（目录穿越防护）                                       |

- **鉴权**：`ZCODE_SERVER_AUTH_TOKEN`/`authToken` 时对 `/ws*`、`/api/*` 校验 token（query `?token=` 或 `zcode_lite_token` HttpOnly cookie）；token 同时决定 Provider Provisioning 是否启用——非受信模式下 `IProviderProvisioningTargetService` 被替换为抛错 stub。
- **WebSocket RPC**：`wrapWebSocket` → `ISocket` → `SocketProtocol` → `ChannelServer` → `services.exposeOnChannelServer`；每连接 `createZCodeAgentConnectionScope` 隔离 Agent 服务视图。
- **stdio 形态**（`src/entry-stdio.ts`、`stdio.ts`）：stdout 专属 RPC 帧、console 进 stderr；启动发 `zcode-hello` 等 `hello-ack`；角色固定 `desktop-continuous`/`trusted-host-relay`。这是远程机器上 Agent 服务被拉回宿主的通道。
- **Agent 拉起**：不在 server 包内，复用 `packages/services/src/zcode-agent/` 的进程管理（见 [08-services-layer.md](08-services-layer.md)）。
- **环境变量**：`ZCODE_SERVER_WORKSPACE`（默认 workspace，缺省 `process.cwd()`）、`ZCODE_SERVER_ID/NAME`、`ZCODE_SERVER_HOST`/`PORT`（默认 3030）、`ZCODE_WEB_STATIC_ROOT`、`ZCODE_SERVER_AUTH_TOKEN`、`GLM_BINARY_PATH`/`ZCODE_AGENT_SERVER_COMMAND(+_ARGS_JSON)`。

## 3. packages/zcode-server-cli（守护发行形态）

bin 名 `zcode`（`./dist/server-cli.js`）。**不依赖 `@zcode/server`**，自带平行的 server-core——同一服务内核（`@zcode/services` + Hono WS RPC + 同款路由）的守护化发行。

```mermaid
flowchart TB
    C[cli.ts runServerCli<br/>serve/status/stop/restart/update/uninstall] <-->|"Unix socket 控制协议<br/>SERVER_CLI_PROTOCOL_VERSION"| SUP
    SUP[Supervisor<br/>Core 子进程代际、CrashBudget、更新回滚] --> CORE[server-core<br/>entry.ts → core.ts runServerCore<br/>createLocalServices + HTTP(loopback) + IPC ready/heartbeat]
    CORE --> A[Agent 子进程<br/>agentWiring.ts 注入 zcode.cjs]
    RT[runtime/<br/>releaseManager / releaseInstaller / lock / serviceInstallation] --> SUP
```

- 定位：面向"下载即用的后台服务"场景，额外提供守护、自更新（release 下载 → 候选启动 → 回滚）、OS 服务注册（`serviceInstallation.ts`）。
- `runtime/agentWiring.ts`：`createReleaseAgentWiring` 把随包 `zcode.cjs` 以 `ZCODE_AGENT_SERVER_COMMAND` + `ZCODE_AGENT_SERVER_ARGS_JSON` 注入（env 优先级最高）。

## 4. 与 dev:web 的关系

根 `pnpm dev:web` = `@zcode/server dev`（dist/entry-http.js）+ `@zcode/web dev` 并行。Agent 源码改动后需 `pnpm --filter @zcode/cli... build` 并重启服务（README 约定）。
