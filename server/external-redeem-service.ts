import { createHash, createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ExternalRedeemAuthMode = "bearer" | "x-api-key" | "none";
export type ExternalRedeemAmountUnit = "cents" | "yuan";

export interface ExternalRedeemConfig {
  provider?: "generic_json" | "shiyeka";
  enabled: boolean;
  name: string;
  apiUrl: string;
  appKey?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
  authMode: ExternalRedeemAuthMode;
  amountUnit: ExternalRedeemAmountUnit;
  timeoutSeconds: number;
  allowPrivateNetwork: boolean;
}

export interface ExternalRedeemInput {
  code: string;
  userId: string;
  username: string;
  planId?: string;
}

export interface ExternalRedeemResult {
  amountCents: number;
  tradeNo: string;
  requestId: string;
  recovered?: boolean;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const EXTERNAL_RESPONSE_MAX_BYTES = 256 * 1024;

async function readLimitedText(response: Response, label: string) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > EXTERNAL_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error(`${label}响应过大`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function privateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

function privateIp(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.includes(".")) {
    const mapped = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return privateIpv4(mapped || normalized);
  }
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

async function validatedApiUrl(config: ExternalRedeemConfig) {
  let url: URL;
  try { url = new URL(String(config.apiUrl || "").trim()); }
  catch { throw new Error("第三方卡密接口地址格式不正确"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("第三方卡密接口必须使用 HTTP 或 HTTPS");
  if (url.username || url.password) throw new Error("第三方卡密接口地址不能包含用户名或密码");
  if (!config.allowPrivateNetwork) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(item => privateIp(item.address))) throw new Error("第三方卡密接口解析到了内网地址；如确需连接内网服务，请在后台明确开启内网访问");
  }
  return url;
}

function objectValue(payload: any, key: string) {
  return payload?.[key] ?? payload?.data?.[key];
}

function externalMessage(payload: any, fallback: string) {
  const value = objectValue(payload, "message") ?? objectValue(payload, "msg") ?? objectValue(payload, "error");
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : fallback;
}

function shiyekaEndpoint(baseUrl: URL, action: "activate" | "query" | "verify") {
  if (/\/api\/v1\/card\/(?:activate|query|verify)\/?$/i.test(baseUrl.pathname)) {
    baseUrl.pathname = baseUrl.pathname.replace(/\/(?:activate|query|verify)\/?$/i, `/${action}`);
    return baseUrl;
  }
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, "")}/api/v1/card/${action}`.replace(/^\/\//, "/");
  return baseUrl;
}

async function callShiyeka(
  config: ExternalRedeemConfig,
  baseUrl: URL,
  action: "activate" | "query" | "verify",
  code: string,
  fetcher: FetchLike,
  signal: AbortSignal,
) {
  const appKey = String(config.appKey || "").trim();
  const appSecret = String(config.apiKey || "").trim();
  if (!appKey) throw new Error("十夜卡密 App Key 尚未配置");
  if (!appSecret) throw new Error("十夜卡密 App Secret 尚未配置");
  const raw = JSON.stringify({ card: code });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(raw, "utf8").digest("hex");
  const sign = createHmac("sha256", appSecret)
    .update(`${appKey}\n${timestamp}\n${nonce}\n${bodyHash}`, "utf8")
    .digest("hex");
  const response = await fetcher(shiyekaEndpoint(new URL(baseUrl), action), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-app-key": appKey,
      "x-timestamp": timestamp,
      "x-nonce": nonce,
      "x-sign": sign,
    },
    body: raw,
    signal,
    redirect: "error",
  });
  const text = await readLimitedText(response, "十夜卡密接口");
  let payload: any;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error("十夜卡密接口没有返回有效 JSON"); }
  if (!response.ok) throw new Error(externalMessage(payload, `十夜卡密接口返回 HTTP ${response.status}`));
  return payload;
}

async function redeemShiyekaCard(
  config: ExternalRedeemConfig,
  baseUrl: URL,
  code: string,
  fetcher: FetchLike,
  signal: AbortSignal,
): Promise<ExternalRedeemResult> {
  const normalizedCode = code.toUpperCase();
  let payload = await callShiyeka(config, baseUrl, "activate", normalizedCode, fetcher, signal);
  let recovered = false;
  if (Number(payload?.code) === 2002) {
    payload = await callShiyeka(config, baseUrl, "query", normalizedCode, fetcher, signal);
    recovered = true;
  }
  if (Number(payload?.code) !== 0) throw new Error(externalMessage(payload, "十夜卡密核销失败"));
  const data = payload?.data || {};
  if (data.type !== "money" && data.kind !== "money") throw new Error("该卡不是金额卡，不能用于账户充值或购买套餐");
  const amount = Number(data.amount ?? data.remaining_amount);
  const amountCents = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) throw new Error("十夜卡密返回的金额无效");
  const appKey = String(config.appKey || "").trim();
  const requestId = externalRedeemRequestId(`${appKey}:${normalizedCode}`);
  const tradeNo = `shiyeka-${createHash("sha256").update(`${appKey}:${normalizedCode}`).digest("hex").slice(0, 40)}`;
  return { amountCents, tradeNo, requestId, ...(recovered ? { recovered: true } : {}) };
}

export function externalRedeemRequestId(code: string) {
  return `xui-${createHash("sha256").update(String(code || "").trim()).digest("hex").slice(0, 40)}`;
}

export async function inspectExternalCard(
  config: ExternalRedeemConfig,
  rawCode: string,
  fetcher: FetchLike = fetch,
) {
  if (config.provider !== "shiyeka") throw new Error("当前接口类型不支持无核销验卡");
  const code = String(rawCode || "").trim().toUpperCase();
  if (code.length < 4 || code.length > 200) throw new Error("卡密长度必须为 4 到 200 个字符");
  const url = await validatedApiUrl(config);
  const timeoutSeconds = Math.min(30, Math.max(3, Math.trunc(Number(config.timeoutSeconds) || 10)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const payload = await callShiyeka(config, url, "verify", code, fetcher, controller.signal);
    if (Number(payload?.code) !== 0) throw new Error(externalMessage(payload, "十夜卡密验证失败"));
    const data = payload?.data || {};
    if (data.valid === false) throw new Error(externalMessage(payload, "该卡密当前不可用"));
    const kind = String(data.type ?? data.kind ?? "").trim();
    if (kind !== "money") throw new Error(`卡密有效，但类型为 ${kind || "未知"}，只有金额卡可用于充值`);
    const amount = Number(data.amount ?? data.remaining_amount);
    const amountCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) throw new Error("十夜卡密返回的金额无效");
    return { valid: true as const, kind, amountCents };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("十夜卡密接口响应超时，请稍后重试");
    if (error instanceof Error && error.name !== "TypeError") throw error;
    throw new Error(`十夜卡密接口连接失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function redeemExternalCard(
  config: ExternalRedeemConfig,
  input: ExternalRedeemInput,
  fetcher: FetchLike = fetch,
): Promise<ExternalRedeemResult> {
  if (!config.enabled) throw new Error("第三方卡密系统尚未启用");
  const code = String(input.code || "").trim();
  if (code.length < 4 || code.length > 200) throw new Error("卡密长度必须为 4 到 200 个字符");
  const url = await validatedApiUrl(config);
  const timeoutSeconds = Math.min(30, Math.max(3, Math.trunc(Number(config.timeoutSeconds) || 10)));
  const requestId = externalRedeemRequestId(code);
  if (config.provider === "shiyeka") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    try {
      return await redeemShiyekaCard(config, url, code, fetcher, controller.signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("十夜卡密接口响应超时，请稍后重试");
      if (error instanceof Error && error.name !== "TypeError") throw error;
      throw new Error(`十夜卡密接口连接失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-idempotency-key": requestId,
  };
  const apiKey = String(config.apiKey || "").trim();
  if (config.authMode !== "none" && !apiKey) throw new Error("第三方卡密 API 密钥尚未配置");
  if (config.authMode === "bearer") headers.authorization = `Bearer ${apiKey}`;
  if (config.authMode === "x-api-key") headers["x-api-key"] = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  let response: Response;
  let text: string;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ code, requestId, userId: input.userId, username: input.username, planId: input.planId || "" }),
      signal: controller.signal,
      redirect: "error",
    });
    text = await readLimitedText(response, "第三方卡密接口");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("第三方卡密接口响应超时，请稍后重试");
    if (error instanceof Error && error.name !== "TypeError") throw error;
    throw new Error(`第三方卡密接口连接失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  let payload: any;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error("第三方卡密接口没有返回有效 JSON"); }
  if (!response.ok) throw new Error(externalMessage(payload, `第三方卡密接口返回 HTTP ${response.status}`));
  const success = objectValue(payload, "success");
  if (success !== true && success !== 1 && success !== "1") throw new Error(externalMessage(payload, "第三方卡密核销失败"));

  const explicitCents = objectValue(payload, "amountCents");
  const rawAmount = explicitCents ?? objectValue(payload, "amount");
  const numericAmount = Number(rawAmount);
  const amountCents = explicitCents !== undefined || config.amountUnit === "cents"
    ? Math.round(numericAmount)
    : Math.round(numericAmount * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100_000_000) throw new Error("第三方卡密接口返回的金额无效");
  const tradeNo = String(objectValue(payload, "tradeNo") ?? objectValue(payload, "id") ?? "").trim();
  if (!tradeNo || tradeNo.length > 200) throw new Error("第三方卡密接口未返回有效交易号 tradeNo");
  return { amountCents, tradeNo, requestId };
}
