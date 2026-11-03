# 07 · UI 层（packages/ui）

`@zcode/ui`：共享 React 组件/hooks/Zustand store，**TS 源码直发无构建产物**，被桌面 renderer 与 web 共同消费（peerDeps：react 19、@tanstack/react-virtual）。多入口 exports（`package.json`）：`.`（主桶）、`./useTheme`、`./conversation-share-readonly`（分享页只读时间线，独立入口控制体积与安全边界）、`./oauth-provider-icon`、`./message`、`./e2e-store-bridge`、`./remote-workspace-session-store`、`./styles.css`、`./replay`（浏览器静态回放页）。

## 1. 目录组织

「功能域顶层目录 + components/hooks/store/lib 四个横切目录」：

- **功能域**：`app-shell/`、`root/`（RootShell、启动门控、root 级 effects）、`v4/`（新版会话/对话核心：SessionPane、ConversationComposer、conversationProjectionStore、composer/）、`WorkspaceSidebar/`、`git-graph/`、`GitPane/`、`terminal/`、`ToolCallBlocks/`（含 renderers/）、`prompt-editor/`、`mentions/`（Lexical）、`settings/`、`login/`、`onboarding/`、`remote-connection/`、`browser-use/`、`cua-permission/`、`resource-manager/`、`presentation/`、`BotsDialog/` 等。
- **components/**：`ui/`（shadcn 风格基础件约 40+：button/dialog/tabs/tooltip/resizable/diff-viewer/code-viewer/pdf-viewer 等）、`ai-elements/`（message/conversation/prompt-input/reasoning/plan/canvas/mermaid-block 等约 40+）、`icons/`、`workflow-graph|timeline|run-line/`。
- **hooks/**（约 100 文件）：服务访问层（见 §3）。
- **store/**（约 40 文件）：见 §4。
- **lib/**（100+ 纯逻辑）、`i18n/`（IntlProvider、LocaleSwitcher、zh-CN/en-US）、`workers/`、`logger.ts`。

## 2. 双通道服务访问（强制纪律）

`src/hooks/index.ts` 顶部注释明确："组件应通过 hooks 访问服务，不再直接使用 services._ 或 window.zcode._"。

| 通道                 | Provider / Hook                                                                                                        | 承载内容                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 服务通道（RPC）      | `ServiceProvider` / `useServices()`（`hooks/useServices.tsx`）、`useWorkspaceServices()`（工作区级/远程会话 accessor） | 业务服务：文件、终端、设置、凭据、Git、插件等（`IServiceAccessor`）                                                                              |
| 平台通道（宿主能力） | `PlatformProvider` / `usePlatform()`（`hooks/usePlatform.tsx`）                                                        | 必须穿越进程边界且不适合 RPC 的操作：原生对话框、窗口生命周期、系统通知、桌面更新器（`IPlatformService`，`packages/shared/src/platform.ts:529`） |

典型服务 hook 模式：`useSettingService.ts`、`useFileService.ts`、`useGitRepository.ts`、`useZCodeAgentService.ts` 等——从 Context 拿 accessor → 调服务 descriptor → SWR/本地 state 包装。

## 3. Zustand store 与跨窗口广播

### 3.1 store 分类

- **全局 store（带广播）**：`store/index.ts` `createZCodeStore(broadcastService)`——theme、locale、interfaceMode（office/coding 双界面）、uiFontSizePx、通知开关、user/authSessionSeq、OAuth 登录状态机、onboarding 等。
- **会话/工作区分桶（不广播）**：`zcodeSessionStore.ts`（按 workspacePath+workspaceIdentity 分桶的聊天/任务 UI 状态，分片 TaskSlice/WorkspaceSlice/Navigation）、`tabStore.ts`（多标签页，持久化走 settingService）、`taskQueryCacheStore.ts`（任务列表缓存 + membership + unread 乐观 overlay）、`remoteWorkspaceSessionStore.ts`（远程会话注册表，sessionId → IServiceAccessor 双索引）。
- **领域 store**：`mcpStore.ts`、`pluginStore.ts`/`pluginManagementStore*.ts`（插件市场，术语见 CONTEXT.md）、`skillStore.ts`、`subagentsStore.ts`、`offPeakTaskStore.ts`（经 IOffPeakTaskService RPC）、`savedWorkflowStore.ts`、`whiteboardStore.ts`、`remotePinnedTaskStore.ts`/`remoteTimelineTaskStore.ts`（手机远控）、`conversationShareSelectionStore.ts` 等。

### 3.2 广播同步与防回环

只有 `BROADCAST_FIELDS = {theme, locale, uiFontSizePx, interfaceMode}` 四个字段跨窗口同步。链路：Renderer → Host → Main(BroadcastHub) → 其他窗口 Renderer（`IBroadcastService`，`packages/services/src/broadcast/broadcast.ts`，另提供 `acquireClaim/commitClaim/tryClaim` 原子占位用于"多窗口只播一次"）。

三重防回环：

1. **store 层**：模块级 `applyingBroadcast` 标志——订阅器在应用广播期间产生的变化不再广播；接收侧 setter 执行期间置位（含 localStorage/DOM 副作用），finally 复位。
2. **语言层**（`i18n/IntlProvider.tsx`，语言切换真实发生处）：`applyingBroadcastRef` + `ignoredLocalLocaleBroadcastPayloadRef`——本地刚发出的 payload 依据 `BroadcastMessage.sourceWindowId` 在回声时被忽略；payload 结构化 `{preference, resolvedLocale}` 防止 system 偏好被降级；`localePreferenceOperationSeqRef` 序号防过期异步覆盖。
3. **主题**：`useTheme.ts` 维护 `light/dark/zai-light/zai-dark/system` 五态，切 `documentElement` class；system 持续监听 `matchMedia`。

## 4. 日志（src/logger.ts）

- 级别 debug/info/warn/error + `logger.lifecycle.*`（生产仍经桌面桥落盘的筛选生命周期诊断）+ `logger.trace(traceId, ...)` + `logMemoryDiagnostics`。
- 生产门控：production build 下常规日志 no-op（防 console 格式化/IPC 拖慢渲染主线程）；非 debug 级经 `window.zcode.log`（preload 桥）由 Main 落盘。
- 前缀统一 `formatLogPrefix("ui")`（`@zcode/shared`）。**禁止组件直接 `console.log` / `window.zcode?.log`。**

## 5. 移动端适配（无独立移动包，三条路径）

1. **手机远控模式**：`?remote=<id>` → `/ws/remote/<id>`；设备指纹 `generateMobileDeviceFingerprint()`（`lib/streamClientId.ts`，保证流式 owner/observer 过滤有稳定 clientId）；远控语言以桌面 setting.json 为准（`IntlProvider` 的 `preferSettingServiceLocale`）。
2. **触摸/小屏就地检测**：组件内 `window.matchMedia("(hover: none)")`（TaskListItem、WorkspaceSidebarItem、ConversationComposer 等）；`lib/pickerFocus.ts` 用 `(hover:none) and (pointer:coarse)`；`isMobileViewport` 作 prop 下传（移动端跳过自动聚焦键盘等）。
3. **响应式布局**：Tailwind 断点 + 少量 media query（分享页 `@media (min-width: 40rem/80rem)` 等）。

UI 视觉规范（字体 scale、主题、色彩令牌）一律以 [DESIGN.md](../DESIGN.md) 为准。
