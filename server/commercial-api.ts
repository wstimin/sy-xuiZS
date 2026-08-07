import { NextFunction, Request, Response, Router } from "express";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { CommercialStore, DurationUnit, EntitlementGrantInput, PlanInput, QuotaMode, SessionUser, UserRole } from "./commercial-store.js";
import { sendSmtpMail } from "./email-service.js";
import { getPaymentDriver, PaymentChannelConfig, PaymentProvider } from "./payment-service.js";

const USER_COOKIE_NAME = "xui_user_session";
const ADMIN_COOKIE_NAME = "xui_admin_session";
const CONTACT_QR_MAX_BYTES = 1024 * 1024;
const CONTACT_QR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CONTACT_METHOD_LIMIT = 10;
const CONTACT_METHOD_ID_PATTERN = /^[a-z0-9_-]{1,40}$/;
const CONTACT_METHOD_TYPES = new Set(["wechat", "qq", "telegram", "whatsapp", "wecom", "email", "phone", "discord", "line", "custom"]);
const RESOURCE_LOGO_MAX_BYTES = 512 * 1024;
const RESOURCE_PAGE_MAX_BYTES = 256 * 1024;
const RESOURCE_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon"]);
const RESOURCE_RECOMMENDATION_LIMIT = 20;
const RESOURCE_ID_PATTERN = /^[a-z0-9_-]{1,40}$/;

type ContactMethodType = "wechat" | "qq" | "telegram" | "whatsapp" | "wecom" | "email" | "phone" | "discord" | "line" | "custom";
type ContactMethod = {
  id: string;
  type: ContactMethodType;
  enabled: boolean;
  name: string;
  value: string;
  contactUrl: string;
  qrCodeUrl: string;
  sortOrder: number;
};

type ContactSettingsInput = {
  enabled: boolean;
  buttonLabel: string;
  title: string;
  description: string;
  methods: ContactMethod[];
};

type ResourceRecommendationCategory = "server" | "residential_ip";
type ResourceRecommendationItem = {
  id: string;
  category: ResourceRecommendationCategory;
  enabled: boolean;
  name: string;
  description: string;
  logoUrl: string;
  badge: string;
  purchaseUrl: string;
  buttonLabel: string;
  openInNewTab: boolean;
  sortOrder: number;
};

type ResourceRecommendationSettings = {
  serverEnabled: boolean;
  residentialIpEnabled: boolean;
  items: ResourceRecommendationItem[];
};

function cookieValue(req: Request, name: string) {
  const source = req.header("cookie") || "";
  for (const part of source.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function secureCookie(req: Request) {
  const configured = process.env.SESSION_COOKIE_SECURE;
  if (configured === "true") return true;
  if (configured === "false") return false;
  return req.secure || req.header("x-forwarded-proto") === "https";
}

function setSessionCookie(req: Request, res: Response, name: string, token: string) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60_000,
    path: "/",
  });
}

function clearSessionCookie(req: Request, res: Response, name: string) {
  res.clearCookie(name, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: "lax",
    path: "/",
  });
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function intValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function quotaMode(value: unknown): QuotaMode {
  return value === "limited" || value === "unlimited" ? value : "none";
}

function durationUnit(value: unknown): DurationUnit {
  return value === "months" || value === "years" || value === "lifetime" ? value : "days";
}

function optionalHttpUrl(value: unknown, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length > 1000) throw new Error(`${label}不能超过 1000 个字符`);
  let parsed: URL;
  try { parsed = new URL(normalized); }
  catch { throw new Error(`${label}格式不正确`); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`${label}必须使用 HTTP 或 HTTPS`);
  return normalized;
}

function optionalContactUrl(value: unknown, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length > 1000) throw new Error(`${label}不能超过 1000 个字符`);
  let parsed: URL;
  try { parsed = new URL(normalized); }
  catch { throw new Error(`${label}格式不正确`); }
  if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) throw new Error(`${label}仅支持 HTTP、HTTPS、mailto 或 tel`);
  return normalized;
}

function limitedText(value: unknown, label: string, maxLength: number, fallback = "") {
  const normalized = String(value ?? fallback).trim();
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

function contactMethod(value: unknown): ContactMethod {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = limitedText(input.id, "联系方式标识", 40).toLowerCase();
  if (!CONTACT_METHOD_ID_PATTERN.test(id)) throw new Error("联系方式标识只能包含小写字母、数字、下划线和短横线");
  const type = String(input.type || "custom") as ContactMethodType;
  if (!CONTACT_METHOD_TYPES.has(type)) throw new Error("联系方式类型不正确");
  const name = limitedText(input.name, "联系方式名称", 80);
  if (!name) throw new Error("请填写联系方式名称");
  const sortOrder = intValue(input.sortOrder);
  if (sortOrder < -9999 || sortOrder > 9999) throw new Error("联系方式排序必须在 -9999 到 9999 之间");
  return {
    id,
    type,
    enabled: input.enabled !== false,
    name,
    value: limitedText(input.value, "账号或联系信息", 1000),
    contactUrl: optionalContactUrl(input.contactUrl, "联系链接"),
    qrCodeUrl: optionalHttpUrl(input.qrCodeUrl, "二维码图片地址"),
    sortOrder,
  };
}

function legacyContactMethod(store: CommercialStore): ContactMethod | null {
  const value = store.getSetting("contact_text", "");
  const contactUrl = store.getSetting("contact_url", "");
  const qrCodeUrl = store.getSetting("contact_qr_url", "");
  const qrCodeData = store.getSetting("contact_qr_data", "");
  if (!value && !contactUrl && !qrCodeUrl && !qrCodeData) return null;
  return {
    id: "legacy-contact",
    type: "custom",
    enabled: true,
    name: "联系方式",
    value,
    contactUrl,
    qrCodeUrl,
    sortOrder: 10,
  };
}

function contactMethods(store: CommercialStore) {
  const stored = store.getSetting("contact_methods", "");
  if (stored.trim()) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, CONTACT_METHOD_LIMIT).map(contactMethod);
    } catch {
      return [];
    }
  }
  const legacy = legacyContactMethod(store);
  if (!legacy) return [];
  store.setSetting("contact_methods", JSON.stringify([legacy]));
  return [legacy];
}

function contactQrSettingKey(id: string, suffix: "mime" | "data") {
  if (!CONTACT_METHOD_ID_PATTERN.test(id)) throw new Error("联系方式标识格式不正确");
  return `contact_qr_${id}_${suffix}`;
}

function contactQrValue(store: CommercialStore, id: string, suffix: "mime" | "data") {
  const value = store.getSetting(contactQrSettingKey(id, suffix), "");
  if (value || id !== "legacy-contact") return value;
  return store.getSetting(`contact_qr_${suffix}`, "");
}

function contactSettings(store: CommercialStore, includeDisabled = false) {
  return {
    enabled: store.getSetting("contact_enabled", "false") === "true",
    buttonLabel: store.getSetting("contact_button_label", "立即咨询"),
    title: store.getSetting("contact_title", "联系站长"),
    description: store.getSetting("contact_description", ""),
    methods: contactMethods(store)
      .filter(method => includeDisabled || method.enabled)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"))
      .map(method => ({
        ...method,
        qrCodeUploaded: Boolean(contactQrValue(store, method.id, "data")),
      })),
  };
}

