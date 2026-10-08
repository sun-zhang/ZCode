import { create } from "zustand";

/**
 * 按需代理（specs/network/http-proxy-mode.md）失败建议 store。
 *
 * 数据来源是会话遥测事实（model.request.status / model_request_failed 的 providerHostname + reason），
 * 本 store 只保存「待用户确认加入走代理清单」的候选 host，属于 renderer 局部派生状态，
 * 不是服务端事实；唯一持久化写入路径仍是 settingService.update({ httpProxyUseProxyHosts })。
 */
export interface ProxyFailureSuggestion {
  host: string;
  reason: string;
  failureCount: number;
  lastFailedAt: number;
}

interface ProxySuggestionStoreState {
  suggestionsByHost: Record<string, ProxyFailureSuggestion>;
}

interface ProxySuggestionStoreActions {
  recordNetworkFailure: (host: string, reason: string) => void;
  dismissSuggestion: (host: string) => void;
  clearSuggestions: (hosts: string[]) => void;
}

const MAX_TRACKED_HOSTS = 8;

/** 「疑似需要代理」的失败 reason：连接层失败，换出口可能恢复；鉴权/协议类失败不在此列。 */
const PROXY_CANDIDATE_FAILURE_REASONS = new Set([
  "network_error",
  "timeout",
  "stream_idle_timeout",
  "stale_connection",
]);

export function isProxyCandidateFailureReason(reason: string | undefined): boolean {
  return reason !== undefined && PROXY_CANDIDATE_FAILURE_REASONS.has(reason);
}

export const useProxySuggestionStore = create<ProxySuggestionStoreState &
  ProxySuggestionStoreActions>()((set) => ({
  suggestionsByHost: {},
  recordNetworkFailure: (host, reason) => {
    const normalizedHost = host.trim().toLowerCase();
    if (!normalizedHost) return;
    set((state) => {
      const existing = state.suggestionsByHost[normalizedHost];
      const next: Record<string, ProxyFailureSuggestion> = {
        ...state.suggestionsByHost,
        [normalizedHost]: {
          host: normalizedHost,
          reason,
          failureCount: (existing?.failureCount ?? 0) + 1,
          lastFailedAt: Date.now(),
        },
      };
      // 有界：只保留最近失败的少量 host，避免长期运行时无限累积。
      const hosts = Object.keys(next);
      if (hosts.length > MAX_TRACKED_HOSTS) {
        hosts
          .sort(
            (left, right) =>
              (next[left]?.lastFailedAt ?? 0) - (next[right]?.lastFailedAt ?? 0),
          )
          .slice(0, hosts.length - MAX_TRACKED_HOSTS)
          .forEach((staleHost) => {
            delete next[staleHost];
          });
      }
      return { suggestionsByHost: next };
    });
  },
  dismissSuggestion: (host) => {
    const normalizedHost = host.trim().toLowerCase();
    set((state) => {
      if (!(normalizedHost in state.suggestionsByHost)) return state;
      const next = { ...state.suggestionsByHost };
      delete next[normalizedHost];
      return { suggestionsByHost: next };
    });
  },
  clearSuggestions: (hosts) => {
    set((state) => {
      const removeHosts = new Set(hosts.map((host) => host.trim().toLowerCase()));
      const next: Record<string, ProxyFailureSuggestion> = {};
      for (const [host, suggestion] of Object.entries(state.suggestionsByHost)) {
        if (!removeHosts.has(host)) {
          next[host] = suggestion;
        }
      }
      return { suggestionsByHost: next };
    });
  },
}));
