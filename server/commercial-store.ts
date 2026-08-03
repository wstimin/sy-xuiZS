import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

export type UserRole = "user" | "admin";
export type Capability = "panel" | "node";
export type QuotaMode = "none" | "limited" | "unlimited";
export type DurationUnit = "days" | "months" | "years" | "lifetime";

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  status: "active" | "disabled";
}

export interface PlanInput {
  name: string;
  description?: string;
  priceCents: number;
  durationUnit: DurationUnit;
  durationValue: number;
  panelMode: QuotaMode;
  panelLimit: number;
  nodeMode: QuotaMode;
  nodeLimit: number;
  dailyPanelLimit: number;
  dailyNodeLimit: number;
  concurrencyLimit: number;
  enabled: boolean;
  sortOrder: number;
}

export interface ReservationResult {
  deploymentId: string;
  requestId: string;
  capability: Capability;
  entitlementId: string;
  quotaMode: Exclude<QuotaMode, "none">;
}

export interface EntitlementGrantInput {
  name: string;
  durationUnit: DurationUnit;
  durationValue: number;
  panelMode: QuotaMode;
  panelLimit: number;
  nodeMode: QuotaMode;
  nodeLimit: number;
  dailyPanelLimit?: number;
  dailyNodeLimit?: number;
  concurrencyLimit?: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

function nowIso() {
  return new Date().toISOString();
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, hashValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = scryptSync(password, Buffer.from(saltValue, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function addDuration(start: Date, unit: DurationUnit, value: number): string | null {
  if (unit === "lifetime") return null;
  const result = new Date(start);
  if (unit === "days") result.setUTCDate(result.getUTCDate() + value);
  if (unit === "months") result.setUTCMonth(result.getUTCMonth() + value);
  if (unit === "years") result.setUTCFullYear(result.getUTCFullYear() + value);
  return result.toISOString();
}

function publicPlan(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    priceCents: row.price_cents,
    durationUnit: row.duration_unit,
    durationValue: row.duration_value,
    panelMode: row.panel_mode,
    panelLimit: row.panel_limit,
    nodeMode: row.node_mode,
    nodeLimit: row.node_limit,
    dailyPanelLimit: row.daily_panel_limit,
    dailyNodeLimit: row.daily_node_limit,
    concurrencyLimit: row.concurrency_limit,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CommercialStore {
  readonly db: Database.Database;

  constructor(databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db")) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
    this.recoverInterruptedDeployments();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        duration_unit TEXT NOT NULL CHECK (duration_unit IN ('days', 'months', 'years', 'lifetime')),
        duration_value INTEGER NOT NULL DEFAULT 1 CHECK (duration_value >= 0),
        panel_mode TEXT NOT NULL CHECK (panel_mode IN ('none', 'limited', 'unlimited')),
        panel_limit INTEGER NOT NULL DEFAULT 0 CHECK (panel_limit >= 0),
        node_mode TEXT NOT NULL CHECK (node_mode IN ('none', 'limited', 'unlimited')),
        node_limit INTEGER NOT NULL DEFAULT 0 CHECK (node_limit >= 0),
        daily_panel_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_panel_limit >= 0),
        daily_node_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_node_limit >= 0),
        concurrency_limit INTEGER NOT NULL DEFAULT 1 CHECK (concurrency_limit >= 1),
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_no TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id),
        plan_id TEXT REFERENCES plans(id),
        status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
        amount_cents INTEGER NOT NULL,
        plan_snapshot TEXT NOT NULL,
        payment_provider TEXT NOT NULL DEFAULT 'manual',
        payment_trade_no TEXT UNIQUE,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS payment_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        event_key TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL REFERENCES orders(id),
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entitlements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        source_order_id TEXT REFERENCES orders(id),
        plan_name TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        expires_at TEXT,
        lifetime INTEGER NOT NULL DEFAULT 0,
        panel_mode TEXT NOT NULL,
        panel_total INTEGER NOT NULL DEFAULT 0,
        panel_remaining INTEGER NOT NULL DEFAULT 0,
        panel_reserved INTEGER NOT NULL DEFAULT 0,
        panel_used INTEGER NOT NULL DEFAULT 0,
        node_mode TEXT NOT NULL,
        node_total INTEGER NOT NULL DEFAULT 0,
        node_remaining INTEGER NOT NULL DEFAULT 0,
        node_reserved INTEGER NOT NULL DEFAULT 0,
        node_used INTEGER NOT NULL DEFAULT 0,
        daily_panel_limit INTEGER NOT NULL DEFAULT 0,
        daily_node_limit INTEGER NOT NULL DEFAULT 0,
        concurrency_limit INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id, status, expires_at);

      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        entitlement_id TEXT NOT NULL REFERENCES entitlements(id),
        capability TEXT NOT NULL CHECK (capability IN ('panel', 'node')),
        status TEXT NOT NULL CHECK (status IN ('reserved', 'running', 'succeeded', 'failed', 'uncertain')),
        quota_mode TEXT NOT NULL CHECK (quota_mode IN ('limited', 'unlimited')),
        target_host_masked TEXT NOT NULL DEFAULT '',
        result_summary TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        UNIQUE(user_id, capability, request_id)
      );
      CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS usage_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        entitlement_id TEXT NOT NULL REFERENCES entitlements(id),
        deployment_id TEXT REFERENCES deployments(id),
        capability TEXT NOT NULL CHECK (capability IN ('panel', 'node')),
        action TEXT NOT NULL CHECK (action IN ('grant', 'reserve', 'consume', 'release', 'adjust')),
        amount INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const settings = this.db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)");
    settings.run("registration_enabled", "true", nowIso());
    settings.run("panel_deploy_enabled", "true", nowIso());
    settings.run("node_deploy_enabled", "true", nowIso());

