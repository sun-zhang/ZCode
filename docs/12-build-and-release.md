# 12 · 构建与发行

## 1. 初始化与依赖

```bash
pnpm bootstrap          # 安装 workspace 依赖 + 准备桌面本地运行资源 + build:bootstrap（跳过远程资源）
pnpm bootstrap:with-remote  # 附加远程资源（mock-cdn）准备，跳过桌面 bundle
pnpm install            # 仅安装依赖
pnpm prepare:desktop-runtime  # 桌面运行资源（默认含远程）
pnpm prepare:remote-assets   # 单独准备远程资源
```

- 版本锁定：`mise.toml`（Node 24.14.0 / pnpm 10.33.2）；`mise run bootstrap` / `mise run dev` 等封装了隔离环境任务。
- 补丁：`patches/`（`@ai-sdk/openai-compatible`、`@ai-sdk/anthropic`、`@arms/rum-electron`）经 pnpm `patchedDependencies` 应用。
- 第三方声明：`third-party/`（生成与发行校验，见其 README）。

## 2. 开发运行

| 命令                                       | 说明                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm dev:desktop`（= `dev:desktop:prod`） | `scripts/dev-desktop-env.mjs production`：准备本地运行资源、构建桌面 Agent、启动 Electron + 源码监听 |
| `pnpm dev:desktop:test`                    | 测试环境配置                                                                                         |
| `pnpm dev:desktop:bytecode`                | 以 bytecode 形态运行桌面 Agent                                                                       |
| `pnpm dev:desktop:remote-prod`             | 远程功能连生产的桌面开发                                                                             |
| `pnpm dev:web`                             | server（:3030）+ web（:5173）并行；`/ws`、`/api` 代理到本地后端                                      |
| `pnpm --filter @zcode/cli dev`             | 直接源码运行 Agent CLI（不经发行包 `--web` 分流）                                                    |

独立数据目录：`ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test`。

## 3. 各包构建形态

| 包                              | 工具                                                                                          | 产物                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/desktop`              | tsup（main/host/scheduler ESM、preload CJS）+ vite（renderer）+ electron-builder              | `out/*` → `.dmg/.zip`（mac）、`.exe`（win）、`.AppImage/.deb/.rpm`（linux）                      |
| `apps/zcode-cli/packages/cli`   | esbuild 单文件 CJS                                                                            | `dist/zcode.cjs`（bin `zcode`，target node22，external：`@zcode/tui`/`playwright-core`/`koffi`） |
| `@zcode/tui`                    | 独立 ESM bundle（`scripts/build.mjs`）                                                        | 供 CLI 原生动态 import                                                                           |
| `packages/server`               | tsup；`build:remote` 打包远端部署 bundle                                                      | dist/entry-http.js、remote bundle                                                                |
| `packages/ui`、`packages/web`   | ui 源码直发；web 为 vite                                                                      | web 静态根                                                                                       |
| `packages/zcode-server-cli`     | tsup + `packaging/stageCli.ts`                                                                | `dist/server-cli.js`（bin `zcode`，守护形态）                                                    |
| 其他（shared/rpc/services/...） | tsc project references（`pnpm typecheck` 覆盖 `packages/rpc ... desktop/tsconfig.host.json`） | 源码直发                                                                                         |

## 4. 桌面打包

```bash
pnpm bundle:desktop                      # 默认 mac arm64 → packages/desktop/dist/
pnpm bundle:desktop -- --os win --arch x64
```

流程要点（`packages/desktop/scripts/bundle.mjs` + `electron-builder.config.js`）：

- **runtime assets**（`scripts/prepare-runtime-assets.mjs`）：远端原生二进制（mock-cdn/缓存，`scripts/prepare-prebuilds.mjs`）、Agent bundle（`prepare-agent-node-bundle.mjs`：`zcode.cjs` + 插件 runtime → `bundled-agents/<platform>/glm`，复用 Electron Node 使体积 ~180MB→~16MB）、ripgrep 等原生搜索工具（`scripts/build-native-search-tools.mjs`）、macOS window-bounds、Windows browser-import-helper。
- **Agent bytecode**（根 `scripts/build-desktop-agent-bytecode.mjs`，`dev:desktop:bytecode` / `build:desktop-agent:bytecode`）：`zcode.bytecode.cjs` loader + `zcode.bytecode-<sha256>.jsc`（不可变、sha256 校验）+ runtime helper；运行时 `--no-lazy --no-flush-bytecode` 加载。
- **extraResources**：`resources/glm`（Agent bundle）、`tools/ripgrep`、图标、`config/default.json`、内置 Provider 配置（`config/provider/zcode-builtin.json`）、macOS window-bounds。
- **asar 后机械校验**：必需 runtime 模块闭包（otel、@babel/runtime、undici、node-forge、ssh2 链等）、原生包违规检查（`desktop-native-package-policy.mjs`）、sourcemap 清理、Windows NSIS 补丁、app.asar 重打包；bundle 三次重试 + 产物扩展名校验。
- 本地构建未签名：macOS 首次打开需 `sudo xattr -rd com.apple.quarantine /Applications/ZCode.app`。
- macOS 发行体检：`pnpm doctor:macos-release`。

## 5. CLI 发行包（zcode 命令行版）

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/   # 或已设 ZCODE_DIST_BASE_URL
pnpm build:zcode --skip-build    # 复用已有产物仅组包
```

- `scripts/build-zcode.mjs` 依次构建 CLI/TUI、后端和 Web，收集 TUI 原生库、worker 与运行时依赖，组装 `dist/zcode/`：
  - `releases/<version>/zcode-<version>.tar.gz` + `sha256.txt`（运行包）
  - `latest.json` + `install.sh`（版本索引与安装脚本，默认装到 `~/.zcode/runtime`，`~/.local/bin` 建 `zcode` 命令；`ZCODE_DIST_HOME`/`ZCODE_DIST_BIN_DIR` 可改）
- 运行包结构：`server/entry-http.js` + web 静态根（`ZCODE_WEB_STATIC_ROOT`）+ `agent/zcode.cjs` + `bin/zcode.mjs`（`--web` 分流 runner）。
- 运行仍需 Node.js（版本以 mise.toml 为准）；局域网监听 `--host 0.0.0.0` 时默认生成访问令牌。

## 6. SEA 单可执行（build:sea）

`apps/zcode-cli/packages/cli/scripts/build-sea.mjs`（根命令 `pnpm build:sea` / `build:sea:all`）：

1. 收集资产：TUI 运行时、官方插件、bundled skills、运行时工具、Playwright、Provider 配置、Node license。
2. 生成 `sea-config-<target>.json`（`main: dist/zcode.cjs`；`useCodeCache:false`、`useSnapshot:false`——纯 JS 注入，无 V8 code cache/snapshot）。
3. `node --experimental-sea-config` 生成 blob → 下载平台 Node 二进制（`sea-node-download.mjs`）→ `postject` 注入（macOS 去 signature 后 ad-hoc；Windows Authenticode，`windows-authenticode.mjs`）。
4. 运行时按需解包资产（TUI：`tui-runtime-loader.ts` 从 `node:sea` 解包；工具：`sea-runtime-tools.ts`）。

## 7. 发布

- 桌面/CLI 版本随根 `package.json`（当前 3.14.3）；`release-it`（`pnpm release`）与 CLI 独立发布（`pnpm release:cli` / `release:cli:dry`）。
- 发行列表参考 README「更新」记录与 `.env.example`（`ZCODE_DIST_BASE_URL` 等构建配置；本地覆盖放 `.env.local`）。
