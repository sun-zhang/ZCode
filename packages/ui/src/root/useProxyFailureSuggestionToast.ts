import { useEffect, useRef } from "react";
import type { IServiceAccessor } from "@zcode/services";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { toast, dismissToast } from "@/components/ui/toast.js";
import { useProxySuggestionStore } from "@/store/proxySuggestionStore.js";
import { logger } from "@/logger.js";

interface ProxySuggestionSettingsView {
  httpProxyMode?: "always" | "onDemand";
  httpProxy?: string;
  httpProxyUseProxyHosts?: string;
}

/**
 * 按需代理（specs/network/http-proxy-mode.md）失败确认提示。
 *
 * 模型请求出现连接类失败（proxySuggestionStore 记录的 host）且当前为 onDemand 模式、
 * 该 host 未被现有清单覆盖时，弹 toast 请求用户确认；确认后经 settingService 追加写入
 * httpProxyUseProxyHosts（唯一持久化写入路径），不自动静默添加。
 * always 模式不提示——全量代理下连接失败与出口选择无关。
 */
export function useProxyFailureSuggestionToast(services: IServiceAccessor): void {
  const { intl } = useZCodeIntl();
  const latest = useRef({ intl, services });
  latest.current = { intl, services };
  const toastByHostRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const dismissHostToast = (host: string): void => {
      const toastId = toastByHostRef.current.get(host);
      if (toastId !== undefined) {
        dismissToast(toastId);
        toastByHostRef.current.delete(host);
      }
    };

    const unregister = useProxySuggestionStore.subscribe((state) => {
      void (async () => {
        const { intl: copy, services: serviceAccessor } = latest.current;
        let settings: ProxySuggestionSettingsView;
        try {
          settings = await serviceAccessor.settingService.get();
        } catch (error) {
          logger.warn("[proxy-suggestion] 读取设置失败，跳过本次提示", { error });
          return;
        }
        if (settings.httpProxyMode !== "onDemand" || !settings.httpProxy) {
          return;
        }
        const covered = parseHostList(settings.httpProxyUseProxyHosts);
        for (const suggestion of Object.values(state.suggestionsByHost)) {
          if (covered.has(suggestion.host) || toastByHostRef.current.has(suggestion.host)) {
            continue;
          }
          const host = suggestion.host;
          const toastId = toast(copy.formatMessage({ id: "proxySuggestion.body" }, { host }), {
            // 确认类提示需要给用户留足反应时间，但也不永久驻留。
            durationMs: 60_000,
            actionLabel: copy.formatMessage({ id: "proxySuggestion.add" }),
            onAction: () => {
              void (async () => {
                try {
                  const nextHosts = [...covered, host].join(",");
                  await serviceAccessor.settingService.update({
                    httpProxyUseProxyHosts: nextHosts,
                  });
                  useProxySuggestionStore.getState().dismissSuggestion(host);
                  toast(copy.formatMessage({ id: "proxySuggestion.addedHint" }));
                } catch (error) {
                  logger.warn("[proxy-suggestion] 写入走代理清单失败", { error });
                }
              })();
              dismissHostToast(host);
            },
            dismissLabel: copy.formatMessage({ id: "proxySuggestion.dismiss" }),
          });
          toastByHostRef.current.set(host, toastId);
        }
      })();
    });
    return () => {
      unregister();
      for (const toastId of toastByHostRef.current.values()) {
        dismissToast(toastId);
      }
      toastByHostRef.current.clear();
    };
  }, [intl]);
}

function parseHostList(value: string | undefined): Set<string> {
  const hosts = new Set<string>();
  for (const token of (value ?? "").split(",")) {
    const trimmed = token.trim().toLowerCase();
    // 后缀/通配 token（.example.com、*.corp.com）无法精确判断覆盖关系，视作未覆盖，
    // 让提示多弹一次由用户决断，避免误判后永远不再提示。
    if (trimmed && !trimmed.startsWith(".") && !trimmed.includes("*")) {
      hosts.add(trimmed);
    }
  }
  return hosts;
}