function contactSettingsInput(value: unknown, current: ReturnType<typeof contactSettings>): ContactSettingsInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const methods = input.methods === undefined
    ? current.methods.map(({ qrCodeUploaded: _qrCodeUploaded, ...method }) => method)
    : (() => {
      if (!Array.isArray(input.methods)) throw new Error("联系方式数据格式不正确");
      if (input.methods.length > CONTACT_METHOD_LIMIT) throw new Error(`联系方式最多只能配置 ${CONTACT_METHOD_LIMIT} 项`);
      const entries = input.methods.map(contactMethod);
      if (new Set(entries.map(method => method.id)).size !== entries.length) throw new Error("联系方式标识不能重复");
      return entries;
    })();
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
    buttonLabel: limitedText(input.buttonLabel, "悬浮按钮名称", 40, current.buttonLabel) || "立即咨询",
    title: limitedText(input.title, "咨询弹窗标题", 100, current.title) || "联系站长",
    description: limitedText(input.description, "咨询说明", 1000, current.description),
    methods,
  };
}

function validContactQr(mimeType: string, data: Buffer) {
  if (!CONTACT_QR_TYPES.has(mimeType)) throw new Error("二维码仅支持 PNG、JPEG 或 WebP 图片");
  if (!data.length || data.length > CONTACT_QR_MAX_BYTES) throw new Error("二维码图片大小必须在 1MB 以内");
  const isPng = mimeType === "image/png" && data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = mimeType === "image/jpeg" && data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isWebp = mimeType === "image/webp" && data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new Error("二维码图片内容与文件格式不匹配");
}

function sendContactQr(store: CommercialStore, id: string, res: Response) {
  const data = contactQrValue(store, id, "data");
  const mimeType = contactQrValue(store, id, "mime");
  if (!data || !CONTACT_QR_TYPES.has(mimeType)) return res.status(404).json({ success: false, error: "尚未上传该联系方式的二维码" });
  const image = Buffer.from(data, "base64");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(image.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(image);
}

function resourceLogoSettingKey(id: string, suffix: "mime" | "data") {
  if (!RESOURCE_ID_PATTERN.test(id)) throw new Error("推荐项标识格式不正确");
  return `resource_logo_${id}_${suffix}`;
}

function validResourceLogo(mimeType: string, data: Buffer) {
  if (!data.length || data.length > RESOURCE_LOGO_MAX_BYTES) throw new Error("推荐 Logo 大小必须在 512KB 以内");
  const isPng = mimeType === "image/png" && data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = mimeType === "image/jpeg" && data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isWebp = mimeType === "image/webp" && data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  const isIcon = mimeType === "image/x-icon" && data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  if (!isPng && !isJpeg && !isWebp && !isIcon) throw new Error("推荐 Logo 内容与文件格式不匹配");
}

function detectedResourceLogoType(data: Buffer) {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "image/x-icon";
  throw new Error("网站图标不是支持的 PNG、JPEG、WebP 或 ICO 图片");
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")
    || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") || normalized.startsWith("2001:db8:");
}

async function assertPublicResourceUrl(value: string) {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error("只能从公开的 HTTP 或 HTTPS 网站获取 Logo");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("不能从本机或内网地址获取 Logo");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) throw new Error("不能从本机或内网地址获取 Logo");
  return url;
}

async function readLimitedResponse(response: globalThis.Response, maxBytes: number) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error(`远程内容不能超过 ${Math.round(maxBytes / 1024)}KB`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, length);
}

