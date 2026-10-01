import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

export type ApiRateLimitCategory = "payment" | "auth" | "deployment" | "admin-read" | "general";

export function isPaymentNotificationPath(pathname: string) {
  return /^\/payment\/(epay|mgate|tokenpay|epusdt|paypal|alipay_official|wechat_official)\/[^/]+\/notify\/?$/.test(pathname);
}

export function apiRateLimitCategory(pathname: string, method = "GET"): ApiRateLimitCategory {
  if (isPaymentNotificationPath(pathname)) return "payment";
  if (/^\/(?:admin\/)?auth\/(?:login|bootstrap|register|send-code|reset-password|change-password)\/?$/.test(pathname)) return "auth";
  if (/^\/(?:test-ssh|deploy-panel|deploy-node)\/?$/.test(pathname)) return "deployment";
  if ((method === "GET" || method === "HEAD") && /^\/admin\//.test(pathname)) return "admin-read";
  return "general";
}

export function configureTrustedProxy(app: Express) {
  // Production traffic is proxied by OpenResty/Nginx on the same server. Trust
  // forwarding headers only when the direct peer is loopback; direct internet
  // clients cannot spoof X-Forwarded-For to obtain a fresh rate-limit bucket.
  app.set("trust proxy", "loopback");
}

export function createApiRateLimiters(): RequestHandler[] {
  const settings: Array<{ category: ApiRateLimitCategory; windowMs: number; limit: number; error: string }> = [
    { category: "payment", windowMs: 60_000, limit: 300, error: "支付通知请求过于频繁" },
    { category: "auth", windowMs: 15 * 60_000, limit: 30, error: "登录或验证请求过于频繁，请稍后再试" },
    { category: "deployment", windowMs: 60_000, limit: 12, error: "部署请求过于频繁，请稍后再试" },
    { category: "admin-read", windowMs: 60_000, limit: 300, error: "管理数据读取过于频繁，请稍后再试" },
    { category: "general", windowMs: 60_000, limit: 60, error: "请求过于频繁，请稍后再试" },
  ];
  return settings.map(({ category, windowMs, limit, error }) => rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => apiRateLimitCategory(req.path, req.method) !== category,
    message: { success: false, error },
  }));
}
