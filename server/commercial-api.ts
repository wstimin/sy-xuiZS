import { NextFunction, Request, Response, Router } from "express";
import { CommercialStore, DurationUnit, EntitlementGrantInput, PlanInput, QuotaMode, SessionUser, UserRole } from "./commercial-store.js";

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

export function createCommercialRouter(store: CommercialStore) {
  const router = Router();

  router.get("/auth/bootstrap-status", (_req, res) => {
    res.json({ required: !store.hasUsers() });
  });

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
    const user = store.createUser(String(req.body?.username || ""), String(req.body?.password || ""), "user");
    const token = store.createSession(user.id);
    setSessionCookie(req, res, USER_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/auth/login", route((req, res) => {
    const user = store.authenticate(String(req.body?.username || ""), String(req.body?.password || ""));
    if (user.role !== "user") return res.status(403).json({ success: false, error: "管理员请从 /admin 登录管理端" });
    const token = store.createSession(user.id);
    setSessionCookie(req, res, USER_COOKIE_NAME, token);
    res.json({ success: true, user });
  }));

  router.post("/admin/auth/login", route((req, res) => {
    const user = store.authenticate(String(req.body?.username || ""), String(req.body?.password || ""));
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

  router.get("/plans", (_req, res) => res.json({ plans: store.listPlans() }));

  router.get("/account", requireCommercialUser, (_req, res) => {
    const user = commercialUser(res);
    res.json({
      user,
      entitlements: store.listEntitlements(user.id),
      orders: store.listOrders(user.id),
      deployments: store.listDeployments(user.id),
      paymentInstructions: store.getSetting("payment_instructions", "下单后请联系管理员完成支付确认。"),
    });
  });

  router.post("/orders", requireCommercialUser, route((req, res) => {
    const order = store.createOrder(commercialUser(res).id, String(req.body?.planId || ""));
    res.status(201).json({ success: true, order });
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
  router.get("/admin/settings", requireAdmin, (_req, res) => res.json({
    settings: {
      registrationEnabled: store.getSetting("registration_enabled", "true") === "true",
      panelDeployEnabled: store.getSetting("panel_deploy_enabled", "true") === "true",
      nodeDeployEnabled: store.getSetting("node_deploy_enabled", "true") === "true",
      paymentInstructions: store.getSetting("payment_instructions", "下单后请联系管理员完成支付确认。"),
    },
  }));

  router.post("/admin/plans", requireAdmin, route((req, res) => {
    res.status(201).json({ success: true, plan: store.createPlan(planInput(req.body || {})) });
  }));
  router.put("/admin/plans/:id", requireAdmin, route((req, res) => {
    const plan = store.updatePlan(req.params.id, planInput(req.body || {}));
    if (!plan) return res.status(404).json({ success: false, error: "套餐不存在" });
    res.json({ success: true, plan });
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
    res.json({ success: true });
  }));
  router.post("/admin/users/:id/reset-password", requireAdmin, route((req, res) => {
    if (adminUser(res).id === req.params.id) throw new Error("当前管理员请使用修改密码功能");
    store.resetPassword(req.params.id, String(req.body?.nextPassword || ""));
    res.json({ success: true });
  }));
  router.post("/admin/orders/:id/mark-paid", requireAdmin, route((req, res) => {
    const tradeNo = String(req.body?.tradeNo || `manual-${Date.now()}`);
    res.json({ success: true, order: store.markOrderPaid(req.params.id, "manual", tradeNo) });
  }));
  router.post("/admin/orders/:id/cancel", requireAdmin, route((req, res) => {
    res.json({ success: true, order: store.cancelOrder(req.params.id) });
  }));
  router.post("/admin/orders/:id/refund", requireAdmin, route((req, res) => {
    res.json({ success: true, order: store.refundOrder(req.params.id) });
  }));
  router.post("/admin/entitlements", requireAdmin, route((req, res) => {
    const userId = String(req.body?.userId || "");
    if (!store.getUserById(userId)) throw new Error("用户不存在");
    const id = store.grantEntitlement(userId, grantInput(req.body || {}));
    res.status(201).json({ success: true, id });
  }));
  router.patch("/admin/entitlements/:id", requireAdmin, route((req, res) => {
    const status = req.body?.status;
    if (status !== "active" && status !== "revoked") throw new Error("权益状态无效");
    store.updateEntitlementStatus(req.params.id, status);
    res.json({ success: true });
  }));
  router.patch("/admin/entitlements/:id/quota", requireAdmin, route((req, res) => {
    res.json({ success: true, entitlement: store.adjustEntitlement(req.params.id, {
      panelRemaining: req.body?.panelRemaining === undefined ? undefined : intValue(req.body.panelRemaining, -1),
      nodeRemaining: req.body?.nodeRemaining === undefined ? undefined : intValue(req.body.nodeRemaining, -1),
      dailyPanelLimit: req.body?.dailyPanelLimit === undefined ? undefined : intValue(req.body.dailyPanelLimit, -1),
      dailyNodeLimit: req.body?.dailyNodeLimit === undefined ? undefined : intValue(req.body.dailyNodeLimit, -1),
      concurrencyLimit: req.body?.concurrencyLimit === undefined ? undefined : intValue(req.body.concurrencyLimit, -1),
    }) });
  }));
  router.post("/admin/deployments/:id/resolve", requireAdmin, route((req, res) => {
    const resolution = req.body?.resolution;
    if (resolution !== "succeeded" && resolution !== "failed") throw new Error("处理结果无效");
    store.resolveUncertain(req.params.id, resolution);
    res.json({ success: true });
  }));
  router.put("/admin/settings", requireAdmin, route((req, res) => {
    if (typeof req.body?.registrationEnabled === "boolean") store.setSetting("registration_enabled", String(req.body.registrationEnabled));
    if (typeof req.body?.panelDeployEnabled === "boolean") store.setSetting("panel_deploy_enabled", String(req.body.panelDeployEnabled));
    if (typeof req.body?.nodeDeployEnabled === "boolean") store.setSetting("node_deploy_enabled", String(req.body.nodeDeployEnabled));
    if (typeof req.body?.paymentInstructions === "string") store.setSetting("payment_instructions", req.body.paymentInstructions.slice(0, 2000));
    res.json({ success: true });
  }));

  return router;
}
