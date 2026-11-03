# 13 · 开发指南

## 1. 每日命令（仓库根目录）

| 用途             | 命令                                                   |
| ---------------- | ------------------------------------------------------ |
| 基线检查         | `node scripts/check-workspace-freshness.mjs`（开工前） |
| 类型检查         | `pnpm typecheck`                                       |
| Lint / 修复      | `pnpm lint` / `pnpm lint:fix`                          |
| 格式检查         | `pnpm fmt:check`（oxfmt）                              |
| 提交前检查       | `pnpm verify:pre-push`（Lint + 架构检查 --changed）    |
| 架构检查         | `pnpm architecture:check --changed`                    |
| 模块阅读包       | `pnpm architecture:context <module-id>`                |
| 未使用依赖与导出 | `pnpm knip`                                            |
| 导出引用查询     | `pnpm dep:refs --list-exports <file>`                  |
| 依赖图           | `pnpm dep:graph`（`scripts/dependency-graph.mjs`）     |

完整命令清单见根 [README.md](../README.md) 与 `mise.toml`（`mise run dev` / `dev-web` / `typecheck` 等封装）。

## 2. 架构治理

- 策略文件 `architecture-policy.yaml`：声明模块（roots）、受管状态（`managed: true` 才纳入强制检查，如 `storage` 模块的 domain/app/adapters 分层）、公共入口（`publicEntrypoints`）、全局约束（`maxFileLines: 400`、`maxContractLines: 300`、`maxPublicMethods: 12`、`forbidCycles`、`forbidDeepImports`）。
- 检查器：`scripts/architecture/architecture-check.mjs`（check / report / baseline:update / context 四个子命令）；存量模块逐步迁移为 managed。
- 配套技能：`.agents/skills/architecture-governance/SKILL.md`（代码改动时使用：先跑架构检查，再读目标模块受控上下文）；`.agents/skills/dep-refs/SKILL.md`（删除导出前验证引用）。
- **工作流约定（AGENTS.md）**：新增/修改行为前先更新对应 spec；先明确产品规则、状态所有者、接口与验收场景再写代码；定位问题未明确要求改代码时先调查原因并区分已确认原因与待验证假设。

## 3. 测试

- **无统一单测/E2E 命令**：测试入口以目标包当前 `package.json` 与实际测试文件为准。
- 行为改动需先补对应测试；交互改动需要 E2E 场景；必须实际执行可用的验证并在结果中如实说明（未执行或环境受限时明示）。
- 相关资源：`packages/formal-proof`（产品行为状态空间枚举，`./model` 入口可被测试复用）、`packages/ui` 的 `./e2e-store-bridge`（E2E 测试桥）、`apps/zcode-cli/tools/prompt-trajectory`（prompt/模型 IO 轨迹记录回放）。

## 4. 实现纪律（摘要）

- 单一状态所有者：避免重复状态与多条写入路径；明确接口、依赖方向、事件顺序与幂等边界；**不能用超时掩盖同步问题**。
- 修复 bug 用中文注释说明原因与依据；发现设计缺陷先与用户对齐，不不断增加兜底分支。
- 异步文件与网络 IO；跨包导入使用公开入口与既有路径别名。
- 禁止：UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节、循环依赖。

## 5. UI 与平台边界（摘要）

- 遵守 [DESIGN.md](../DESIGN.md)（`text-ui-*` 字体 scale 是强制约束；主题 light/dark + Zai 变体）；插件商店术语用 [CONTEXT.md](../CONTEXT.md)。
- 组件经 `packages/ui/src/hooks/` 访问服务；平台操作经 `IPlatformService`（`packages/shared/src/platform.ts`），不直接 `window.zcode`。
- Desktop/Web/本地/远程差异用依赖注入处理；兼顾 Windows/macOS/Linux 与移动 Web。
- Zustand 状态在 `packages/ui/src/store/`；广播字段（theme/locale/uiFontSizePx/interfaceMode）改动必须维持防回环机制。
- hooks 中含 JSX 的文件用 `.tsx`。

## 6. 日志规范

| 场景         | 用法                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| UI           | `packages/ui/src/logger.ts`（生产 no-op 门控 + `window.zcode.log` 桌面桥）；禁止 `console.log` / `window.zcode?.log` 直用 |
| 服务         | `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`），首参 traceId                             |
| debug        | 协议原始数据、流式 chunk、逐条工具更新等高频诊断；生产不落盘                                                              |
| info         | 进程/会话生命周期、权限结果、一次性初始化                                                                                 |
| warn / error | 可恢复异常 / 崩溃、握手失败、鉴权丢失等不可恢复错误                                                                       |
| 红线         | 不在日志、示例或提交写入凭据、真实用户数据、内部服务地址                                                                  |

## 7. 提交

- husky + lint-staged（`prepare: husky`）；提交前 `pnpm verify:pre-push`。
- 版本与变更：release-it + conventional commits（`@release-it/conventional-changelog`）；CLI 独立发布 `pnpm release:cli`。
- 保留与任务无关的本地改动；不自行恢复已移除的模块或内部依赖。

## 8. 常见排查入口

| 症状              | 入口                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| 桌面进程/会话异常 | Main 日志（`hostLogRelay.ts`）、`HostResponseTypes.AgentProcess*` 上报链、ARMS 稳定性遥测                     |
| Agent 启动失败    | `ZCodeAgentProcessManager` 命令解析链（env → bundled-agents → 远端二进制）；`zcode doctor`                    |
| RPC 不通          | `LoggingChannelServer` 日志、`network-telemetry-middleware`、能力位握手（capability / hello）                 |
| 远程连接失败      | `windowRemoteConnectionRegistry` 状态机、`packages/server/src/remote/deploy.ts` 资产链、mock-cdn 目录是否存在 |
| 协议解析失败      | zod strict 校验（`zcodeProtocolMessageSchema`）报错信息通常直接指出多余/缺失字段                              |
| 状态不同步        | v4 snapshot resync、TaskRealtimeBus 回放上限（60 批）、`streamClientId` 过滤                                  |
