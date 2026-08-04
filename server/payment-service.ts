import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type PaymentProvider = "manual" | "epay" | "mgate" | "tokenpay" | "epusdt" | "alipay_official" | "wechat_official";

export interface PaymentChannelConfig {
  id: string;
  provider: PaymentProvider;
  gatewayUrl?: string;
  merchantId?: string;
  merchantSecret?: string;
  channel?: string;
  currency?: string;
  callbackBaseUrl?: string;
  appId?: string;
  privateKey?: string;
  publicKey?: string;
  certificateSerial?: string;
  apiV3Key?: string;
}

export interface CheckoutInput {
  orderNo: string;
  amountCents: number;
  name: string;
  userKey?: string;
  notifyUrl: string;
  returnUrl: string;
}

export interface CheckoutResult {
  type: "redirect" | "qrcode";
  checkoutUrl: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
}

export interface VerifiedPayment {
  orderNo: string;
  tradeNo: string;
  amountCents: number;
  payload: unknown;
}

export interface NotificationInput {
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface PaymentDriver {
  createCheckout(config: PaymentChannelConfig, input: CheckoutInput): Promise<CheckoutResult>;
  verifyNotification(config: PaymentChannelConfig, input: NotificationInput): Promise<VerifiedPayment>;
  successResponse: string;
  failureResponse: string;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function md5(value: string) {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function sortedText(params: Record<string, string>, excluded: string[], encode = false) {
  const formEncode = (value: string) => encodeURIComponent(value)
    .replace(/[!'()*~]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
  return Object.entries(params)
    .filter(([key, value]) => !excluded.includes(key) && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => encode ? `${formEncode(key)}=${formEncode(value)}` : `${key}=${value}`)
    .join("&");
}

function normalizedHttpUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${label}必须是 HTTP 或 HTTPS 地址`);
  return url;
}

function normalizePem(value: string, kind: "PRIVATE KEY" | "PUBLIC KEY" | "CERTIFICATE") {
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("-----BEGIN")) return trimmed;
  const lines = trimmed.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") || trimmed;
  return `-----BEGIN ${kind}-----\n${lines}\n-----END ${kind}-----`;
}

function amountCents(value: unknown) {
  const amount = Math.round(Number(value) * 100);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("支付通知金额无效");
  return amount;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`支付网关请求失败（HTTP ${response.status}）：${String(data?.message || data?.error || text).slice(0, 300)}`);
  return data;
}

function checkoutUrlFromResponse(data: any) {
  const candidates = [
    data?.data?.pay_url, data?.data?.payment_url, data?.data?.url, data?.data?.checkout_url,
    data?.Data?.pay_url, data?.Data?.payment_url, data?.Data?.url, data?.Data,
    data?.pay_url, data?.payment_url, data?.checkout_url, data?.url,
  ];
  const value = candidates.find(item => typeof item === "string" && /^https?:\/\//i.test(item));
  if (!value) throw new Error(`支付网关没有返回可用的收银台地址：${JSON.stringify(data).slice(0, 300)}`);
  return value;
}

export function epaySign(params: Record<string, string>, secret: string) {
  return md5(`${sortedText(params, ["sign", "sign_type"])}${secret}`);
}

export function verifyEpaySignature(params: Record<string, string>, secret: string) {
  return safeEqual(String(params.sign || "").toLowerCase(), epaySign(params, secret));
}

export function createEpayUrl(config: { gatewayUrl: string; merchantId: string; merchantSecret: string; channel: string }, input: CheckoutInput) {
  if (!config.merchantId || !config.merchantSecret) throw new Error("易支付商户 PID 或商户密钥未配置");
  const gateway = normalizedHttpUrl(config.gatewayUrl, "易支付网关");
  if (!gateway.pathname || gateway.pathname === "/") gateway.pathname = "/submit.php";
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
  for (const [key, value] of Object.entries(params)) gateway.searchParams.set(key, value);
  return gateway.toString();
}

export function genericMd5Sign(params: Record<string, string>, secret: string, signatureField: string, encode = false) {
  return md5(`${sortedText(params, [signatureField], encode)}${secret}`);
}

export function verifyWechatNotificationSignature(publicKey: string, headers: Record<string, string>, rawBody: string) {
  return verifyWechatHeaders(publicKey, headers, rawBody);
}

function genericMd5Verify(params: Record<string, string>, secret: string, signatureField: string, encode = false) {
  return safeEqual(String(params[signatureField] || "").toLowerCase(), genericMd5Sign(params, secret, signatureField, encode));
}

const epayDriver: PaymentDriver = {
  successResponse: "success",
  failureResponse: "fail",
  async createCheckout(config, input) {
    const checkoutUrl = createEpayUrl({
      gatewayUrl: config.gatewayUrl || "", merchantId: config.merchantId || "",
      merchantSecret: config.merchantSecret || "", channel: config.channel || "alipay",
    }, input);
    return { type: "redirect", checkoutUrl, requestPayload: { channel: config.channel || "alipay" } };
  },
  async verifyNotification(config, input) {
    if (!config.merchantSecret || !verifyEpaySignature(input.params, config.merchantSecret)) throw new Error("易支付通知签名无效");
    if (input.params.trade_status && !["TRADE_SUCCESS", "TRADE_FINISHED"].includes(input.params.trade_status)) throw new Error("易支付订单尚未成功");
    return {
      orderNo: input.params.out_trade_no || "",
      tradeNo: input.params.trade_no || input.params.out_trade_no || "",
      amountCents: amountCents(input.params.money),
      payload: input.params,
    };
  },
};

const mgateDriver: PaymentDriver = {
  successResponse: "success",
  failureResponse: "fail",
  async createCheckout(config, input) {
    if (!config.gatewayUrl || !config.merchantId || !config.merchantSecret) throw new Error("MGate 地址、APP ID 或 App Secret 未配置");
    const gateway = normalizedHttpUrl(config.gatewayUrl, "MGate 网关");
    gateway.pathname = `${gateway.pathname.replace(/\/+$/, "")}/v1/gateway/fetch`;
    const params: Record<string, string> = {
      out_trade_no: input.orderNo,
      total_amount: (input.amountCents / 100).toFixed(2),
      notify_url: input.notifyUrl,
      return_url: input.returnUrl,
      app_id: config.merchantId,
      source_currency: config.currency || "CNY",
    };
    params.sign = genericMd5Sign(params, config.merchantSecret, "sign", true);
    const response = await postJson(gateway.toString(), params);
    return { type: "redirect", checkoutUrl: checkoutUrlFromResponse(response), requestPayload: params, responsePayload: response };
  },
  async verifyNotification(config, input) {
    if (!config.merchantSecret || !genericMd5Verify(input.params, config.merchantSecret, "sign", true)) throw new Error("MGate 通知签名无效");
    const status = input.params.trade_status || input.params.status;
    if (status && !["SUCCESS", "TRADE_SUCCESS", "PAID", "2"].includes(status.toUpperCase())) throw new Error("MGate 订单尚未成功");
    return {
      orderNo: input.params.out_trade_no || "",
      tradeNo: input.params.trade_no || input.params.out_trade_no || "",
      amountCents: amountCents(input.params.total_amount || input.params.amount),
      payload: input.params,
    };
  },
};

const tokenpayDriver: PaymentDriver = {
  successResponse: "success",
  failureResponse: "fail",
  async createCheckout(config, input) {
    const currency = String(config.currency || config.merchantId || "").toUpperCase().replace(/-/g, "_");
    if (!config.gatewayUrl || !currency || !config.merchantSecret) throw new Error("TokenPay 地址、币种或 API 密钥未配置");
    const gateway = normalizedHttpUrl(config.gatewayUrl, "TokenPay 地址");
    gateway.pathname = `${gateway.pathname.replace(/\/+$/, "")}/CreateOrder`;
    const params: Record<string, string> = {
      ActualAmount: (input.amountCents / 100).toFixed(2),
      OutOrderId: input.orderNo,
      OrderUserKey: input.userKey || input.orderNo,
      Currency: currency,
      RedirectUrl: input.returnUrl,
      NotifyUrl: input.notifyUrl,
    };
    params.Signature = genericMd5Sign(params, config.merchantSecret, "Signature");
    const response = await postJson(gateway.toString(), params);
    return { type: "redirect", checkoutUrl: checkoutUrlFromResponse(response), requestPayload: params, responsePayload: response };
  },
  async verifyNotification(config, input) {
    if (!config.merchantSecret || !genericMd5Verify(input.params, config.merchantSecret, "Signature")) throw new Error("TokenPay 通知签名无效");
    if (String(input.params.Status || input.params.status).toUpperCase() !== "TRADE_SUCCESS") throw new Error("TokenPay 订单尚未成功");
    return {
      orderNo: input.params.OutOrderId || "",
      tradeNo: input.params.TradeId || input.params.TradeNo || input.params.OutOrderId || "",
      amountCents: amountCents(input.params.ActualAmount),
      payload: input.params,
    };
  },
};

const epusdtDriver: PaymentDriver = {
  successResponse: "ok",
  failureResponse: "fail",
  async createCheckout(config, input) {
    if (!config.gatewayUrl || !config.merchantSecret) throw new Error("Epusdt API 地址或签名 Token 未配置");
    const params: Record<string, string> = {
      amount: (input.amountCents / 100).toFixed(2),
      order_id: input.orderNo,
      redirect_url: input.returnUrl,
      notify_url: input.notifyUrl,
    };
    params.signature = genericMd5Sign(params, config.merchantSecret, "signature");
    const response = await postJson(normalizedHttpUrl(config.gatewayUrl, "Epusdt API 地址").toString(), params);
    return { type: "redirect", checkoutUrl: checkoutUrlFromResponse(response), requestPayload: params, responsePayload: response };
  },
  async verifyNotification(config, input) {
    if (!config.merchantSecret || !genericMd5Verify(input.params, config.merchantSecret, "signature")) throw new Error("Epusdt 通知签名无效");
    if (Number(input.params.status) !== 2) throw new Error("Epusdt 订单尚未成功");
    return {
      orderNo: input.params.order_id || "",
      tradeNo: input.params.trade_id || input.params.order_id || "",
      amountCents: amountCents(input.params.amount),
      payload: input.params,
    };
  },
};

function alipaySign(params: Record<string, string>, privateKey: string) {
  const signer = createSign("RSA-SHA256");
  signer.update(sortedText(params, ["sign"]), "utf8");
  signer.end();
  return signer.sign(createPrivateKey(normalizePem(privateKey, "PRIVATE KEY")), "base64");
}

function alipayTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

export function verifyAlipaySignature(params: Record<string, string>, publicKey: string) {
  const verifier = createVerify("RSA-SHA256");
  verifier.update(sortedText(params, ["sign", "sign_type"]), "utf8");
  verifier.end();
  return verifier.verify(createPublicKey(normalizePem(publicKey, publicKey.includes("CERTIFICATE") ? "CERTIFICATE" : "PUBLIC KEY")), params.sign || "", "base64");
}

function jsonPropertyRaw(text: string, property: string) {
  let index = 0;
  const skipWhitespace = () => { while (/\s/.test(text[index] || "")) index += 1; };
  const readString = () => {
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") index += 2;
      else if (text[index++] === '"') break;
    }
    return text.slice(start, index);
  };
  const readValue = () => {
    const start = index;
    if (text[index] === '"') {
      readString();
      return text.slice(start, index);
    }
    if (text[index] === "{" || text[index] === "[") {
      const stack = [text[index++]];
      while (index < text.length && stack.length) {
        const character = text[index];
        if (character === '"') readString();
        else {
          if (character === "{" || character === "[") stack.push(character);
          if (character === "}" || character === "]") stack.pop();
          index += 1;
        }
      }
      return text.slice(start, index);
    }
    while (index < text.length && text[index] !== "," && text[index] !== "}") index += 1;
    return text.slice(start, index).trimEnd();
  };

  skipWhitespace();
  if (text[index++] !== "{") throw new Error("支付宝响应格式无效");
  while (index < text.length) {
    skipWhitespace();
    if (text[index] === "}") break;
    if (text[index] !== '"') throw new Error("支付宝响应格式无效");
    const key = JSON.parse(readString());
    skipWhitespace();
    if (text[index++] !== ":") throw new Error("支付宝响应格式无效");
    skipWhitespace();
    const value = readValue();
    if (key === property) return value;
    skipWhitespace();
    if (text[index] === ",") index += 1;
  }
  return "";
}

export function verifyAlipayResponseSignature(body: string, responseProperty: string, publicKey: string) {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  const sign = typeof parsed.sign === "string" ? parsed.sign : "";
  const content = jsonPropertyRaw(body, responseProperty);
  if (!sign || !content) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(content, "utf8");
  verifier.end();
  return verifier.verify(createPublicKey(normalizePem(publicKey, publicKey.includes("CERTIFICATE") ? "CERTIFICATE" : "PUBLIC KEY")), sign, "base64");
}

const alipayOfficialDriver: PaymentDriver = {
  successResponse: "success",
  failureResponse: "failure",
  async createCheckout(config, input) {
    if (!config.merchantId || !config.privateKey || !config.publicKey) throw new Error("支付宝 APPID、应用私钥或支付宝公钥未配置");
    const gateway = config.gatewayUrl || "https://openapi.alipay.com/gateway.do";
    const params: Record<string, string> = {
      app_id: config.merchantId,
      method: "alipay.trade.precreate",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: alipayTimestamp(),
      version: "1.0",
      notify_url: input.notifyUrl,
      biz_content: JSON.stringify({ subject: input.name.slice(0, 100), out_trade_no: input.orderNo, total_amount: (input.amountCents / 100).toFixed(2), timeout_express: "30m" }),
    };
    params.sign = alipaySign(params, config.privateKey);
    const response = await fetch(normalizedHttpUrl(gateway, "支付宝网关").toString(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8", accept: "application/json" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await response.text();
    const data = JSON.parse(responseText) as any;
    const result = data?.alipay_trade_precreate_response;
    if (!response.ok || result?.code !== "10000" || !result?.qr_code) throw new Error(`支付宝下单失败：${String(result?.sub_msg || result?.msg || response.status).slice(0, 300)}`);
    if (!verifyAlipayResponseSignature(responseText, "alipay_trade_precreate_response", config.publicKey)) throw new Error("支付宝下单响应签名无效");
    return { type: "qrcode", checkoutUrl: result.qr_code, requestPayload: { ...params, sign: "[REDACTED]" }, responsePayload: data };
  },
  async verifyNotification(config, input) {
    if (!config.publicKey || !verifyAlipaySignature(input.params, config.publicKey)) throw new Error("支付宝通知签名无效");
    if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(input.params.trade_status)) throw new Error("支付宝订单尚未成功");
    if (config.merchantId && input.params.app_id && input.params.app_id !== config.merchantId) throw new Error("支付宝通知 APPID 不匹配");
    return {
      orderNo: input.params.out_trade_no || "",
      tradeNo: input.params.trade_no || "",
      amountCents: amountCents(input.params.total_amount),
      payload: input.params,
    };
  },
};

function wechatAuthorization(config: PaymentChannelConfig, method: string, path: string, body: string) {
  if (!config.merchantId || !config.certificateSerial || !config.privateKey) throw new Error("微信支付商户号、商户证书序列号或商户私钥未配置");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(createPrivateKey(normalizePem(config.privateKey, "PRIVATE KEY")), "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.certificateSerial}",signature="${signature}"`;
}

function verifyWechatHeaders(publicKey: string, headers: Record<string, string>, rawBody: string) {
  const timestamp = headers["wechatpay-timestamp"] || "";
  const nonce = headers["wechatpay-nonce"] || "";
  const signature = headers["wechatpay-signature"] || "";
  if (!timestamp || !nonce || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`);
  verifier.end();
  return verifier.verify(createPublicKey(normalizePem(publicKey, publicKey.includes("CERTIFICATE") ? "CERTIFICATE" : "PUBLIC KEY")), signature, "base64");
}

export function decryptWechatResource(apiV3Key: string, resource: { ciphertext: string; nonce: string; associated_data?: string }) {
  if (Buffer.byteLength(apiV3Key) !== 32) throw new Error("微信支付 API v3 密钥必须为 32 字节");
  const encrypted = Buffer.from(resource.ciphertext, "base64");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(resource.nonce));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data || ""));
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
}

export function encryptWechatResourceForTest(apiV3Key: string, value: unknown, nonce = "0123456789ab", associatedData = "transaction") {
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString("base64");
  return { ciphertext, nonce, associated_data: associatedData };
}

const wechatOfficialDriver: PaymentDriver = {
  successResponse: JSON.stringify({ code: "SUCCESS", message: "成功" }),
  failureResponse: JSON.stringify({ code: "FAIL", message: "失败" }),
  async createCheckout(config, input) {
    if (!config.appId || !config.merchantId || !config.privateKey || !config.certificateSerial || !config.apiV3Key || !config.publicKey) {
      throw new Error("微信支付 AppID、商户号、商户私钥、证书序列号、API v3 密钥或平台证书未配置");
    }
    const gateway = normalizedHttpUrl(config.gatewayUrl || "https://api.mch.weixin.qq.com", "微信支付网关");
    const path = "/v3/pay/transactions/native";
    const payload = {
      appid: config.appId,
      mchid: config.merchantId,
      description: input.name.slice(0, 127),
      out_trade_no: input.orderNo,
      notify_url: input.notifyUrl,
      amount: { total: input.amountCents, currency: config.currency || "CNY" },
    };
    const body = JSON.stringify(payload);
    const response = await fetch(new URL(path, gateway).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: wechatAuthorization(config, "POST", path, body),
        "user-agent": "xui-commercial-payment/1.0",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const responseText = await response.text();
    let data: any;
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { data = { raw: responseText }; }
    if (!response.ok || !data?.code_url) throw new Error(`微信支付下单失败：${String(data?.message || data?.code || response.status).slice(0, 300)}`);
    const responseHeaders = Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]));
    if (!verifyWechatHeaders(config.publicKey, responseHeaders, responseText)) throw new Error("微信支付下单响应签名无效");
    return { type: "qrcode", checkoutUrl: data.code_url, requestPayload: payload, responsePayload: data };
  },
  async verifyNotification(config, input) {
    if (!config.publicKey || !config.apiV3Key) throw new Error("微信支付平台证书或 API v3 密钥未配置");
    const rawBody = typeof input.body === "string" ? input.body : JSON.stringify(input.body || {});
    if (!verifyWechatHeaders(config.publicKey, input.headers, rawBody)) throw new Error("微信支付通知签名无效");
    const envelope = typeof input.body === "string" ? JSON.parse(input.body) : input.body as any;
    const data = decryptWechatResource(config.apiV3Key, envelope?.resource);
    if (data.trade_state !== "SUCCESS") throw new Error("微信支付订单尚未成功");
    if (config.merchantId && data.mchid !== config.merchantId) throw new Error("微信支付商户号不匹配");
    if (config.appId && data.appid !== config.appId) throw new Error("微信支付 AppID 不匹配");
    return {
      orderNo: data.out_trade_no || "",
      tradeNo: data.transaction_id || "",
      amountCents: Number(data.amount?.total),
      payload: data,
    };
  },
};

const drivers: Record<Exclude<PaymentProvider, "manual">, PaymentDriver> = {
  epay: epayDriver,
  mgate: mgateDriver,
  tokenpay: tokenpayDriver,
  epusdt: epusdtDriver,
  alipay_official: alipayOfficialDriver,
  wechat_official: wechatOfficialDriver,
};

export function getPaymentDriver(provider: PaymentProvider) {
  if (provider === "manual") throw new Error("人工收款不使用自动支付驱动");
  const driver = drivers[provider];
  if (!driver) throw new Error("不支持的支付驱动");
  return driver;
}
