import assert from "node:assert/strict";
import test from "node:test";
import { resolveHostProxyForUrl } from "../src/providers/api/nodeApiNetwork.js";

// Host API（套餐/账号等后端请求）代理模式矩阵（specs/network/http-proxy-mode.md）。
test("always 模式回归：noProxy 命中直连，其余走代理", () => {
  const options = { httpProxy: "http://127.0.0.1:7890", noProxy: "localhost" };
  assert.deepEqual(resolveHostProxyForUrl("http://localhost:3000/api", options), {
    kind: "direct",
    noProxyMatched: true,
  });
  assert.deepEqual(resolveHostProxyForUrl("https://api.example.com/v1", options), {
    kind: "proxy",
    proxyUrl: "http://127.0.0.1:7890/",
  });
});

test("onDemand 模式：Host API 默认直连，仅清单命中走代理", () => {
  const options = {
    httpProxy: "http://127.0.0.1:7890",
    proxyMode: "onDemand" as const,
    useProxyHosts: "api.example.com,.internal.corp",
  };
  assert.deepEqual(resolveHostProxyForUrl("https://open.example.com/plan", options), {
    kind: "direct",
  });
  assert.deepEqual(resolveHostProxyForUrl("https://api.example.com/plan", options), {
    kind: "proxy",
    proxyUrl: "http://127.0.0.1:7890/",
  });
  assert.deepEqual(resolveHostProxyForUrl("https://git.internal.corp/repo", options), {
    kind: "proxy",
    proxyUrl: "http://127.0.0.1:7890/",
  });
});

test("onDemand 模式下 noProxy 清单不参与判定（与 useProxy 清单互斥）", () => {
  const options = {
    httpProxy: "http://127.0.0.1:7890",
    noProxy: "api.example.com",
    proxyMode: "onDemand" as const,
    useProxyHosts: "api.example.com",
  };
  assert.deepEqual(resolveHostProxyForUrl("https://api.example.com/plan", options), {
    kind: "proxy",
    proxyUrl: "http://127.0.0.1:7890/",
  });
});

test("onDemand 未配置代理或清单未命中时保持直连", () => {
  assert.deepEqual(
    resolveHostProxyForUrl("https://api.example.com/plan", { proxyMode: "onDemand" }),
    { kind: "direct" },
  );
  assert.deepEqual(
    resolveHostProxyForUrl("https://api.example.com/plan", {
      proxyMode: "onDemand",
      useProxyHosts: "api.example.com",
    }),
    { kind: "direct" },
  );
});
