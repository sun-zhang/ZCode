import assert from "node:assert/strict";
import test from "node:test";
import { resolveProxyForRequest } from "../src/network/http-config.js";
import { applyNetworkEgressEnv } from "../src/network/subprocess-env.js";

// 按需代理判定矩阵（specs/network/http-proxy-mode.md 验收场景 1/2/3/6/7）。
test("always 模式保持现有语义：noProxy 命中直连，其余走代理", () => {
  const options = { httpProxy: 'http://127.0.0.1:7890/', noProxy: "localhost" };
  assert.equal(resolveProxyForRequest("http://localhost:3000/api", options).proxyUrl, undefined);
  assert.equal(
    resolveProxyForRequest("https://api.example.com/v1", options).proxyUrl,
    'http://127.0.0.1:7890/',
  );
});

test("onDemand 模式默认直连，仅清单命中的 host 走代理", () => {
  const options = {
    httpProxy: 'http://127.0.0.1:7890/',
    proxyMode: "onDemand" as const,
    useProxy: "api.example.com,.internal.corp",
  };
  assert.equal(resolveProxyForRequest("https://direct.example.com/v1", options).proxyUrl, undefined);
  assert.equal(
    resolveProxyForRequest("https://api.example.com/v1", options).proxyUrl,
    'http://127.0.0.1:7890/',
  );
  assert.equal(
    resolveProxyForRequest("https://git.internal.corp/repo", options).proxyUrl,
    'http://127.0.0.1:7890/',
  );
});

test("onDemand 模式下 noProxy 不参与判定，清单与 noProxy 语义互斥", () => {
  const options = {
    httpProxy: 'http://127.0.0.1:7890/',
    noProxy: "api.example.com",
    proxyMode: "onDemand" as const,
    useProxy: "api.example.com",
  };
  assert.equal(
    resolveProxyForRequest("https://api.example.com/v1", options).proxyUrl,
    'http://127.0.0.1:7890/',
  );
});

test("onDemand 未配置代理时即使清单命中也直连", () => {
  const options = { proxyMode: "onDemand" as const, useProxy: "api.example.com" };
  assert.equal(resolveProxyForRequest("https://api.example.com/v1", options).proxyUrl, undefined);
});

test("onDemand 模式与清单可经 ZCODE_PROXY_MODE / ZCODE_USE_PROXY env 表达", () => {
  const env = {
    ZCODE_HTTP_PROXY: 'http://127.0.0.1:7890/',
    ZCODE_PROXY_MODE: "onDemand",
    ZCODE_USE_PROXY: "api.example.com",
  };
  assert.equal(resolveProxyForRequest("https://api.example.com/v1", { env }).proxyUrl, 'http://127.0.0.1:7890/');
  assert.equal(resolveProxyForRequest("https://other.example.com/v1", { env }).proxyUrl, undefined);
});

test("非法 ZCODE_PROXY_MODE 值按 always 处理（fail-safe 兼容现状）", () => {
  const env = {
    ZCODE_HTTP_PROXY: 'http://127.0.0.1:7890/',
    ZCODE_PROXY_MODE: "sometimes",
  };
  assert.equal(resolveProxyForRequest("https://api.example.com/v1", { env }).proxyUrl, 'http://127.0.0.1:7890/');
});

test("onDemand 下 Bash/MCP 子进程不注入标准代理三件套（默认直连）", () => {
  const sourceEnv = {
    ZCODE_HTTP_PROXY: 'http://127.0.0.1:7890/',
    ZCODE_PROXY_MODE: "onDemand",
    ZCODE_USE_PROXY: "api.example.com",
  };
  const env = applyNetworkEgressEnv({ PATH: "/usr/bin" }, { sourceEnv });
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.ALL_PROXY, undefined);
  assert.equal(env.NO_PROXY, undefined);
});

test("always 下 Bash/MCP 子进程仍注入标准代理三件套（回归）", () => {
  const sourceEnv = { ZCODE_HTTP_PROXY: 'http://127.0.0.1:7890/' };
  const env = applyNetworkEgressEnv({ PATH: "/usr/bin" }, { sourceEnv });
  assert.equal(env.HTTP_PROXY, 'http://127.0.0.1:7890/');
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7890/');
});
