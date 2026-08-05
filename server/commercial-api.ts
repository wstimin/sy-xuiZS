import { NextFunction, Request, Response, Router } from "express";
import { CommercialStore, DurationUnit, EntitlementGrantInput, PlanInput, QuotaMode, SessionUser, UserRole } from "./commercial-store.js";
import { sendSmtpMail } from "./email-service.js";
import { getPaymentDriver, PaymentChannelConfig, PaymentProvider } from "./payment-service.js";

const USER_COOKIE_NAME = "xui_user_session";
const ADMIN_COOKIE_NAME = "xui_admin_session";

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
    const result = await driver.createCheckout(config, {
      orderNo: order.orderNo,
      amountCents: order.amountCents,
      name: String(snapshot.name || "网络搭建服务"),
      userKey: user?.email || user?.username || order.userId,
      notifyUrl: `${baseUrl}/api/payment/${provider}/${encodeURIComponent(method.id)}/notify`,
      returnUrl: `${baseUrl}/console?payment=return&order=${encodeURIComponent(order.id)}`,
    });
    store.closeOpenPaymentAttempts(order.id);
    const attempt = store.createPaymentAttempt(order.id, method.id, result.checkoutUrl, result.requestPayload, order.expiresAt);
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
  router.get("/payment-methods", (_req, res) => res.json({ paymentMethods: store.getPaymentMethods() }));

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
    const body = provider === "wechat_official" ? rawBody || JSON.stringify(req.body || {}) : req.body;
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
    });
  });

  router.post("/orders", requireCommercialUser, route(async (req, res) => {
    const order = store.createOrder(
      commercialUser(res).id,
      String(req.body?.planId || ""),
      String(req.body?.paymentProvider || "manual"),
    );
    const payment = await createCheckout(req, store, order);
    res.status(201).json({ success: true, order, payment });
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
    const order = store.refundOrder(req.params.id);
    store.recordAdminAction(adminUser(res).id, "订单退款撤权", "order", req.params.id, order.orderNo);
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
    let adminPath: string | undefined;
    if (req.body?.adminPath !== undefined) adminPath = store.setAdminPath(String(req.body.adminPath));
    store.recordAdminAction(adminUser(res).id, "更新系统设置", "settings", "commercial", JSON.stringify({
      registrationEnabled: req.body?.registrationEnabled,
      panelDeployEnabled: req.body?.panelDeployEnabled,
      nodeDeployEnabled: req.body?.nodeDeployEnabled,
      adminPath,
    }));
    res.json({ success: true, adminPath: adminPath || store.getAdminPath() });
  }));

  router.post("/admin/settings/test-email", requireAdmin, route(async (req, res) => {
    const recipient = String(req.body?.recipient || "").trim();
    const settings = store.getEmailSettings();
    await sendConfiguredMail(store, recipient, "smtp_test", `${settings.siteName} 邮件服务测试`, "SMTP 配置测试成功。此邮件由管理后台主动发送。\n");
    res.json({ success: true });
  }));

  return router;
}
