import {
  ZCODE_AGENT_CA_CERT_ENV_KEY,
  ZCODE_HTTP_PROXY_ENV_KEY,
  ZCODE_NO_PROXY_ENV_KEY,
  ZCODE_PROXY_MODE_ENV_KEY,
  ZCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY,
  normalizeHttpProxyMode,
  readZCodeToolEnvPassthroughEnv,
  type HttpProxyMode,
} from "@zcode/shared";

export interface NetworkEgressEnvPolicy {
  caCertFile?: string;
  httpProxy?: string;
  noProxy?: string;
  proxyMode?: HttpProxyMode;
  useProxy?: string;
}

interface NetworkEgressEnvOptions {
  network?: NetworkEgressEnvPolicy;
  platform?: NodeJS.Platform;
  sourceEnv?: Record<string, string | undefined>;
  toolEnvPassthrough?: boolean;
}

const ALL_PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
] as const;
const NO_PROXY_KEYS = ["NO_PROXY", "no_proxy"] as const;
const CA_SOURCE_KEYS = [
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "GIT_SSL_CAINFO",
] as const;
const CA_TARGET_KEYS = CA_SOURCE_KEYS;
const EXPLICIT_CA_SOURCE_KEYS = [ZCODE_AGENT_CA_CERT_ENV_KEY] as const;
const EXPLICIT_NO_PROXY_SOURCE_KEYS = [ZCODE_NO_PROXY_ENV_KEY] as const;
const EXPLICIT_PROXY_MODE_SOURCE_KEYS = [ZCODE_PROXY_MODE_ENV_KEY] as const;

export function applyNetworkEgressEnv(
  env: Record<string, string>,
  options: NetworkEgressEnvOptions,
): Record<string, string> {
  const platform = options.platform ?? process.platform;
  const sourceEnv = options.sourceEnv ?? {};
  const network = options.network ?? {};

  deleteEnvKey(env, ZCODE_TOOL_ENV_PASSTHROUGH_ENV_KEY, platform);
  if (options.toolEnvPassthrough !== false) {
    applyToolEnvPassthroughEnv(env, sourceEnv, platform);
  }
  applyProxyEnv(env, sourceEnv, network, platform);
  applyNoProxyEnv(env, sourceEnv, network, platform);
  applyCaEnv(env, sourceEnv, network, platform);
  return env;
}

function applyToolEnvPassthroughEnv(
  env: Record<string, string>,
  sourceEnv: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): void {
  const passthroughEnv = readZCodeToolEnvPassthroughEnv(sourceEnv);
  for (const [key, value] of Object.entries(passthroughEnv)) {
    setEnvKey(env, key, value, platform);
  }
}

function applyProxyEnv(
  env: Record<string, string>,
  sourceEnv: Record<string, string | undefined>,
  network: NetworkEgressEnvPolicy,
  platform: NodeJS.Platform,
): void {
  // 按需代理（specs/network/http-proxy-mode.md）：子进程默认直连。
  // 标准三件套无法表达「仅清单内 host 走代理」，onDemand 下设置它们会让 curl 等外部命令
  // 全量走代理，违背模式语义；应用层 fetch 由 createNetworkProxyFetch 按清单判定。
  if (resolveEgressProxyMode(sourceEnv, network, platform) === "onDemand") {
    return;
  }
  const configuredProxy = normalizeProxyValue(network.httpProxy);
  if (configuredProxy) {
    for (const key of ALL_PROXY_KEYS) {
      setEnvKey(env, key, configuredProxy, platform);
    }
    return;
  }

  const zcodeProxy = normalizeProxyValue(
    getFirstEnvValue(sourceEnv, [ZCODE_HTTP_PROXY_ENV_KEY], platform),
  );
  if (zcodeProxy) {
    for (const key of ALL_PROXY_KEYS) {
      setEnvKey(env, key, zcodeProxy, platform);
    }
    return;
  }
}

function applyNoProxyEnv(
  env: Record<string, string>,
  sourceEnv: Record<string, string | undefined>,
  network: NetworkEgressEnvPolicy,
  platform: NodeJS.Platform,
): void {
  // onDemand 下 noProxy 与 useProxy 清单互斥：不向子进程注入 NO_PROXY，避免与默认直连语义混淆。
  if (resolveEgressProxyMode(sourceEnv, network, platform) === "onDemand") {
    return;
  }
  const noProxy =
    normalizeEnvValue(network.noProxy) ??
    getFirstEnvValue(sourceEnv, EXPLICIT_NO_PROXY_SOURCE_KEYS, platform);
  if (!noProxy) {
    return;
  }
  for (const key of NO_PROXY_KEYS) {
    setEnvKey(env, key, noProxy, platform);
  }
}

function applyCaEnv(
  env: Record<string, string>,
  sourceEnv: Record<string, string | undefined>,
  network: NetworkEgressEnvPolicy,
  platform: NodeJS.Platform,
): void {
  const caCertFile =
    normalizeEnvValue(network.caCertFile) ??
    getFirstEnvValue(sourceEnv, EXPLICIT_CA_SOURCE_KEYS, platform);
  if (!caCertFile) {
    return;
  }
  for (const key of CA_TARGET_KEYS) {
    setEnvKey(env, key, caCertFile, platform);
  }
}

function normalizeProxyValue(value: string | undefined): string | undefined {
  const trimmed = normalizeEnvValue(value);
  if (!trimmed) {
    return undefined;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function resolveEgressProxyMode(
  sourceEnv: Record<string, string | undefined>,
  network: NetworkEgressEnvPolicy,
  platform: NodeJS.Platform,
): HttpProxyMode {
  if (network.proxyMode) {
    return network.proxyMode;
  }
  return normalizeHttpProxyMode(getFirstEnvValue(sourceEnv, EXPLICIT_PROXY_MODE_SOURCE_KEYS, platform));
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getFirstEnvValue(
  env: Record<string, string | undefined>,
  keys: readonly string[],
  platform: NodeJS.Platform,
): string | undefined {
  for (const key of keys) {
    const value = getEnvValue(env, key, platform);
    if (normalizeEnvValue(value)) {
      return value;
    }
  }
  return undefined;
}

function setEnvKey(
  env: Record<string, string>,
  key: string,
  value: string,
  platform: NodeJS.Platform,
): void {
  deleteEnvKey(env, key, platform);
  env[key] = value;
}

function deleteEnvKey(env: Record<string, string>, key: string, platform: NodeJS.Platform): void {
  if (platform !== "win32") {
    delete env[key];
    return;
  }

  const lowerKey = key.toLowerCase();
  for (const existingKey of Object.keys(env)) {
    if (existingKey.toLowerCase() === lowerKey) {
      delete env[existingKey];
    }
  }
}

function getEnvValue(
  env: Record<string, string | undefined>,
  key: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== "win32") {
    return env[key];
  }
  const lowerKey = key.toLowerCase();
  const actualKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === lowerKey);
  return actualKey ? env[actualKey] : undefined;
}