async function fetchPublicResource(urlValue: string, maxBytes: number, acceptedContent: "page" | "image") {
  let current = await assertPublicResourceUrl(urlValue);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      headers: { "user-agent": "XUI-Resource-Logo/1.0", accept: acceptedContent === "page" ? "text/html,image/*;q=0.8,*/*;q=0.2" : "image/*,*/*;q=0.2" },
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("网站跳转次数过多，无法获取 Logo");
      current = await assertPublicResourceUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`网站返回 HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw new Error(`远程内容不能超过 ${Math.round(maxBytes / 1024)}KB`);
    return { response, data: await readLimitedResponse(response, maxBytes), finalUrl: current };
  }
  throw new Error("无法获取网站内容");
}

function htmlAttributes(tag: string) {
  const values: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return values;
}

function resourceLogoCandidates(html: string, pageUrl: URL) {
  const declared = Array.from(html.matchAll(/<link\b[^>]*>/gi))
    .map(match => htmlAttributes(match[0]))
    .filter(attributes => attributes.href && (attributes.rel || "").toLowerCase().split(/\s+/).some(rel => rel === "icon" || rel === "apple-touch-icon" || rel === "apple-touch-icon-precomposed"))
    .map(attributes => new URL(attributes.href, pageUrl).toString());
  return Array.from(new Set([...declared, new URL("/apple-touch-icon.png", pageUrl).toString(), new URL("/favicon-32x32.png", pageUrl).toString(), new URL("/favicon.png", pageUrl).toString(), new URL("/favicon.ico", pageUrl).toString()]));
}

async function fetchResourceLogo(websiteUrl: string) {
  const page = await fetchPublicResource(websiteUrl, RESOURCE_PAGE_MAX_BYTES, "page");
  const directType = page.response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (directType?.startsWith("image/")) {
    const mimeType = detectedResourceLogoType(page.data);
    validResourceLogo(mimeType, page.data);
    return { data: page.data, mimeType, sourceUrl: page.finalUrl.toString() };
  }
  const html = page.data.toString("utf8");
  for (const candidate of resourceLogoCandidates(html, page.finalUrl)) {
    try {
      const image = await fetchPublicResource(candidate, RESOURCE_LOGO_MAX_BYTES, "image");
      const mimeType = detectedResourceLogoType(image.data);
      validResourceLogo(mimeType, image.data);
      return { data: image.data, mimeType, sourceUrl: image.finalUrl.toString() };
    } catch {
      // Try the next declared or conventional site icon.
    }
  }
  throw new Error("没有在该网站找到可用的 Logo，请改用手动上传或填写 Logo 地址");
}

function resourceRecommendationItem(value: unknown): ResourceRecommendationItem {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = limitedText(input.id, "推荐项标识", 40).toLowerCase();
  if (!RESOURCE_ID_PATTERN.test(id)) throw new Error("推荐项标识只能包含小写字母、数字、下划线和短横线");
  const category = input.category === "residential_ip" ? "residential_ip" : input.category === "server" ? "server" : null;
  if (!category) throw new Error("推荐项分类不正确");
  const name = limitedText(input.name, "厂商名称", 80);
  if (!name) throw new Error("请填写推荐厂商名称");
  const purchaseUrl = optionalHttpUrl(input.purchaseUrl, "跳转链接");
  if (!purchaseUrl) throw new Error(`${name} 必须填写跳转链接`);
  const sortOrder = intValue(input.sortOrder);
  if (sortOrder < -9999 || sortOrder > 9999) throw new Error("推荐项排序必须在 -9999 到 9999 之间");
  return {
    id,
    category,
    enabled: input.enabled !== false,
    name,
    description: limitedText(input.description, "推荐简介", 500),
    logoUrl: optionalHttpUrl(input.logoUrl, "Logo 图片地址"),
    badge: limitedText(input.badge, "推荐标签", 30),
    purchaseUrl,
    buttonLabel: limitedText(input.buttonLabel, "按钮名称", 30, "了解详情") || "了解详情",
    openInNewTab: input.openInNewTab !== false,
    sortOrder,
  };
}

function resourceRecommendationSettings(store: CommercialStore): ResourceRecommendationSettings {
  const fallback: ResourceRecommendationSettings = { serverEnabled: true, residentialIpEnabled: true, items: [] };
  try {
    const parsed = JSON.parse(store.getSetting("resource_recommendations", JSON.stringify(fallback))) as Record<string, unknown>;
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, RESOURCE_RECOMMENDATION_LIMIT).map(resourceRecommendationItem) : [];
    return {
      serverEnabled: parsed.serverEnabled !== false,
      residentialIpEnabled: parsed.residentialIpEnabled !== false,
      items,
    };
  } catch {
    return fallback;
  }
}

function resourceRecommendationSettingsInput(value: unknown): ResourceRecommendationSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (!Array.isArray(input.items)) throw new Error("推荐项数据格式不正确");
  if (input.items.length > RESOURCE_RECOMMENDATION_LIMIT) throw new Error(`资源推荐最多只能配置 ${RESOURCE_RECOMMENDATION_LIMIT} 项`);
  const items = input.items.map(resourceRecommendationItem);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("推荐项标识不能重复");
  return {
    serverEnabled: input.serverEnabled !== false,
    residentialIpEnabled: input.residentialIpEnabled !== false,
    items,
  };
}

function resourceRecommendationResponse(store: CommercialStore, includeDisabled = false) {
  const settings = resourceRecommendationSettings(store);
  const categoryEnabled = (category: ResourceRecommendationCategory) => category === "server" ? settings.serverEnabled : settings.residentialIpEnabled;
  return {
    serverEnabled: settings.serverEnabled,
    residentialIpEnabled: settings.residentialIpEnabled,
    items: settings.items
      .filter(item => includeDisabled || (item.enabled && categoryEnabled(item.category)))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"))
      .map(item => ({
        ...item,
        logoUploaded: Boolean(store.getSetting(resourceLogoSettingKey(item.id, "data"), "")),
      })),
  };
}

function sendResourceLogo(store: CommercialStore, id: string, res: Response) {
  const data = store.getSetting(resourceLogoSettingKey(id, "data"), "");
  const mimeType = store.getSetting(resourceLogoSettingKey(id, "mime"), "");
  if (!data || !RESOURCE_LOGO_TYPES.has(mimeType)) return res.status(404).json({ success: false, error: "尚未上传推荐 Logo" });
  const image = Buffer.from(data, "base64");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", String(image.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(image);
}

function planInput(body: Record<string, unknown>): PlanInput {
  return {
    name: String(body.name || ""),
    description: String(body.description || ""),
    priceCents: intValue(body.priceCents),
    durationUnit: durationUnit(body.durationUnit),
    durationValue: intValue(body.durationValue, 1),
    panelMode: quotaMode(body.panelMode),
    panelLimit: intValue(body.panelLimit),
    nodeMode: quotaMode(body.nodeMode),
    nodeLimit: intValue(body.nodeLimit),
    dailyPanelLimit: intValue(body.dailyPanelLimit),
    dailyNodeLimit: intValue(body.dailyNodeLimit),
    concurrencyLimit: intValue(body.concurrencyLimit, 1),
    enabled: body.enabled !== false,
    sortOrder: intValue(body.sortOrder),
  };
}

function grantInput(body: Record<string, unknown>): EntitlementGrantInput {
  return {
    name: String(body.name || "管理员发放权益"),
    durationUnit: durationUnit(body.durationUnit),
    durationValue: intValue(body.durationValue, 1),
    panelMode: quotaMode(body.panelMode),
    panelLimit: intValue(body.panelLimit),
    nodeMode: quotaMode(body.nodeMode),
    nodeLimit: intValue(body.nodeLimit),
    dailyPanelLimit: intValue(body.dailyPanelLimit),
    dailyNodeLimit: intValue(body.dailyNodeLimit),
    concurrencyLimit: intValue(body.concurrencyLimit, 1),
  };
}

export function attachCommercialUser(store: CommercialStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userToken = cookieValue(req, USER_COOKIE_NAME);
    const adminToken = cookieValue(req, ADMIN_COOKIE_NAME);
    const sessionUser = store.getSessionUser(userToken);
    const admin = store.getSessionUser(adminToken);
    res.locals.commercialUser = sessionUser?.role === "user" ? sessionUser : null;
    res.locals.commercialAdmin = admin?.role === "admin" ? admin : null;
    res.locals.commercialUserSessionToken = userToken;
    res.locals.commercialAdminSessionToken = adminToken;
    next();
  };
}

export function requireCommercialUser(_req: Request, res: Response, next: NextFunction) {
  const user = res.locals.commercialUser as SessionUser | null;
  if (!user) return res.status(401).json({ success: false, error: "请先登录后再执行此操作" });
  if (user.status !== "active") return res.status(403).json({ success: false, error: "账号已被禁用" });
  next();
}

export function commercialUser(res: Response) {
  return res.locals.commercialUser as SessionUser;
}

function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const user = res.locals.commercialAdmin as SessionUser | null;
  if (!user) return res.status(401).json({ success: false, error: "请先登录管理端" });
  if (user.status !== "active") return res.status(403).json({ success: false, error: "管理员账号已被禁用" });
  next();
}

function adminUser(res: Response) {
  return res.locals.commercialAdmin as SessionUser;
}

function route(handler: (req: Request, res: Response) => unknown) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(400).json({ success: false, error: message(error) });
    }
  };
}

function publicBaseUrl(req: Request, store: CommercialStore) {
  const configured = store.getEmailSettings().publicBaseUrl.replace(/\/+$/, "");
  if (configured) return configured;
  const protocol = req.header("x-forwarded-proto") || req.protocol;
  const host = req.header("x-forwarded-host") || req.header("host");
  if (!host) throw new Error("无法确定公网回调地址，请在邮件设置中填写公网访问地址");
  return `${protocol}://${host}`;
}

async function sendConfiguredMail(store: CommercialStore, recipient: string, purpose: string, subject: string, text: string) {
  const settings = store.getEmailSettings(true);
  if (!settings.emailEnabled) throw new Error("邮件服务尚未启用");
  try {
    await sendSmtpMail({
      host: settings.smtpHost, port: settings.smtpPort, encryption: settings.smtpEncryption,
      username: settings.smtpUsername, password: settings.smtpPassword || "", fromName: settings.smtpFromName,
      fromEmail: settings.smtpFromEmail, replyTo: settings.smtpReplyTo,
    }, recipient, subject, text);
    store.recordEmailDelivery(recipient, purpose, "sent");
  } catch (error) {
    store.recordEmailDelivery(recipient, purpose, "failed", message(error));
    throw error;
  }
}

