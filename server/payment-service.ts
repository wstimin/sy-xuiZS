import { createHash, timingSafeEqual } from "node:crypto";

export interface EpayConfig {
  gatewayUrl: string;
  merchantId: string;
  merchantSecret: string;
  channel: string;
}

function normalizedGateway(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("易支付网关必须是 HTTP 或 HTTPS 地址");
  if (!url.pathname || url.pathname === "/") url.pathname = "/submit.php";
  return url;
}

function signingText(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function epaySign(params: Record<string, string>, secret: string) {
  return createHash("md5").update(`${signingText(params)}${secret}`, "utf8").digest("hex");
}

export function verifyEpaySignature(params: Record<string, string>, secret: string) {
  const supplied = String(params.sign || "").toLowerCase();
  const expected = epaySign(params, secret);
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function createEpayUrl(config: EpayConfig, input: {
  orderNo: string;
  amountCents: number;
  name: string;
  notifyUrl: string;
  returnUrl: string;
}) {
  if (!config.merchantId || !config.merchantSecret) throw new Error("易支付商户 PID 或商户密钥未配置");
  const params: Record<string, string> = {
    pid: config.merchantId,
    type: config.channel || "alipay",
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    name: input.name.slice(0, 100),
    money: (input.amountCents / 100).toFixed(2),
    sign_type: "MD5",
  };
  params.sign = epaySign(params, config.merchantSecret);
  const gateway = normalizedGateway(config.gatewayUrl);
  for (const [key, value] of Object.entries(params)) gateway.searchParams.set(key, value);
  return gateway.toString();
}
