# HZCode 打包形态 Spec（公司自有 zcode 客户端，Windows x64）

## 背景与目标

公司需要在开源 ZCode 之上封装一个自有品牌客户端 **HZCode**，供 Windows x64 环境使用。要求：

- 形态与 ZCode 保持一致（同一 CLI 源码、同一 SEA 打包链路）；
- **功能代码不动**：工具行为、协议、存储、环境变量全部维持现状；
- 仅改变**打包形态**与**进程命名**，使 hzcode 与 zcode 在产物文件名和进程级别可区分（可并存、可在任务管理器/进程列表中识别）；
- 暂不发布到 registry，先在仓库内成型。

## 产品名（product）机制

构建脚本新增统一的 `--product <name>` 参数（默认 `zcode`）：

| 层                             | 默认（zcode，现状不变）           | `--product hzcode`                 |
| ------------------------------ | --------------------------------- | ---------------------------------- |
| CLI bundle（esbuild outfile）  | `dist/zcode.cjs`                  | `dist/hzcode.cjs`                  |
| SEA blob / config              | `dist/zcode-<target>.sea.blob` 等 | `dist/hzcode-<target>.sea.blob` 等 |
| SEA 产物名                     | `zcode-windows-x64.exe`           | `hzcode-windows-x64.exe`           |
| 进程标题（`process.title`）    | `zcode-cli`                       | `hzcode-cli`                       |
| `zcode doctor` 上报的 cli.name | `zcode`                           | `hzcode`                           |
| CLI help 中的命令名            | `zcode`                           | `hzcode`                           |

产品名通过 esbuild `define __CLI_PRODUCT_NAME__` 注入，单一事实源是
`apps/zcode-cli/packages/cli/src/process-name.ts`（`CLI_COMMAND_NAME` / `CLI_PROCESS_NAME`）。
未注入时（tsx dev、旧构建）回退 `zcode`，保证存量链路零迁移。

## 状态所有者与注入链路

```text
构建脚本（build.mjs / build-sea.mjs，--product 参数唯一入口）
  │ esbuild define __CLI_PRODUCT_NAME__
  ▼
process-name.ts（运行期产品名单一事实源）
  │ CLI_COMMAND_NAME / CLI_PROCESS_NAME
  ├─ main.ts 入口 setCliProcessTitle() → process.title = "hzcode-cli"
  ├─ run.ts doctor payload → cli.name / cli.processName
  └─ help.ts formatCliHelp → i18n help(version, commandName)
```

SEA 场景下 Windows 进程名由 exe 文件名决定（`hzcode-windows-x64.exe` → 进程列表显示
hzcode-windows-x64），`process.title` 覆盖 Node 语义下的进程标识，两层都指向产品名。

## 明确不变（与 zcode 共享）

- 存储目录默认仍为 `~/.zcode`（`ZCODE_STORAGE_DIR` 可覆盖）；hzcode 与 zcode 并存时共享存储，属有意决策：功能代码不动。
- 所有 `ZCODE_*` 环境变量、协议、provider 配置、SEA 资产布局不变。
- Desktop 集成、`build:sea`（全平台 zcode 产物）、下游 release 下载器命名 `zcode-windows-<arch>.exe` 均不受影响（默认 product=zcode 路径字节级不变）。

## 命令

```bash
# 仓库根
pnpm build:hzcode
# 等价于：turbo 构建依赖 → esbuild --product hzcode → SEA --product hzcode --target win-x64
# 产物：apps/zcode-cli/packages/cli/dist/hzcode-windows-x64.exe
```

其余平台仍可通过 `node scripts/build-sea.mjs --product hzcode --target <target>` 自行打包；
HZCode 的验收目标仅为 win-x64。

环境要求（与 `build:sea` 一致，非本特性新增）：

- Node 与 pnpm 版本以 `mise.toml` 为准（Node 24.14.0）；SEA 内嵌的 Node 运行时版本取宿主
  版本，且许可证 provenance 只登记了已审版本，用其他宿主版本构建会失败。
- 首次构建前需完成 `packages/*` 的 `pnpm build`（SEA 运行时资产解析依赖各包 dist）。

## 校验约束

- `--product` 值必须匹配 `^[a-z][a-z0-9-]*$`，防止产出非法文件名/进程名。
- `pnpm build`（无 --product）产物与改动前完全一致。
- `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过。

## 验收场景

| #   | 场景                                   | 预期                                                                                               |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `pnpm build:hzcode`                    | 产出 `dist/hzcode.cjs` 与 `dist/hzcode-windows-x64.exe`                                            |
| 2   | 默认 `pnpm build` / `build:sea`        | 产物名、进程名与现状一致（zcode）                                                                  |
| 3   | hzcode exe 运行（win-x64）             | 进程标题为 `hzcode-cli`；`hzcode doctor --json` 的 `cli.name=hzcode`；help 显示 `hzcode [command]` |
| 4   | 非法 `--product`（如 `../evil`、大写） | 构建脚本报错退出                                                                                   |