function paymentParams(req: Request) {
  const source = { ...(req.query || {}), ...(req.body || {}) } as Record<string, unknown>;
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] || "") : value && typeof value === "object" ? JSON.stringify(value) : String(value || "")])) as Record<string, string>;
}

function paymentHeaders(req: Request) {
  return Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(",") : String(value || "")])) as Record<string, string>;
}

function channelConfig(method: ReturnType<CommercialStore["getPaymentMethods"]>[number]): PaymentChannelConfig {
  return {
    id: method.id,
    provider: method.provider as PaymentProvider,
    gatewayUrl: method.gatewayUrl,
    merchantId: method.merchantId,
    merchantSecret: method.merchantSecret,
    channel: method.channel,
    currency: method.currency,
    callbackBaseUrl: method.callbackBaseUrl,
    appId: method.appId,
    privateKey: method.privateKey,
    publicKey: method.publicKey,
    certificateSerial: method.certificateSerial,
    apiV3Key: method.apiV3Key,
    sandbox: method.sandbox,
  };
}

function paymentBaseUrl(req: Request, store: CommercialStore, callbackBaseUrl = "") {
  return callbackBaseUrl.replace(/\/+$/, "") || publicBaseUrl(req, store);
}

async function createCheckout(req: Request, store: CommercialStore, order: any) {
  const method = store.getPaymentMethods(true, true).find(item => item.id === order.paymentProvider);
  if (!method?.enabled) throw new Error("订单所选支付方式已停用，请取消订单后重新下单");
  if (!method.provider || method.provider === "manual") return null;
  const provider = method.provider as PaymentProvider;
  const driver = getPaymentDriver(provider);
  const baseUrl = paymentBaseUrl(req, store, method.callbackBaseUrl);
  const snapshot = JSON.parse(order.planSnapshot || "{}");
  const user = store.getUserById(order.userId);
  const requestContext = { provider, channelId: method.id, orderNo: order.orderNo };
  try {
    const config = channelConfig(method);
    if (provider === "epay" && order.paymentChannel) config.channel = order.paymentChannel;
    const paypalReturnUrl = `${baseUrl}/api/payment/paypal/${encodeURIComponent(method.id)}/return`;
    const result = await driver.createCheckout(config, {
      orderNo: order.orderNo,
      amountCents: order.amountCents,
      name: String(snapshot.name || "网络搭建服务"),
      userKey: user?.email || user?.username || order.userId,
      notifyUrl: `${baseUrl}/api/payment/${provider}/${encodeURIComponent(method.id)}/notify`,
      returnUrl: provider === "paypal" ? paypalReturnUrl : `${baseUrl}/console?payment=return&order=${encodeURIComponent(order.id)}`,
      cancelUrl: `${baseUrl}/console?payment=cancel&order=${encodeURIComponent(order.id)}`,
      expiresAt: order.expiresAt,
    });
    store.closeOpenPaymentAttempts(order.id);
    const attempt = store.createPaymentAttempt(order.id, method.id, result.checkoutUrl, result.requestPayload, order.expiresAt, result.providerOrderId);
    return { attemptId: attempt.id, checkoutType: result.type, checkoutUrl: result.checkoutUrl };
  } catch (error) {
    store.createFailedPaymentAttempt(order.id, method.id, requestContext, error, order.expiresAt);
    throw error;
  }
}