    const count = Number((this.db.prepare("SELECT COUNT(*) AS count FROM plans").get() as any).count);
    if (count === 0) this.seedPlans();
  }

  private seedPlans() {
    const samples: PlanInput[] = [
      {
        name: "单次搭建",
        description: "适合临时搭建，包含 1 次面板安装和 3 次节点创建。",
        priceCents: 990,
        durationUnit: "days",
        durationValue: 7,
        panelMode: "limited",
        panelLimit: 1,
        nodeMode: "limited",
        nodeLimit: 3,
        dailyPanelLimit: 1,
        dailyNodeLimit: 3,
        concurrencyLimit: 1,
        enabled: true,
        sortOrder: 10,
      },
      {
        name: "月度会员",
        description: "30 天有效，面板与节点次数可由管理员随时调整。",
        priceCents: 2900,
        durationUnit: "months",
        durationValue: 1,
        panelMode: "limited",
        panelLimit: 5,
        nodeMode: "limited",
        nodeLimit: 30,
        dailyPanelLimit: 3,
        dailyNodeLimit: 15,
        concurrencyLimit: 1,
        enabled: true,
        sortOrder: 20,
      },
      {
        name: "年度会员",
        description: "一年有效，适合长期使用。",
        priceCents: 9900,
        durationUnit: "years",
        durationValue: 1,
        panelMode: "limited",
        panelLimit: 30,
        nodeMode: "limited",
        nodeLimit: 200,
        dailyPanelLimit: 5,
        dailyNodeLimit: 30,
        concurrencyLimit: 1,
        enabled: true,
        sortOrder: 30,
      },
      {
        name: "永久使用权",
        description: "永久有效，具体面板和节点额度由管理员配置。",
        priceCents: 29900,
        durationUnit: "lifetime",
        durationValue: 0,
        panelMode: "limited",
        panelLimit: 100,
        nodeMode: "limited",
        nodeLimit: 1000,
        dailyPanelLimit: 5,
        dailyNodeLimit: 30,
        concurrencyLimit: 1,
        enabled: true,
        sortOrder: 40,
      },
    ];
    for (const plan of samples) this.createPlan(plan);
  }

  hasUsers() {
    return Number((this.db.prepare("SELECT COUNT(*) AS count FROM users").get() as any).count) > 0;
  }

  getSetting(key: string, fallback = "") {
    return (this.db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key) as any)?.value ?? fallback;
  }

  setSetting(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, nowIso());
  }

  createUser(username: string, password: string, role: UserRole = "user") {
    const normalized = username.trim();
    if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(normalized)) throw new Error("用户名必须为 3 到 64 位字母、数字或 ._@-");
    if (password.length < 8 || password.length > 128) throw new Error("密码必须为 8 到 128 位");
    const id = randomUUID();
    const timestamp = nowIso();
    try {
      this.db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, normalized, hashPassword(password), role, timestamp, timestamp);
    } catch (error: any) {
      if (/UNIQUE/i.test(String(error?.message))) throw new Error("用户名已经存在");
      throw error;
    }
    return this.getUserById(id)!;
  }

  authenticate(username: string, password: string) {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username.trim()) as any;
    if (!row || !verifyPassword(password, row.password_hash)) throw new Error("用户名或密码错误");
    if (row.status !== "active") throw new Error("账号已被禁用");
    this.db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), row.id);
    return this.getUserById(row.id)!;
  }

  createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS).toISOString(), nowIso());
    return token;
  }

  deleteSession(token: string) {
    if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  getSessionUser(token: string): SessionUser | null {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT u.id, u.username, u.role, u.status
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(hashToken(token), nowIso()) as any;
    return row || null;
  }

  getUserById(id: string): SessionUser | null {
    return (this.db.prepare("SELECT id, username, role, status FROM users WHERE id = ?").get(id) as SessionUser | undefined) || null;
  }

  listUsers() {
    return this.db.prepare(`
      SELECT id, username, role, status, created_at AS createdAt, last_login_at AS lastLoginAt
      FROM users ORDER BY created_at DESC
    `).all();
  }

  updateUserStatus(id: string, status: "active" | "disabled") {
    this.db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
    if (status === "disabled") this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }

  updateUserRole(id: string, role: UserRole) {
    this.db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, nowIso(), id);
  }

  changePassword(userId: string, currentPassword: string, nextPassword: string) {
    const row = this.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as any;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) throw new Error("当前密码错误");
    if (nextPassword.length < 8 || nextPassword.length > 128) throw new Error("新密码必须为 8 到 128 位");
    this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(nextPassword), nowIso(), userId);
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  listPlans(includeDisabled = false) {
    const rows = this.db.prepare(`SELECT * FROM plans ${includeDisabled ? "" : "WHERE enabled = 1"} ORDER BY sort_order, created_at`).all();
    return rows.map(publicPlan);
  }

  getPlan(id: string, includeDisabled = false) {
    const row = this.db.prepare(`SELECT * FROM plans WHERE id = ? ${includeDisabled ? "" : "AND enabled = 1"}`).get(id) as any;
    return row ? publicPlan(row) : null;
  }

  createPlan(input: PlanInput) {
    this.validatePlan(input);
    const id = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO plans (
        id, name, description, price_cents, duration_unit, duration_value,
        panel_mode, panel_limit, node_mode, node_limit, daily_panel_limit,
        daily_node_limit, concurrency_limit, enabled, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name.trim(), input.description?.trim() || "", input.priceCents, input.durationUnit,
      input.durationValue, input.panelMode, input.panelLimit, input.nodeMode, input.nodeLimit,
      input.dailyPanelLimit, input.dailyNodeLimit, input.concurrencyLimit, input.enabled ? 1 : 0,
      input.sortOrder, timestamp, timestamp,
    );
    return this.getPlan(id, true)!;
  }

  updatePlan(id: string, input: PlanInput) {
    this.validatePlan(input);
    this.db.prepare(`
      UPDATE plans SET name = ?, description = ?, price_cents = ?, duration_unit = ?, duration_value = ?,
        panel_mode = ?, panel_limit = ?, node_mode = ?, node_limit = ?, daily_panel_limit = ?,
        daily_node_limit = ?, concurrency_limit = ?, enabled = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name.trim(), input.description?.trim() || "", input.priceCents, input.durationUnit,
      input.durationValue, input.panelMode, input.panelLimit, input.nodeMode, input.nodeLimit,
      input.dailyPanelLimit, input.dailyNodeLimit, input.concurrencyLimit, input.enabled ? 1 : 0,
      input.sortOrder, nowIso(), id,
    );
    return this.getPlan(id, true);
  }

  private validatePlan(input: PlanInput) {
    if (!input.name?.trim()) throw new Error("套餐名称不能为空");
    if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new Error("套餐价格必须使用非负整数分");
    if (!Number.isInteger(input.durationValue) || input.durationValue < 0) throw new Error("有效期数值无效");
    for (const [label, value] of [
      ["面板次数", input.panelLimit], ["节点次数", input.nodeLimit], ["面板每日上限", input.dailyPanelLimit],
      ["节点每日上限", input.dailyNodeLimit], ["并发上限", input.concurrencyLimit],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`${label}必须为非负整数`);
    }
    if (input.concurrencyLimit < 1) throw new Error("并发上限至少为 1");
    if (input.panelMode === "limited" && input.panelLimit < 1) throw new Error("限制面板次数时必须至少为 1 次");
    if (input.nodeMode === "limited" && input.nodeLimit < 1) throw new Error("限制节点次数时必须至少为 1 次");
  }

  createOrder(userId: string, planId: string) {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error("套餐不存在或已经下架");
    const id = randomUUID();
    const timestamp = nowIso();
    const orderNo = `XUI${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`;
    this.db.prepare(`
      INSERT INTO orders (id, order_no, user_id, plan_id, status, amount_cents, plan_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(id, orderNo, userId, planId, plan.priceCents, JSON.stringify(plan), timestamp, timestamp);
    return this.getOrder(id)!;
  }

  getOrder(id: string) {
    return this.db.prepare(`
      SELECT id, order_no AS orderNo, user_id AS userId, plan_id AS planId, status,
        amount_cents AS amountCents, plan_snapshot AS planSnapshot, payment_provider AS paymentProvider,
        payment_trade_no AS paymentTradeNo, created_at AS createdAt, paid_at AS paidAt
      FROM orders WHERE id = ?
    `).get(id) as any;
  }

  listOrders(userId?: string) {
    return this.db.prepare(`
      SELECT o.id, o.order_no AS orderNo, o.user_id AS userId, u.username, o.status,
        o.amount_cents AS amountCents, o.plan_snapshot AS planSnapshot, o.payment_provider AS paymentProvider,
        o.payment_trade_no AS paymentTradeNo, o.created_at AS createdAt, o.paid_at AS paidAt
      FROM orders o JOIN users u ON u.id = o.user_id
      ${userId ? "WHERE o.user_id = ?" : ""}
      ORDER BY o.created_at DESC
    `).all(...(userId ? [userId] : []));
  }

  markOrderPaid(orderId: string, provider = "manual", tradeNo = `manual-${randomUUID()}`) {
    return this.db.transaction(() => {
      const order = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
      if (!order) throw new Error("订单不存在");
      if (order.status === "paid") return this.getOrder(orderId);
      if (order.status !== "pending") throw new Error("只有待支付订单可以确认收款");
      const eventKey = `${provider}:${tradeNo}`;
      this.db.prepare("INSERT INTO payment_events (id, provider, event_key, order_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), provider, eventKey, orderId, "{}", nowIso());
      this.db.prepare("UPDATE orders SET status = 'paid', payment_provider = ?, payment_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?")
        .run(provider, tradeNo, nowIso(), nowIso(), orderId);
      this.grantOrderEntitlement(order);
      return this.getOrder(orderId);
    })();
  }

  private grantOrderEntitlement(order: any) {
    const plan = JSON.parse(order.plan_snapshot);
    const startedAt = new Date();
    const expiresAt = addDuration(startedAt, plan.durationUnit, plan.durationValue);
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO entitlements (
        id, user_id, source_order_id, plan_name, starts_at, expires_at, lifetime,
        panel_mode, panel_total, panel_remaining, node_mode, node_total, node_remaining,
        daily_panel_limit, daily_node_limit, concurrency_limit, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, order.user_id, order.id, plan.name, startedAt.toISOString(), expiresAt,
      plan.durationUnit === "lifetime" ? 1 : 0,
      plan.panelMode, plan.panelMode === "limited" ? plan.panelLimit : 0, plan.panelMode === "limited" ? plan.panelLimit : 0,
      plan.nodeMode, plan.nodeMode === "limited" ? plan.nodeLimit : 0, plan.nodeMode === "limited" ? plan.nodeLimit : 0,
      plan.dailyPanelLimit, plan.dailyNodeLimit, plan.concurrencyLimit, nowIso(),
    );
    for (const capability of ["panel", "node"] as Capability[]) {
      const mode = plan[`${capability}Mode`];
      const amount = mode === "limited" ? plan[`${capability}Limit`] : 0;
      if (mode !== "none") this.addLedger(order.user_id, id, null, capability, "grant", amount, `订单 ${order.order_no} 发放`);
    }
  }

  grantEntitlement(userId: string, input: EntitlementGrantInput) {
    if (!input.name?.trim()) throw new Error("权益名称不能为空");
    if (!Number.isInteger(input.durationValue) || input.durationValue < 0) throw new Error("权益有效期无效");
    if (input.panelMode === "limited" && (!Number.isInteger(input.panelLimit) || input.panelLimit < 1)) throw new Error("面板次数至少为 1");
    if (input.nodeMode === "limited" && (!Number.isInteger(input.nodeLimit) || input.nodeLimit < 1)) throw new Error("节点次数至少为 1");
    const starts = new Date();
    const id = randomUUID();
    const expiresAt = addDuration(starts, input.durationUnit, input.durationValue);
    this.db.prepare(`
      INSERT INTO entitlements (
        id, user_id, plan_name, starts_at, expires_at, lifetime,
        panel_mode, panel_total, panel_remaining, node_mode, node_total, node_remaining,
        daily_panel_limit, daily_node_limit, concurrency_limit, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, input.name, starts.toISOString(), expiresAt, input.durationUnit === "lifetime" ? 1 : 0,
      input.panelMode, input.panelMode === "limited" ? input.panelLimit : 0, input.panelMode === "limited" ? input.panelLimit : 0,
      input.nodeMode, input.nodeMode === "limited" ? input.nodeLimit : 0, input.nodeMode === "limited" ? input.nodeLimit : 0,
      input.dailyPanelLimit || 0, input.dailyNodeLimit || 0, input.concurrencyLimit || 1, nowIso(),
    );
    return id;
  }

  listEntitlements(userId: string) {
    return this.db.prepare(`
      SELECT id, plan_name AS planName, starts_at AS startsAt, expires_at AS expiresAt, lifetime,
        panel_mode AS panelMode, panel_total AS panelTotal, panel_remaining AS panelRemaining,
        panel_reserved AS panelReserved, panel_used AS panelUsed,
        node_mode AS nodeMode, node_total AS nodeTotal, node_remaining AS nodeRemaining,
        node_reserved AS nodeReserved, node_used AS nodeUsed,
        daily_panel_limit AS dailyPanelLimit, daily_node_limit AS dailyNodeLimit,
        concurrency_limit AS concurrencyLimit, status, created_at AS createdAt
      FROM entitlements WHERE user_id = ? ORDER BY
        CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at
    `).all(userId).map((row: any) => ({ ...row, lifetime: Boolean(row.lifetime) }));
  }

  listAllEntitlements() {
    return this.db.prepare(`
      SELECT e.id, e.user_id AS userId, u.username, e.plan_name AS planName,
        e.starts_at AS startsAt, e.expires_at AS expiresAt, e.lifetime,
        e.panel_mode AS panelMode, e.panel_total AS panelTotal, e.panel_remaining AS panelRemaining,
        e.panel_reserved AS panelReserved, e.panel_used AS panelUsed,
        e.node_mode AS nodeMode, e.node_total AS nodeTotal, e.node_remaining AS nodeRemaining,
        e.node_reserved AS nodeReserved, e.node_used AS nodeUsed,
        e.daily_panel_limit AS dailyPanelLimit, e.daily_node_limit AS dailyNodeLimit,
        e.concurrency_limit AS concurrencyLimit, e.status, e.created_at AS createdAt
      FROM entitlements e JOIN users u ON u.id = e.user_id
      ORDER BY e.created_at DESC LIMIT 500
    `).all().map((row: any) => ({ ...row, lifetime: Boolean(row.lifetime) }));
  }

  updateEntitlementStatus(id: string, status: "active" | "revoked") {
    this.db.prepare("UPDATE entitlements SET status = ? WHERE id = ?").run(status, id);
  }

  hasCapability(userId: string, capability: Capability) {
    return Boolean(this.findEntitlement(userId, capability));
  }

  reserveDeployment(userId: string, capability: Capability, requestId: string, targetHostMasked = ""): ReservationResult {
    if (!requestId || requestId.length > 128) throw new Error("缺少有效的搭建请求编号");
    return this.db.transaction(() => {
      const duplicate = this.db.prepare("SELECT * FROM deployments WHERE user_id = ? AND capability = ? AND request_id = ?")
        .get(userId, capability, requestId) as any;
      if (duplicate) throw Object.assign(new Error("该搭建请求已经提交，请勿重复执行"), { code: "DUPLICATE_DEPLOYMENT", deploymentId: duplicate.id });

      const entitlement = this.findEntitlement(userId, capability);
      if (!entitlement) throw Object.assign(new Error(capability === "panel" ? "没有可用的面板安装权益" : "没有可用的节点创建权益"), { code: "PAYMENT_REQUIRED" });
      const activeCount = Number((this.db.prepare(`
        SELECT COUNT(*) AS count FROM deployments WHERE user_id = ? AND status IN ('reserved', 'running')
      `).get(userId) as any).count);
      if (activeCount >= entitlement.concurrency_limit) throw new Error(`当前套餐最多同时执行 ${entitlement.concurrency_limit} 个搭建任务`);

      const dailyLimit = capability === "panel" ? entitlement.daily_panel_limit : entitlement.daily_node_limit;
      if (dailyLimit > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dailyCount = Number((this.db.prepare(`
          SELECT COUNT(*) AS count FROM deployments
          WHERE user_id = ? AND capability = ? AND created_at >= ? AND status IN ('reserved', 'running', 'succeeded', 'uncertain')
        `).get(userId, capability, today.toISOString()) as any).count);
        if (dailyCount >= dailyLimit) throw new Error(`今日${capability === "panel" ? "面板安装" : "节点创建"}次数已达到套餐上限 ${dailyLimit}`);
      }

      const deploymentId = randomUUID();
      const mode = entitlement[`${capability}_mode`] as Exclude<QuotaMode, "none">;
      if (mode === "limited") {
        const updated = this.db.prepare(`
          UPDATE entitlements SET ${capability}_remaining = ${capability}_remaining - 1,
            ${capability}_reserved = ${capability}_reserved + 1
          WHERE id = ? AND ${capability}_remaining > 0
        `).run(entitlement.id);
        if (updated.changes !== 1) throw new Error("可用次数刚刚发生变化，请刷新权益后重试");
      }
      this.db.prepare(`
        INSERT INTO deployments (id, request_id, user_id, entitlement_id, capability, status, quota_mode, target_host_masked, created_at)
        VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?)
      `).run(deploymentId, requestId, userId, entitlement.id, capability, mode, targetHostMasked, nowIso());
      this.addLedger(userId, entitlement.id, deploymentId, capability, "reserve", mode === "limited" ? -1 : 0, "开始搭建时冻结权益");
      return { deploymentId, requestId, capability, entitlementId: entitlement.id, quotaMode: mode };
    })();
  }

  markDeploymentRunning(deploymentId: string) {
    this.db.prepare("UPDATE deployments SET status = 'running', started_at = ? WHERE id = ? AND status = 'reserved'")
      .run(nowIso(), deploymentId);
  }

  succeedDeployment(deploymentId: string, summary = "") {
    this.db.transaction(() => {
      const deployment = this.db.prepare("SELECT * FROM deployments WHERE id = ?").get(deploymentId) as any;
      if (!deployment || deployment.status === "succeeded") return;
      if (!["reserved", "running", "uncertain"].includes(deployment.status)) return;
      if (deployment.quota_mode === "limited") {
        this.db.prepare(`
          UPDATE entitlements SET ${deployment.capability}_reserved = MAX(0, ${deployment.capability}_reserved - 1),
            ${deployment.capability}_used = ${deployment.capability}_used + 1 WHERE id = ?
        `).run(deployment.entitlement_id);
      }
      this.db.prepare("UPDATE deployments SET status = 'succeeded', result_summary = ?, finished_at = ? WHERE id = ?")
        .run(summary.slice(0, 500), nowIso(), deploymentId);
      this.addLedger(deployment.user_id, deployment.entitlement_id, deploymentId, deployment.capability, "consume", deployment.quota_mode === "limited" ? 1 : 0, "搭建成功核销权益");
    })();
  }

  failDeployment(deploymentId: string, message = "") {
    this.db.transaction(() => {
      const deployment = this.db.prepare("SELECT * FROM deployments WHERE id = ?").get(deploymentId) as any;
      if (!deployment || deployment.status === "failed" || deployment.status === "succeeded") return;
      if (deployment.quota_mode === "limited") {
        this.db.prepare(`
          UPDATE entitlements SET ${deployment.capability}_reserved = MAX(0, ${deployment.capability}_reserved - 1),
            ${deployment.capability}_remaining = ${deployment.capability}_remaining + 1 WHERE id = ?
        `).run(deployment.entitlement_id);
      }
      this.db.prepare("UPDATE deployments SET status = 'failed', error_message = ?, finished_at = ? WHERE id = ?")
        .run(message.slice(0, 500), nowIso(), deploymentId);
      this.addLedger(deployment.user_id, deployment.entitlement_id, deploymentId, deployment.capability, "release", deployment.quota_mode === "limited" ? 1 : 0, "搭建失败返还权益");
    })();
  }

  markDeploymentUncertain(deploymentId: string, message = "") {
    this.db.prepare(`
      UPDATE deployments SET status = 'uncertain', error_message = ?, finished_at = ?
      WHERE id = ? AND status IN ('reserved', 'running')
    `).run(message.slice(0, 500), nowIso(), deploymentId);
  }

  resolveUncertain(deploymentId: string, resolution: "succeeded" | "failed") {
    const deployment = this.db.prepare("SELECT status FROM deployments WHERE id = ?").get(deploymentId) as any;
    if (!deployment || deployment.status !== "uncertain") throw new Error("只有结果不确定的任务可以人工处理");
    if (resolution === "succeeded") this.succeedDeployment(deploymentId, "管理员确认搭建成功");
    else this.failDeployment(deploymentId, "管理员确认搭建失败并返还权益");
  }

  listDeployments(userId?: string) {
    return this.db.prepare(`
      SELECT d.id, d.request_id AS requestId, d.user_id AS userId, u.username, d.capability, d.status,
        d.quota_mode AS quotaMode, d.target_host_masked AS targetHostMasked, d.result_summary AS resultSummary,
        d.error_message AS errorMessage, d.created_at AS createdAt, d.started_at AS startedAt, d.finished_at AS finishedAt
      FROM deployments d JOIN users u ON u.id = d.user_id
      ${userId ? "WHERE d.user_id = ?" : ""}
      ORDER BY d.created_at DESC LIMIT 500
    `).all(...(userId ? [userId] : []));
  }

  getDashboardStats() {
    return {
      users: Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user'").get() as any).count),
      paidOrders: Number((this.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'").get() as any).count),
      revenueCents: Number((this.db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM orders WHERE status = 'paid'").get() as any).total),
      deployments: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments").get() as any).count),
      succeeded: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status = 'succeeded'").get() as any).count),
      uncertain: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status = 'uncertain'").get() as any).count),
    };
  }

  private findEntitlement(userId: string, capability: Capability) {
    const timestamp = nowIso();
    return this.db.prepare(`
      SELECT * FROM entitlements
      WHERE user_id = ? AND status = 'active' AND starts_at <= ?
        AND (lifetime = 1 OR expires_at > ?)
        AND ${capability}_mode != 'none'
        AND (${capability}_mode = 'unlimited' OR ${capability}_remaining > 0)
      ORDER BY CASE ${capability}_mode WHEN 'unlimited' THEN 0 ELSE 1 END,
        CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at
      LIMIT 1
    `).get(userId, timestamp, timestamp) as any;
  }

  private addLedger(userId: string, entitlementId: string, deploymentId: string | null, capability: Capability, action: string, amount: number, note: string) {
    this.db.prepare(`
      INSERT INTO usage_ledger (id, user_id, entitlement_id, deployment_id, capability, action, amount, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), userId, entitlementId, deploymentId, capability, action, amount, note, nowIso());
  }

  private recoverInterruptedDeployments() {
    this.db.prepare(`
      UPDATE deployments SET status = 'uncertain', error_message = '服务重启时任务仍在执行，需要管理员确认结果', finished_at = ?
      WHERE status IN ('reserved', 'running')
    `).run(nowIso());
  }
}

export function maskHost(value: unknown) {
  const host = String(value || "").trim().replace(/^(https?:\/\/)/i, "").split(/[/:]/)[0];
  if (!host) return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".");
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  const labels = host.split(".");
  if (labels.length > 1) return `*.${labels.slice(-2).join(".")}`;
  return `${host.slice(0, 2)}***`;
}
