import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentRuntimeEnv } from "../src/runtime-tools/agentProxyEnv.js";

// agent spawn env 模式输出矩阵（specs/network/http-proxy-mode.md 验收场景 4）。
test("always 模式注入标准三件套 + ZCODE_HTTP_PROXY + NO_PROXY（回归）", () => {
  const env = buildAgentRuntimeEnv({
    httpProxy: "http://127.0.0.1:7890",
    noProxy: "localhost",
  });
  assert.equal(env.HTTP_PROXY, "http://127.0.0.1:7890");
  assert.equal(env.HTTPS_PROXY, "http://127.0.0.1:7890");
  assert.equal(env.ALL_PROXY, "http://127.0.0.1:7890");
  assert.equal(env.ZCODE_HTTP_PROXY, "http://127.0.0.1:7890");
  assert.equal(env.NO_PROXY, "localhost");
});

test("onDemand 模式不设置标准三件套，只走 ZCODE_* 显式通道", () => {
  const env = buildAgentRuntimeEnv({
    httpProxy: "http://127.0.0.1:7890",
    noProxy: "localhost",
    proxyMode: "onDemand",
    useProxyHosts: "api.example.com",
  });
  assert.equal(env.HTTP_PROXY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.ALL_PROXY, undefined);
  assert.equal(env.ZCODE_HTTP_PROXY, "http://127.0.0.1:7890");
  assert.equal(env.ZCODE_PROXY_MODE, "onDemand");
  assert.equal(env.ZCODE_USE_PROXY, "api.example.com");
  // noProxy 清单与 useProxy 语义互斥，onDemand 下不下发。
  assert.equal(env.NO_PROXY, undefined);
  assert.equal(env.ZCODE_NO_PROXY, undefined);
});

test("onDemand 清单为空时不设置 ZCODE_USE_PROXY（默认全直连）", () => {
  const env = buildAgentRuntimeEnv({
    httpProxy: "http://127.0.0.1:7890",
    proxyMode: "onDemand",
  });
  assert.equal(env.ZCODE_USE_PROXY, undefined);
});

test("未配置代理时不产生任何代理 env（回归）", () => {
  const env = buildAgentRuntimeEnv({ httpProxy: undefined, proxyMode: "onDemand" });
  assert.deepEqual(env, {});
});