export function createCommercialRouter(store: CommercialStore) {
  const router = Router();

  router.get("/runtime-config", (_req, res) => {
    res.json({ adminPath: store.getAdminPath() });
  });

  router.get("/auth/bootstrap-status", (_req, res) => {
    res.json({ required: !store.hasUsers() });
  });

  router.get("/auth/settings", (_req, res) => {
    const email = store.getEmailSettings();
    res.json({
      registrationEnabled: store.getSetting("registration_enabled", "true") === "true",
      emailEnabled: email.emailEnabled,
      emailVerificationRequired: email.emailVerificationRequired,
      verificationResendSeconds: email.verificationResendSeconds,
      siteName: email.siteName,
    });
  });

  router.post("/auth/send-code", route(async (req, res) => {
    const purpose = req.body?.purpose === "reset_password" ? "reset_password" : "register";
    const email = String(req.body?.email || "").trim().toLowerCase();
    const settings = store.getEmailSettings();
    if (!settings.emailEnabled) throw new Error("邮件服务尚未启用");
    if (purpose === "register" && store.emailExists(email)) throw new Error("邮箱已经注册");
    if (purpose === "reset_password" && !store.emailExists(email)) return res.json({ success: true });
    const result = store.createEmailCode(email, purpose);
    const action = purpose === "register" ? "注册账户" : "重置密码";
    await sendConfiguredMail(store, result.email, purpose, `${settings.siteName} ${action}验证码`,
      `你正在${action}。\n\n验证码：${result.code}\n\n验证码 ${settings.verificationCodeTtlMinutes} 分钟内有效，请勿转发给他人。`);
    res.json({ success: true, expiresAt: result.expiresAt });
  }));

  router.post("/auth/reset-password", route((req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    store.verifyEmailCode(email, "reset_password", String(req.body?.code || ""), false);
    store.resetPasswordByEmail(email, String(req.body?.nextPassword || ""));
    store.verifyEmailCode(email, "reset_password", String(req.body?.code || ""));
    res.json({ success: true });
  }));

  router.post("/auth/bootstrap", route((req, res) => {
    const user = store.bootstrapAdmin(String(req.body?.username || ""), String(req.body?.password || ""));
    if (!user) return res.status(409).json({ success: false, error: "系统已经完成初始化" });
    const token = store.createSession(user.id);
    setSessionCookie(req, res, ADMIN_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/auth/register", route((req, res) => {
    if (!store.hasUsers()) {
      return res.status(503).json({ success: false, error: "系统尚未初始化，请管理员先访问 /admin 创建管理账号" });
    }
    if (store.getSetting("registration_enabled", "true") !== "true") {
      return res.status(403).json({ success: false, error: "管理员已关闭新用户注册" });
    }
    const email = String(req.body?.email || "");
    if (!email.trim()) throw new Error("请输入邮箱地址");
    const emailSettings = store.getEmailSettings();
    if (emailSettings.emailVerificationRequired) store.verifyEmailCode(email, "register", String(req.body?.code || ""), false);
    const user = store.createUser(String(req.body?.username || ""), String(req.body?.password || ""), "user", email, emailSettings.emailVerificationRequired);
    if (emailSettings.emailVerificationRequired) store.verifyEmailCode(email, "register", String(req.body?.code || ""));
    const token = store.createSession(user.id);
    setSessionCookie(req, res, USER_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/auth/login", route((req, res) => {
    const user = store.authenticate(String(req.body?.identifier || req.body?.username || ""), String(req.body?.password || ""));
    if (user.role !== "user") return res.status(403).json({ success: false, error: "管理员请从 /admin 登录管理端" });
    const token = store.createSession(user.id);
    setSessionCookie(req, res, USER_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/admin/auth/login", route((req, res) => {
    const user = store.authenticate(String(req.body?.identifier || req.body?.username || ""), String(req.body?.password || ""));
    if (user.role !== "admin") return res.status(403).json({ success: false, error: "该账号不是管理员" });
    const token = store.createSession(user.id);
    setSessionCookie(req, res, ADMIN_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/auth/logout", route((req, res) => {
    store.deleteSession(cookieValue(req, USER_COOKIE_NAME));
    clearSessionCookie(req, res, USER_COOKIE_NAME);
    res.json({ success: true });
  }));

  router.post("/admin/auth/logout", route((req, res) => {
    store.deleteSession(cookieValue(req, ADMIN_COOKIE_NAME));
    clearSessionCookie(req, res, ADMIN_COOKIE_NAME);
    res.json({ success: true });
  }));

  router.get("/auth/me", (_req, res) => {
    res.json({ user: (res.locals.commercialUser as SessionUser | null) || null });
  });

  router.get("/admin/auth/me", (_req, res) => {
    res.json({ user: (res.locals.commercialAdmin as SessionUser | null) || null });
  });

  router.post("/auth/change-password", requireCommercialUser, route((req, res) => {
    const user = commercialUser(res);
    store.changePassword(user.id, String(req.body?.currentPassword || ""), String(req.body?.nextPassword || ""));
    clearSessionCookie(req, res, USER_COOKIE_NAME);
    res.json({ success: true });
  }));

  router.post("/admin/auth/change-password", requireAdmin, route((req, res) => {
    const user = adminUser(res);
    store.changePassword(user.id, String(req.body?.currentPassword || ""), String(req.body?.nextPassword || ""));
    clearSessionCookie(req, res, ADMIN_COOKIE_NAME);
    res.json({ success: true });
  }));

  router.patch("/admin/account", requireAdmin, route((req, res) => {
    const acting = adminUser(res);
    const previousUsername = acting.username;
    const user = store.updateUsername(acting.id, String(req.body?.username || ""));
    store.recordAdminAction(acting.id, "修改管理员用户名", "user", acting.id, `${previousUsername} -> ${user.username}`);
    res.json({ success: true, user });
  }));

  router.get("/plans", (_req, res) => res.json({ plans: store.listPlans() }));
  router.get("/contact-settings", (_req, res) => res.json({ contact: contactSettings(store) }));
  router.get("/contact-methods/:id/qr", route((req, res) => {
    const id = String(req.params.id || "");
    if (!contactMethods(store).some(method => method.id === id && method.enabled)) return res.status(404).json({ success: false, error: "联系方式不存在或未启用" });
    sendContactQr(store, id, res);
  }));
  router.get("/resource-recommendations", requireCommercialUser, (_req, res) => res.json({ recommendations: resourceRecommendationResponse(store) }));
  router.get("/resource-recommendations/:id/logo", requireCommercialUser, route((req, res) => {
    sendResourceLogo(store, String(req.params.id || ""), res);
  }));
  router.get("/contact-qr", (_req, res) => {
    const data = store.getSetting("contact_qr_data", "");
    const mimeType = store.getSetting("contact_qr_mime", "");
    if (!data || !CONTACT_QR_TYPES.has(mimeType)) return res.status(404).json({ success: false, error: "尚未上传联系二维码" });
    const image = Buffer.from(data, "base64");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", String(image.length));
    res.send(image);
  });
  router.get("/payment-methods", (_req, res) => res.json({
    paymentMethods: store.getPaymentMethods(),
    redeemCodePurchaseUrl: store.getSetting("redeem_code_purchase_url", ""),
  }));

  router.get("/payment/paypal/:channelId/return", async (req, res) => {
    const channel = store.getPaymentMethods(true, true, true).find(item => item.id === req.params.channelId && item.provider === "paypal");
    const token = String(req.query.token || "").trim();
    const baseUrl = publicBaseUrl(req, store);
    if (!channel || !token) return res.redirect(`${baseUrl}/console?payment=error`);
    try {
      const attempt = store.getPaymentAttemptByProviderOrder(channel.id, token);
      if (!attempt) throw new Error("PayPal 支付订单不存在");
      const order = store.getOrder(attempt.orderId);
      if (!order || order.paymentProvider !== channel.id) throw new Error("PayPal 支付订单或通道不匹配");
      const driver = getPaymentDriver("paypal");
      if (!driver.captureCheckout) throw new Error("PayPal 扣款功能不可用");
      const verified = await driver.captureCheckout(channelConfig(channel), token, attempt.id);
      if (verified.orderNo !== order.orderNo || verified.amountCents !== order.amountCents) throw new Error("PayPal 扣款订单或金额不匹配");
      store.completePaymentAttempt(order.id, channel.id, verified.tradeNo, verified.payload);
      store.recordPaymentNotification(channel.id, "paypal", verified.orderNo, "accepted", verified.payload);
      return res.redirect(`${baseUrl}/console?payment=success&order=${encodeURIComponent(order.id)}`);
    } catch (error) {
      store.recordPaymentNotification(channel.id, "paypal", "", "rejected", { token }, message(error));
      return res.redirect(`${baseUrl}/console?payment=error`);
    }
  });

  router.all("/payment/:provider/:channelId/notify", async (req, res) => {
    const provider = req.params.provider as PaymentProvider;
    let driver;
    try { driver = getPaymentDriver(provider); } catch { return res.status(404).type("text/plain").send("fail"); }
    const channel = store.getPaymentMethods(true, true, true).find(item => item.id === req.params.channelId && item.provider === provider);
    if (!channel) return res.status(404).type(provider === "wechat_official" ? "application/json" : "text/plain").send(driver.failureResponse);
    const params = paymentParams(req);
    if (req.method === "GET" && !Object.keys(params).length && (!req.body || !Object.keys(req.body).length)) {
      return res.status(200).type("text/plain; charset=utf-8").send("该地址是支付平台异步通知接口，不能直接在浏览器中测试。请将此地址填写到支付平台后台的异步通知地址。");
    }
    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    const body = provider === "wechat_official" || provider === "paypal" ? rawBody || JSON.stringify(req.body || {}) : req.body;
    try {
      const verified = await driver.verifyNotification(channelConfig(channel), {
        params, body, headers: paymentHeaders(req),
      });
      const order = store.getOrderByNo(verified.orderNo);
      if (!order || order.paymentProvider !== channel.id) throw new Error("支付通知订单或渠道不匹配");
      if (verified.amountCents !== order.amountCents) throw new Error("支付通知金额与订单金额不一致");
      store.completePaymentAttempt(order.id, channel.id, verified.tradeNo || `${provider}-${order.orderNo}`, verified.payload);
      store.recordPaymentNotification(channel.id, provider, verified.orderNo, "accepted", verified.payload);
      res.type(provider === "wechat_official" ? "application/json" : "text/plain").send(driver.successResponse);
    } catch (error) {
      store.recordPaymentNotification(channel.id, provider, params.out_trade_no || params.OutOrderId || params.order_id || "", "rejected", req.body, message(error));
      res.status(400).type(provider === "wechat_official" ? "application/json" : "text/plain").send(driver.failureResponse);
    }
  });

  router.get("/account", requireCommercialUser, (_req, res) => {
    const user = commercialUser(res);
    res.json({
      user,
      entitlements: store.listEntitlements(user.id),
      orders: store.listOrders(user.id),
      deployments: store.listDeployments(user.id),
      paymentInstructions: store.getSetting("payment_instructions", "下单后请联系管理员完成支付确认。"),
      paymentMethods: store.getPaymentMethods(),
      redeemCodePurchaseUrl: store.getSetting("redeem_code_purchase_url", ""),
    });
  });

  router.post("/redeem-codes/redeem", requireCommercialUser, route((req, res) => {
    const result = store.redeemCode(
      commercialUser(res).id,
      String(req.body?.code || ""),
      String(req.body?.planId || ""),
    );
    res.json({ success: true, ...result });
  }));

  router.post("/orders", requireCommercialUser, route(async (req, res) => {
    const order = store.createOrder(
      commercialUser(res).id,
      String(req.body?.planId || ""),
      String(req.body?.paymentProvider || "manual"),
    );
    try {
      const payment = await createCheckout(req, store, order);
      res.status(201).json({ success: true, order, payment });
    } catch (error) {
      res.status(201).json({ success: true, order, payment: null, paymentError: message(error) });
    }
  }));

  router.post("/orders/:id/checkout", requireCommercialUser, route(async (req, res) => {
    store.expirePendingOrders();
    const order = store.getOrder(req.params.id);
    if (!order || order.userId !== commercialUser(res).id) return res.status(404).json({ success: false, error: "订单不存在" });
    if (order.status !== "pending") throw new Error("只有待付款订单可以继续支付");
    const payment = await createCheckout(req, store, order);
    res.json({ success: true, order, payment });
  }));

  router.get("/orders/:id/status", requireCommercialUser, route((req, res) => {
    store.expirePendingOrders();
    const order = store.getOrder(req.params.id);
    if (!order || order.userId !== commercialUser(res).id) return res.status(404).json({ success: false, error: "订单不存在" });
    res.json({ order, attempts: store.listPaymentAttempts(order.id) });
  }));

  router.post("/orders/:id/cancel", requireCommercialUser, route((req, res) => {
    res.json({ success: true, order: store.cancelOrder(req.params.id, commercialUser(res).id) });
  }));

  router.get("/admin/stats", requireAdmin, (_req, res) => res.json({ stats: store.getDashboardStats() }));
  router.get("/admin/users", requireAdmin, (_req, res) => res.json({ users: store.listUsers() }));
  router.get("/admin/plans", requireAdmin, (_req, res) => res.json({ plans: store.listPlans(true) }));
  router.get("/admin/orders", requireAdmin, (_req, res) => res.json({ orders: store.listOrders() }));
  router.get("/admin/entitlements", requireAdmin, (_req, res) => res.json({ entitlements: store.listAllEntitlements() }));
  router.get("/admin/deployments", requireAdmin, (_req, res) => res.json({ deployments: store.listDeployments() }));
  router.get("/admin/payment-attempts", requireAdmin, (_req, res) => res.json({ attempts: store.listPaymentAttempts() }));
  router.get("/admin/payment-notifications", requireAdmin, (_req, res) => res.json({ notifications: store.listPaymentNotifications() }));
  router.get("/admin/redeem-codes", requireAdmin, (_req, res) => res.json({ redeemCodes: store.listRedeemCodes() }));
  router.get("/admin/usage-ledger", requireAdmin, (_req, res) => res.json({ entries: store.listUsageLedger() }));
  router.get("/admin/audit-logs", requireAdmin, (_req, res) => res.json({ logs: store.listAdminAuditLogs() }));
  router.get("/admin/users/:id/detail", requireAdmin, route((req, res) => {
    const detail = store.getUserDetail(req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: "用户不存在" });
    res.json(detail);
  }));
  router.get("/admin/settings", requireAdmin, (_req, res) => res.json({
    settings: {
      registrationEnabled: store.getSetting("registration_enabled", "true") === "true",
      panelDeployEnabled: store.getSetting("panel_deploy_enabled", "true") === "true",
      nodeDeployEnabled: store.getSetting("node_deploy_enabled", "true") === "true",
      paymentInstructions: store.getSetting("payment_instructions", "下单后请联系管理员完成支付确认。"),
      paymentMethods: store.getPaymentMethods(true).map(method => ({
        ...method,
        callbackUrl: method.provider && method.provider !== "manual"
          ? `${paymentBaseUrl(_req, store, method.callbackBaseUrl)}/api/payment/${method.provider}/${encodeURIComponent(method.id)}/notify`
          : "",
      })),
      email: store.getEmailSettings(),
      orderExpiryMinutes: Number(store.getSetting("order_expiry_minutes", "30")) || 30,
      adminPath: store.getAdminPath(),
      redeemCodePurchaseUrl: store.getSetting("redeem_code_purchase_url", ""),
      contact: contactSettings(store, true),
      recommendations: resourceRecommendationResponse(store, true),
    },
  }));

  router.post("/admin/plans", requireAdmin, route((req, res) => {
    const plan = store.createPlan(planInput(req.body || {}));
    store.recordAdminAction(adminUser(res).id, "创建套餐", "plan", plan.id, plan.name);
    res.status(201).json({ success: true, plan });
  }));
  router.put("/admin/plans/:id", requireAdmin, route((req, res) => {
    const plan = store.updatePlan(req.params.id, planInput(req.body || {}));
    if (!plan) return res.status(404).json({ success: false, error: "套餐不存在" });
    store.recordAdminAction(adminUser(res).id, "更新套餐", "plan", plan.id, plan.name);
    res.json({ success: true, plan });
  }));
  router.post("/admin/redeem-codes", requireAdmin, route((req, res) => {
    const redeemCodes = store.createRedeemCodes({
      planId: String(req.body?.planId || ""),
      quantity: intValue(req.body?.quantity),
      note: String(req.body?.note || ""),
      expiresAt: req.body?.expiresAt ? String(req.body.expiresAt) : null,
    });
    store.recordAdminAction(adminUser(res).id, "生成卡密", "redeem_code", "batch", JSON.stringify({
      planId: req.body?.planId,
      quantity: redeemCodes.length,
      note: String(req.body?.note || "").slice(0, 300),
    }));
    res.status(201).json({ success: true, redeemCodes });
  }));
  router.patch("/admin/redeem-codes/:id", requireAdmin, route((req, res) => {
    const status = req.body?.status;
    if (status !== "active" && status !== "disabled") throw new Error("卡密状态无效");
    store.updateRedeemCodeStatus(req.params.id, status);
    store.recordAdminAction(adminUser(res).id, status === "active" ? "启用卡密" : "停用卡密", "redeem_code", req.params.id);
    res.json({ success: true });
  }));
  router.post("/admin/users", requireAdmin, route((req, res) => {
    const roleValue = req.body?.role === "admin" ? "admin" : "user";
    const user = store.createUser(
      String(req.body?.username || ""),
      String(req.body?.password || ""),
      roleValue,
      req.body?.email === undefined ? undefined : String(req.body.email),
    );
    store.recordAdminAction(adminUser(res).id, "创建用户", "user", user.id, `${user.username} / ${user.role}`);
    res.status(201).json({ success: true, user });
  }));
  router.patch("/admin/users/:id", requireAdmin, route((req, res) => {
    const acting = adminUser(res);
    const status = req.body?.status;
    const roleValue = req.body?.role as UserRole | undefined;
    if (status === "active" || status === "disabled") {
      if (acting.id === req.params.id && status === "disabled") throw new Error("不能禁用当前登录的管理员账号");
      store.updateUserStatus(req.params.id, status);
    }
    if (roleValue === "user" || roleValue === "admin") {
      if (acting.id === req.params.id && roleValue !== "admin") throw new Error("不能移除当前账号的管理员权限");
      store.updateUserRole(req.params.id, roleValue);
    }
    if (typeof req.body?.email === "string") store.updateUserEmail(req.params.id, req.body.email, req.body?.emailVerified === true);
    store.recordAdminAction(acting.id, "更新用户", "user", req.params.id, JSON.stringify({ status, role: roleValue }));
    res.json({ success: true });
  }));
  router.post("/admin/users/:id/reset-password", requireAdmin, route((req, res) => {
    if (adminUser(res).id === req.params.id) throw new Error("当前管理员请使用修改密码功能");
    store.resetPassword(req.params.id, String(req.body?.nextPassword || ""));
    store.recordAdminAction(adminUser(res).id, "重置用户密码", "user", req.params.id);
    res.json({ success: true });
  }));
  router.post("/admin/orders/:id/mark-paid", requireAdmin, route((req, res) => {
    const tradeNo = String(req.body?.tradeNo || `manual-${Date.now()}`);
    const pendingOrder = store.getOrder(req.params.id);
    if (!pendingOrder) throw new Error("订单不存在");
    const order = store.markOrderPaid(req.params.id, pendingOrder.paymentProvider || "manual", tradeNo);
    store.recordAdminAction(adminUser(res).id, "确认订单收款", "order", req.params.id, tradeNo);
    res.json({ success: true, order });
  }));
  router.post("/admin/orders/:id/cancel", requireAdmin, route((req, res) => {
    const order = store.cancelOrder(req.params.id);
    store.recordAdminAction(adminUser(res).id, "取消订单", "order", req.params.id, order.orderNo);
    res.json({ success: true, order });
  }));
  router.post("/admin/orders/:id/refund", requireAdmin, route((req, res) => {
    const reason = String(req.body?.reason || "").trim();
    const refundTradeNo = String(req.body?.refundTradeNo || "").trim();
    if (!reason || !refundTradeNo) throw new Error("请填写外部退款凭证号和退款原因");
    const order = store.refundOrder(req.params.id, reason, refundTradeNo);
    store.recordAdminAction(adminUser(res).id, "确认外部退款并撤权", "order", req.params.id, `${order.orderNo} / ${refundTradeNo} / ${reason}`);
    res.json({ success: true, order });
  }));
  router.post("/admin/entitlements", requireAdmin, route((req, res) => {
    const userId = String(req.body?.userId || "");
    if (!store.getUserById(userId)) throw new Error("用户不存在");
    const id = store.grantEntitlement(userId, grantInput(req.body || {}));
    store.recordAdminAction(adminUser(res).id, "手工发放权益", "entitlement", id, String(req.body?.name || ""));
    res.status(201).json({ success: true, id });
  }));
  router.patch("/admin/entitlements/:id", requireAdmin, route((req, res) => {
    const status = req.body?.status;
    if (status !== "active" && status !== "revoked") throw new Error("权益状态无效");
    store.updateEntitlementStatus(req.params.id, status);
    store.recordAdminAction(adminUser(res).id, status === "active" ? "启用权益" : "撤销权益", "entitlement", req.params.id);
    res.json({ success: true });
  }));
  router.patch("/admin/entitlements/:id/quota", requireAdmin, route((req, res) => {
    const entitlement = store.adjustEntitlement(req.params.id, {
      panelRemaining: req.body?.panelRemaining === undefined ? undefined : intValue(req.body.panelRemaining, -1),
      nodeRemaining: req.body?.nodeRemaining === undefined ? undefined : intValue(req.body.nodeRemaining, -1),
      dailyPanelLimit: req.body?.dailyPanelLimit === undefined ? undefined : intValue(req.body.dailyPanelLimit, -1),
      dailyNodeLimit: req.body?.dailyNodeLimit === undefined ? undefined : intValue(req.body.dailyNodeLimit, -1),
      concurrencyLimit: req.body?.concurrencyLimit === undefined ? undefined : intValue(req.body.concurrencyLimit, -1),
    });
    store.recordAdminAction(adminUser(res).id, "调整权益额度", "entitlement", req.params.id, JSON.stringify(req.body || {}));
    res.json({ success: true, entitlement });
  }));
  router.post("/admin/deployments/:id/resolve", requireAdmin, route((req, res) => {
    const resolution = req.body?.resolution;
    if (resolution !== "succeeded" && resolution !== "failed") throw new Error("处理结果无效");
    store.resolveUncertain(req.params.id, resolution);
    store.recordAdminAction(adminUser(res).id, "核对交付任务", "deployment", req.params.id, resolution);
    res.json({ success: true });
  }));
  router.put("/admin/settings", requireAdmin, route((req, res) => {
    const nextContact = req.body?.contact === undefined ? null : contactSettingsInput(req.body.contact, contactSettings(store, true));
    const nextRecommendations = req.body?.recommendations === undefined ? null : resourceRecommendationSettingsInput(req.body.recommendations);
    if (typeof req.body?.registrationEnabled === "boolean") store.setSetting("registration_enabled", String(req.body.registrationEnabled));
    if (typeof req.body?.panelDeployEnabled === "boolean") store.setSetting("panel_deploy_enabled", String(req.body.panelDeployEnabled));
    if (typeof req.body?.nodeDeployEnabled === "boolean") store.setSetting("node_deploy_enabled", String(req.body.nodeDeployEnabled));
    if (typeof req.body?.paymentInstructions === "string") store.setSetting("payment_instructions", req.body.paymentInstructions.slice(0, 2000));
    if (req.body?.paymentMethods !== undefined) store.setPaymentMethods(req.body.paymentMethods);
    if (req.body?.email !== undefined) store.setEmailSettings(req.body.email);
    if (req.body?.orderExpiryMinutes !== undefined) {
      const minutes = intValue(req.body.orderExpiryMinutes);
      if (minutes < 5 || minutes > 1440) throw new Error("订单有效期必须为 5 到 1440 分钟");
      store.setSetting("order_expiry_minutes", String(minutes));
    }
    if (req.body?.redeemCodePurchaseUrl !== undefined) {
      store.setSetting("redeem_code_purchase_url", optionalHttpUrl(req.body.redeemCodePurchaseUrl, "卡密购买链接"));
    }
    if (nextContact) {
      store.setSetting("contact_enabled", String(nextContact.enabled));
      store.setSetting("contact_button_label", nextContact.buttonLabel);
      store.setSetting("contact_title", nextContact.title);
      store.setSetting("contact_description", nextContact.description);
      store.setSetting("contact_methods", JSON.stringify(nextContact.methods));
    }
    if (nextRecommendations) store.setSetting("resource_recommendations", JSON.stringify(nextRecommendations));
    let adminPath: string | undefined;
    if (req.body?.adminPath !== undefined) adminPath = store.setAdminPath(String(req.body.adminPath));
    store.recordAdminAction(adminUser(res).id, "更新系统设置", "settings", "commercial", JSON.stringify({
      registrationEnabled: req.body?.registrationEnabled,
      panelDeployEnabled: req.body?.panelDeployEnabled,
      nodeDeployEnabled: req.body?.nodeDeployEnabled,
      redeemCodePurchaseUrl: req.body?.redeemCodePurchaseUrl === undefined ? undefined : "[updated]",
      contact: nextContact ? { enabled: nextContact.enabled, count: nextContact.methods.length } : undefined,
      recommendations: nextRecommendations ? { count: nextRecommendations.items.length } : undefined,
      adminPath,
    }));
    res.json({ success: true, adminPath: adminPath || store.getAdminPath() });
  }));

  router.post("/admin/contact-qr", requireAdmin, route((req, res) => {
    const dataUrl = String(req.body?.dataUrl || "");
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) throw new Error("二维码图片数据格式不正确");
    if (match[2].length % 4 !== 0) throw new Error("二维码图片数据格式不正确");
    const data = Buffer.from(match[2], "base64");
    if (data.toString("base64") !== match[2]) throw new Error("二维码图片数据格式不正确");
    validContactQr(match[1], data);
    store.setSetting("contact_qr_mime", match[1]);
    store.setSetting("contact_qr_data", data.toString("base64"));
    store.recordAdminAction(adminUser(res).id, "上传联系二维码", "settings", "contact_qr", `${match[1]} / ${data.length} bytes`);
    res.json({ success: true, qrCodeUploaded: true });
  }));

  router.delete("/admin/contact-qr", requireAdmin, route((_req, res) => {
    store.setSetting("contact_qr_mime", "");
    store.setSetting("contact_qr_data", "");
    store.recordAdminAction(adminUser(res).id, "删除联系二维码", "settings", "contact_qr");
    res.json({ success: true, qrCodeUploaded: false });
  }));

  router.get("/admin/contact-methods/:id/qr", requireAdmin, route((req, res) => {
    const id = String(req.params.id || "");
    if (!contactMethods(store).some(method => method.id === id)) return res.status(404).json({ success: false, error: "联系方式不存在" });
    sendContactQr(store, id, res);
  }));

  router.post("/admin/contact-methods/:id/qr", requireAdmin, route((req, res) => {
    const id = String(req.params.id || "");
    if (!contactMethods(store).some(method => method.id === id)) throw new Error("请先保存该联系方式，再上传二维码");
    const dataUrl = String(req.body?.dataUrl || "");
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || match[2].length % 4 !== 0) throw new Error("二维码图片数据格式不正确");
    const data = Buffer.from(match[2], "base64");
    if (data.toString("base64") !== match[2]) throw new Error("二维码图片数据格式不正确");
    validContactQr(match[1], data);
    store.setSetting(contactQrSettingKey(id, "mime"), match[1]);
    store.setSetting(contactQrSettingKey(id, "data"), data.toString("base64"));
    store.recordAdminAction(adminUser(res).id, "上传联系方式二维码", "settings", id, `${match[1]} / ${data.length} bytes`);
    res.json({ success: true, qrCodeUploaded: true });
  }));

  router.delete("/admin/contact-methods/:id/qr", requireAdmin, route((req, res) => {
    const id = String(req.params.id || "");
    store.setSetting(contactQrSettingKey(id, "mime"), "");
    store.setSetting(contactQrSettingKey(id, "data"), "");
    if (id === "legacy-contact") {
      store.setSetting("contact_qr_mime", "");
      store.setSetting("contact_qr_data", "");
    }
    store.recordAdminAction(adminUser(res).id, "删除联系方式二维码", "settings", id);
    res.json({ success: true, qrCodeUploaded: false });
  }));

  router.get("/admin/resource-recommendations/:id/logo", requireAdmin, route((req, res) => {
    sendResourceLogo(store, String(req.params.id || ""), res);
  }));

  router.post("/admin/resource-recommendations/:id/logo", requireAdmin, route((req, res) => {
    const id = String(req.params.id || "");
    const configured = resourceRecommendationSettings(store).items.some(item => item.id === id);
    if (!configured) throw new Error("请先保存该推荐项，再上传 Logo");
    const dataUrl = String(req.body?.dataUrl || "");
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || match[2].length % 4 !== 0) throw new Error("推荐 Logo 图片数据格式不正确");
    const data = Buffer.from(match[2], "base64");
    if (data.toString("base64") !== match[2]) throw new Error("推荐 Logo 图片数据格式不正确");
    validResourceLogo(match[1], data);
    store.setSetting(resourceLogoSettingKey(id, "mime"), match[1]);
    store.setSetting(resourceLogoSettingKey(id, "data"), data.toString("base64"));
    store.recordAdminAction(adminUser(res).id, "上传资源推荐 Logo", "settings", id, `${match[1]} / ${data.length} bytes`);
    res.json({ success: true, logoUploaded: true });
  }));

  router.post("/admin/resource-recommendations/:id/logo/fetch", requireAdmin, route(async (req, res) => {
    const id = String(req.params.id || "");
    const item = resourceRecommendationSettings(store).items.find(entry => entry.id === id);
    if (!item) throw new Error("请先保存该推荐项，再自动获取 Logo");
    const websiteUrl = optionalHttpUrl(req.body?.websiteUrl || item.purchaseUrl, "跳转链接");
    if (!websiteUrl) throw new Error("请先填写跳转链接");
    const logo = await fetchResourceLogo(websiteUrl);
    store.setSetting(resourceLogoSettingKey(id, "mime"), logo.mimeType);
    store.setSetting(resourceLogoSettingKey(id, "data"), logo.data.toString("base64"));
    store.recordAdminAction(adminUser(res).id, "自动获取资源推荐 Logo", "settings", id, `${logo.mimeType} / ${logo.data.length} bytes / ${logo.sourceUrl}`);
    res.json({ success: true, logoUploaded: true, sourceUrl: logo.sourceUrl });
  }));

  router.delete("/admin/resource-recommendations/:id/logo", requireAdmin, route((req, res) => {
    const id = String(req.params.id || "");
    store.setSetting(resourceLogoSettingKey(id, "mime"), "");
    store.setSetting(resourceLogoSettingKey(id, "data"), "");
    store.recordAdminAction(adminUser(res).id, "删除资源推荐 Logo", "settings", id);
    res.json({ success: true, logoUploaded: false });
  }));

  router.post("/admin/settings/test-email", requireAdmin, route(async (req, res) => {
    const recipient = String(req.body?.recipient || "").trim();
    const settings = store.getEmailSettings();
    await sendConfiguredMail(store, recipient, "smtp_test", `${settings.siteName} 邮件服务测试`, "SMTP 配置测试成功。此邮件由管理后台主动发送。\n");
    res.json({ success: true });
  }));

  return router;
}
