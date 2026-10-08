# HTTP 代理模式（always / onDemand）Spec

## 背景与目标

现有代理配置只有一种语义：配置 `httpProxy` 后默认所有请求走代理，`noProxy` 清单排除直连地址。
该方式对「大部分目标直连可达、少数目标需要代理」的用户不方便。本特性新增「按需代理」模式：

- 默认所有 HTTP 请求直连；
- 仅「走代理清单」（`httpProxyUseProxyHosts`）命中的 host 走代理；
- 使用过程中发现网络请求不通时，向用户确认后把失败 host 加入清单。

## 模式语义

| 模式 | 默认（未命中清单） | 清单字段 | 清单命中 |
| --- | --- | --- | --- |
| `always`（默认，兼容现状） | 走代理 | `httpProxyNoProxy`（不走代理） | 直连 |
| `onDemand` | 直连 | `httpProxyUseProxyHosts`（走代理） | 走代理 |

不变量：

- `onDemand` 下 `noProxy` 不参与判定（两清单语义互斥，避免同一请求同时命中两条规则）。
- `onDemand` 下若未配置 `httpProxy`，即使清单命中也保持直连（无代理可用）。
- 清单 token 语法复用 noProxy 现有格式：`host,.domain.com,*.corp.com`（实现复用 `shouldBypassProxy`）。
- 未设置 `httpProxyMode` 时等价 `always`，存量用户零迁移。

## 状态所有者与写入路径

```text
AppSettings（唯一持久化 owner，桌面/服务端 settingService）
  httpProxy / httpProxyNoProxy / httpProxyMode / httpProxyUseProxyHosts / httpProxyCaCertPath
    │ spawn agent 时读取（agentProxyEnv.buildAgentRuntimeEnv）
    ▼
agent 子进程 env：ZCODE_HTTP_PROXY / ZCODE_NO_PROXY / ZCODE_PROXY_MODE / ZCODE_USE_PROXY
    │ env-config.adapter 解析
    ▼
RuntimeConfig.network：httpProxy / noProxy / proxyMode / useProxy
    ▼
resolveProxyForRequest（apps/zcode-cli adapters network/http-config.ts，判定唯一所有者）
```

- `onDemand` 模式下 spawn env **不设置**标准 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY` 三件套，
  Bash/MCP stdio 子进程默认直连（这是该模式的明确产品边界）。
- 时效：与现有代理设置一致——应用层 fetch 在 agent 重启后生效；设置页保存提示重启。

## 失败确认交互（仅 Desktop/Web UI）

```text
agent 统一 fetch 失败 → model_request_failed 事件（reason=network_error/timeout、baseURL）
  → renderer telemetry supervisor 识别（fact.providerHostname + fact.reason）
  → proxySuggestion store 记录候选 host（仅记录，不写设置）
  → ProxySuggestionBanner 提示用户
      ├─ 确认 → settingService.update({ httpProxyUseProxyHosts: ... })（唯一写入路径）→ 清除建议
      └─ 忽略 → 清除该 host 建议
```

- 判定「疑似需要代理」：`reason ∈ {network_error, timeout, stale_connection, proxy_error}` 且
  该 host 未被现有清单覆盖。
- 不做自动静默添加；写入必须经用户确认。
- CLI TUI 的确认交互不在本特性范围（后续按需补充）。

## 环境变量

| Key | 用途 | 优先级 |
| --- | --- | --- |
| `ZCODE_PROXY_MODE` | `always`/`onDemand`，桌面 spawn 注入 / CLI 直接设置 | 显式 options > env |
| `ZCODE_USE_PROXY` | onDemand 走代理清单，逗号分隔 | 显式 options > env |
| `ZCODE_REMOTE_PROXY_MODE` / `ZCODE_REMOTE_USE_PROXY` | desktop-attached remote（WSL）一次性下发 | 同现有 ZCODE_REMOTE_* 语义 |

错误行为：非法 `ZCODE_PROXY_MODE` 值按 `always` 处理（fail-safe 兼容现状）。

## 范围边界

- 内置浏览器出口（desktopNetworkPolicy）不受模式影响，继续按 `httpProxy`/`noProxy` 配置。
- **Host API（套餐查询/账号等后端请求）遵循同一模式**：`createHostApiNetworkTransport` 的
  `resolveHostProxyForUrl` 在 `onDemand` 下默认直连、仅清单命中走代理，与 agent 出口规则一致，
  避免「agent 已按清单走代理、套餐查询仍直连失败」的出口分叉。
- `onDemand` 下 Bash 子进程内 curl 等外部命令默认直连（不设标准代理三件套）。
- 远程 WSL 链路透传模式与清单，SSH/Docker backend 不消费该边界（同现状）。
- 套餐查询失败目前没有「加入代理清单」一键提示（该提示仅覆盖模型请求）；需要把后端 host
  手动加入清单或切回 always 模式。

## 验收场景

1. `always`（或不设置模式）+ httpProxy + noProxy：行为与改动前完全一致（回归）。
2. `onDemand` + httpProxy + 清单 `api.example.com`：该 host 走代理，其他 host 直连。
3. `onDemand` 未配置 httpProxy：全部直连。
4. `onDemand` 下 agent 子进程 env 无 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`；`ZCODE_HTTP_PROXY`/`ZCODE_PROXY_MODE`/`ZCODE_USE_PROXY` 存在。
5. `onDemand` 模型请求失败（network_error/timeout）→ UI 出现「加入代理清单」提示；确认后
   `httpProxyUseProxyHosts` 追加该 host；忽略后不再重复提示同 host。
6. 清单 token 语法（后缀 `.example.com`、通配、端口）与 noProxy 现有匹配语义一致。
7. 非法 `ZCODE_PROXY_MODE` 值 → 按 `always` 处理。
