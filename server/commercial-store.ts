import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { SecretVault } from "./secret-vault.js";
import type { PaymentProvider } from "./payment-service.js";

export type UserRole = "user" | "admin";
export type Capability = "panel" | "node";
export type QuotaMode = "none" | "limited" | "unlimited";
export type DurationUnit = "days" | "months" | "years" | "lifetime";

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  status: "active" | "disabled";
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: "manual" | "alipay" | "wechat" | "epay" | "mgate" | "tokenpay" | "epusdt";
  enabled: boolean;
  instructions: string;
  paymentUrl: string;
  sortOrder: number;
  provider?: PaymentProvider;
  gatewayUrl?: string;
  merchantId?: string;
  merchantSecret?: string;
  merchantSecretConfigured?: boolean;
  channel?: string;
  enabledChannels?: string[];
  baseMethodId?: string;
  currency?: string;
  callbackBaseUrl?: string;
  appId?: string;
  privateKey?: string;
  privateKeyConfigured?: boolean;
  publicKey?: string;
  certificateSerial?: string;
  apiV3Key?: string;
  apiV3KeyConfigured?: boolean;
  sandbox?: boolean;
}

const TOKENPAY_CURRENCIES = new Set(["USDT_TRC20", "TRX", "ETH", "USDT_ERC20", "USDC_ERC20"]);
const MGATE_CURRENCIES = new Set(["CNY", "USD", "EUR", "HKD", "TWD", "JPY", "KRW", "SGD"]);
const EPAY_CHANNELS = ["alipay", "wxpay", "qqpay"] as const;
const EPAY_CHANNEL_SET = new Set<string>(EPAY_CHANNELS);
const EPAY_CHANNEL_NAMES: Record<string, string> = { alipay: "支付宝", wxpay: "微信支付", qqpay: "QQ 钱包" };

function publicEpayName(channel: string) {
  return EPAY_CHANNEL_NAMES[channel] || channel;
}

function normalizedEpayChannels(value: unknown, legacyChannel = "alipay") {
  if (Array.isArray(value)) {
    return [...new Set(value.map(item => String(item || "").trim().toLowerCase()).filter(Boolean))];
  }
  const legacy = String(legacyChannel || "alipay").trim().toLowerCase();
  return EPAY_CHANNEL_SET.has(legacy) ? [legacy] : ["alipay"];
}

function parseEpayChannels(value: unknown, legacyChannel = "alipay") {
  try {
    const parsed = JSON.parse(String(value || ""));
    return Array.isArray(parsed) ? normalizedEpayChannels(parsed, legacyChannel) : normalizedEpayChannels(undefined, legacyChannel);
  }
  catch { return normalizedEpayChannels([], legacyChannel); }
}

function normalizeTokenPayCurrency(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/-/g, "_");
}

function storedPaymentCurrency(row: any) {
  if (row.provider === "tokenpay") {
    const configured = normalizeTokenPayCurrency(row.currency);
    if (TOKENPAY_CURRENCIES.has(configured)) return configured;
    const legacy = normalizeTokenPayCurrency(row.merchant_id);
    return TOKENPAY_CURRENCIES.has(legacy) ? legacy : "USDT_TRC20";
  }
  if (row.provider === "epusdt") return "USDT-TRC20";
  return row.currency || "CNY";
}

export interface EmailSettings {
  emailEnabled: boolean;
  emailVerificationRequired: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "none" | "starttls" | "ssl";
  smtpUsername: string;
  smtpPassword?: string;
  smtpPasswordConfigured: boolean;
  smtpFromName: string;
  smtpFromEmail: string;
  smtpReplyTo: string;
  verificationCodeTtlMinutes: number;
  verificationResendSeconds: number;
  siteName: string;
  publicBaseUrl: string;
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
  private readonly vault: SecretVault;

  constructor(
    databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db"),
    options: { recoverInterruptedDeployments?: boolean } = {},
  ) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.vault = new SecretVault(databasePath);
    this.migrate();
    if (options.recoverInterruptedDeployments !== false) this.recoverInterruptedDeployments();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
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
        payment_channel TEXT NOT NULL DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        instructions TEXT NOT NULL DEFAULT '',
        payment_url TEXT NOT NULL DEFAULT '',
        gateway_url TEXT NOT NULL DEFAULT '',
        merchant_id TEXT NOT NULL DEFAULT '',
        merchant_secret_encrypted TEXT NOT NULL DEFAULT '',
        channel TEXT NOT NULL DEFAULT 'alipay',
        enabled_channels TEXT NOT NULL DEFAULT '[]',
        currency TEXT NOT NULL DEFAULT 'CNY',
        callback_base_url TEXT NOT NULL DEFAULT '',
        app_id TEXT NOT NULL DEFAULT '',
        private_key_encrypted TEXT NOT NULL DEFAULT '',
        public_key TEXT NOT NULL DEFAULT '',
        certificate_serial TEXT NOT NULL DEFAULT '',
        api_v3_key_encrypted TEXT NOT NULL DEFAULT '',
        sandbox INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        provider TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'closed', 'refunded')),
        provider_trade_no TEXT,
        checkout_url TEXT NOT NULL DEFAULT '',
        request_payload TEXT NOT NULL DEFAULT '{}',
        response_payload TEXT NOT NULL DEFAULT '{}',
        error_message TEXT NOT NULL DEFAULT '',
        expires_at TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS payment_notifications (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        order_no TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
        payload TEXT NOT NULL DEFAULT '{}',
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_notifications_created ON payment_notifications(created_at DESC);

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        purpose TEXT NOT NULL CHECK (purpose IN ('register', 'reset_password', 'change_email')),
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        last_sent_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_verification_codes(email, purpose, created_at DESC);

      CREATE TABLE IF NOT EXISTS email_delivery_logs (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);

    const userColumns = this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!userColumns.some(column => column.name === "email")) {
      this.db.exec("ALTER TABLE users ADD COLUMN email TEXT");
    }
    if (!userColumns.some(column => column.name === "email_verified")) {
      this.db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    }
    const orderColumns = this.db.prepare("PRAGMA table_info(orders)").all() as Array<{ name: string }>;
    for (const [name, definition] of [
      ["expires_at", "TEXT"], ["cancelled_at", "TEXT"], ["refunded_at", "TEXT"],
      ["refund_trade_no", "TEXT"], ["cancel_reason", "TEXT NOT NULL DEFAULT ''"], ["refund_reason", "TEXT NOT NULL DEFAULT ''"],
      ["payment_channel", "TEXT NOT NULL DEFAULT ''"],
    ] as const) {
      if (!orderColumns.some(column => column.name === name)) this.db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
    }
    this.migratePaymentChannelSchema();
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL");

    const settings = this.db.prepare("INSERT OR IGNORE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)");
    settings.run("registration_enabled", "true", nowIso());
    settings.run("panel_deploy_enabled", "true", nowIso());
    settings.run("node_deploy_enabled", "true", nowIso());
    settings.run("payment_instructions", "下单后请按照所选支付方式完成付款，并将订单号作为付款备注。", nowIso());
    settings.run("payment_methods", JSON.stringify([{
      id: "manual",
      name: "人工收款",
      type: "manual",
      enabled: true,
      instructions: "提交订单后，请联系管理员并提供订单号完成付款确认。",
      paymentUrl: "",
      sortOrder: 10,
    }]), nowIso());
    settings.run("email_enabled", "false", nowIso());
    settings.run("email_verification_required", "false", nowIso());
    settings.run("smtp_host", "", nowIso());
    settings.run("smtp_port", "465", nowIso());
    settings.run("smtp_encryption", "ssl", nowIso());
    settings.run("smtp_username", "", nowIso());
    settings.run("smtp_password_encrypted", "", nowIso());
    settings.run("smtp_from_name", "NEXUS CLOUD", nowIso());
    settings.run("smtp_from_email", "", nowIso());
    settings.run("smtp_reply_to", "", nowIso());
    settings.run("verification_code_ttl_minutes", "10", nowIso());
    settings.run("verification_resend_seconds", "60", nowIso());
    settings.run("site_name", "NEXUS CLOUD", nowIso());
    settings.run("public_base_url", "", nowIso());
    settings.run("order_expiry_minutes", "30", nowIso());
    settings.run("admin_path", "admin", nowIso());

    this.migratePaymentChannels();

    const count = Number((this.db.prepare("SELECT COUNT(*) AS count FROM plans").get() as any).count);
    if (count === 0) this.seedPlans();
  }

  private migratePaymentChannelSchema() {
    const columns = this.db.prepare("PRAGMA table_info(payment_channels)").all() as Array<{ name: string }>;
    const requiredColumns = ["currency", "callback_base_url", "app_id", "private_key_encrypted", "public_key", "certificate_serial", "api_v3_key_encrypted", "archived"];
    const tableSql = String((this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'payment_channels'").get() as any)?.sql || "");
    const requiresRebuild = requiredColumns.some(name => !columns.some(column => column.name === name)) || /provider\s+IN\s*\(\s*'manual'\s*,\s*'epay'/i.test(tableSql);
    if (!requiresRebuild) {
      if (!columns.some(column => column.name === "enabled_channels")) {
        this.db.exec("ALTER TABLE payment_channels ADD COLUMN enabled_channels TEXT NOT NULL DEFAULT '[]'");
        this.db.exec("UPDATE payment_channels SET enabled_channels = json_array(channel) WHERE provider = 'epay' AND enabled_channels = '[]'");
      }
      return;
    }
    this.db.transaction(() => {
      this.db.exec(`
        ALTER TABLE payment_channels RENAME TO payment_channels_legacy;
        CREATE TABLE payment_channels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          instructions TEXT NOT NULL DEFAULT '',
          payment_url TEXT NOT NULL DEFAULT '',
          gateway_url TEXT NOT NULL DEFAULT '',
          merchant_id TEXT NOT NULL DEFAULT '',
          merchant_secret_encrypted TEXT NOT NULL DEFAULT '',
          channel TEXT NOT NULL DEFAULT 'alipay',
          enabled_channels TEXT NOT NULL DEFAULT '[]',
          currency TEXT NOT NULL DEFAULT 'CNY',
          callback_base_url TEXT NOT NULL DEFAULT '',
          app_id TEXT NOT NULL DEFAULT '',
          private_key_encrypted TEXT NOT NULL DEFAULT '',
          public_key TEXT NOT NULL DEFAULT '',
          certificate_serial TEXT NOT NULL DEFAULT '',
          api_v3_key_encrypted TEXT NOT NULL DEFAULT '',
          sandbox INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO payment_channels (
          id, name, provider, enabled, instructions, payment_url, gateway_url, merchant_id,
          merchant_secret_encrypted, channel, enabled_channels, sandbox, sort_order, created_at, updated_at
        ) SELECT id, name, provider, enabled, instructions, payment_url, gateway_url, merchant_id,
          merchant_secret_encrypted, channel, CASE WHEN provider = 'epay' THEN json_array(channel) ELSE '[]' END,
          sandbox, sort_order, created_at, updated_at
        FROM payment_channels_legacy;
        DROP TABLE payment_channels_legacy;
      `);
    })();
  }

  private migratePaymentChannels() {
    const count = Number((this.db.prepare("SELECT COUNT(*) AS count FROM payment_channels").get() as any).count);
    if (count > 0) return;
    for (const method of this.getLegacyPaymentMethods(true)) {
      const timestamp = nowIso();
      const provider = method.type === "epay" ? "epay" : "manual";
      this.db.prepare(`
        INSERT INTO payment_channels (id, name, provider, enabled, instructions, payment_url, channel, enabled_channels, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(method.id, method.name, provider, method.enabled ? 1 : 0, method.instructions, method.paymentUrl,
        method.channel || "alipay", provider === "epay" ? JSON.stringify([method.channel || "alipay"]) : "[]", method.sortOrder, timestamp, timestamp);
    }
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

  bootstrapAdmin(username: string, password: string) {
    const createInitialAdmin = this.db.transaction(() => {
      if (this.hasUsers()) return null;
      return this.createUser(username, password, "admin");
    });
    return createInitialAdmin.immediate();
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

  getAdminPath() {
    const configured = this.getSetting("admin_path", "admin");
    try {
      return this.normalizeAdminPath(configured);
    } catch {
      return "admin";
    }
  }

  setAdminPath(value: string) {
    const normalized = this.normalizeAdminPath(value);
    this.setSetting("admin_path", normalized);
    return normalized;
  }

  private normalizeAdminPath(value: string) {
    const normalized = value.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(normalized)) {
      throw new Error("管理端入口后缀必须为 3 到 40 位小写字母、数字或短横线，且不能以短横线开头或结尾");
    }
    if (["api", "assets", "console", "login", "register"].includes(normalized)) {
      throw new Error("该管理端入口后缀为系统保留路径，请更换其他名称");
    }
    return normalized;
  }

  private getLegacyPaymentMethods(includeDisabled = false): PaymentMethod[] {
    let value: unknown;
    try {
      value = JSON.parse(this.getSetting("payment_methods", "[]"));
    } catch {
      value = [];
    }
    const methods = Array.isArray(value) ? value.map((item: any, index): PaymentMethod | null => {
      if (!item || typeof item !== "object") return null;
      const type = ["manual", "alipay", "wechat", "epay", "mgate", "tokenpay", "epusdt"].includes(item.type) ? item.type : "manual";
      return {
        id: String(item.id || "").trim(),
        name: String(item.name || "").trim(),
        type,
        enabled: item.enabled !== false,
        instructions: String(item.instructions || "").slice(0, 1000),
        paymentUrl: String(item.paymentUrl || "").slice(0, 1000),
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index * 10,
      };
    }).filter((item): item is PaymentMethod => Boolean(item?.id && item.name)) : [];
    return methods.filter(item => includeDisabled || item.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getPaymentMethods(includeDisabled = false, includeSecrets = false, includeArchived = false): PaymentMethod[] {
    const filters = [
      includeDisabled ? "" : "enabled = 1",
      includeArchived ? "" : "archived = 0",
    ].filter(Boolean);
    const rows = this.db.prepare(`SELECT * FROM payment_channels ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY sort_order, created_at`).all() as any[];
    const methods = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.provider === "alipay_official" ? "alipay" : row.provider === "wechat_official" ? "wechat" : row.provider,
      provider: row.provider,
      enabled: Boolean(row.enabled),
      instructions: row.instructions || "",
      paymentUrl: row.payment_url || "",
      gatewayUrl: includeDisabled || includeSecrets ? row.gateway_url || "" : undefined,
      merchantId: includeDisabled || includeSecrets ? row.merchant_id || "" : undefined,
      merchantSecret: includeSecrets && row.merchant_secret_encrypted ? this.vault.decrypt(row.merchant_secret_encrypted) : undefined,
      merchantSecretConfigured: includeDisabled || includeSecrets ? Boolean(row.merchant_secret_encrypted) : undefined,
      channel: includeDisabled || includeSecrets ? row.channel : undefined,
      enabledChannels: row.provider === "epay"
        ? parseEpayChannels(row.enabled_channels, row.channel)
        : undefined,
      currency: includeDisabled || includeSecrets ? storedPaymentCurrency(row) : undefined,
      callbackBaseUrl: includeDisabled || includeSecrets ? row.callback_base_url || "" : undefined,
      appId: includeDisabled || includeSecrets ? row.app_id || "" : undefined,
      privateKey: includeSecrets && row.private_key_encrypted ? this.vault.decrypt(row.private_key_encrypted) : undefined,
      privateKeyConfigured: includeDisabled || includeSecrets ? Boolean(row.private_key_encrypted) : undefined,
      publicKey: includeDisabled || includeSecrets ? row.public_key || "" : undefined,
      certificateSerial: includeDisabled || includeSecrets ? row.certificate_serial || "" : undefined,
      apiV3Key: includeSecrets && row.api_v3_key_encrypted ? this.vault.decrypt(row.api_v3_key_encrypted) : undefined,
      apiV3KeyConfigured: includeDisabled || includeSecrets ? Boolean(row.api_v3_key_encrypted) : undefined,
      sandbox: includeDisabled || includeSecrets ? Boolean(row.sandbox) : undefined,
      sortOrder: row.sort_order,
    }));
    if (includeDisabled || includeSecrets) return methods;
    return methods.flatMap(method => {
      if (method.provider !== "epay") return [method];
      return (method.enabledChannels || []).map((channel, index) => ({
        ...method,
        id: `${method.id}--${channel}`,
        baseMethodId: method.id,
        channel,
        enabledChannels: undefined,
        name: publicEpayName(channel),
        sortOrder: method.sortOrder * 10 + index,
      }));
    }).sort((left, right) => left.sortOrder - right.sortOrder);
  }

  setPaymentMethods(value: unknown) {
    if (!Array.isArray(value)) throw new Error("支付方式数据格式无效");
    if (value.length > 12) throw new Error("支付方式最多配置 12 个");
    const ids = new Set<string>();
    const methods = value.map((item: any, index): PaymentMethod => {
      const id = String(item?.id || "").trim().toLowerCase();
      const name = String(item?.name || "").trim();
      const type = String(item?.type || "manual") as PaymentMethod["type"];
      if (!/^[a-z0-9_-]{2,32}$/.test(id)) throw new Error("支付方式标识必须为 2 到 32 位小写字母、数字、下划线或短横线");
      if (ids.has(id)) throw new Error(`支付方式标识 ${id} 重复`);
      if (!name || name.length > 40) throw new Error("支付方式名称必须为 1 到 40 位");
      if (!["manual", "alipay", "wechat", "epay", "mgate", "tokenpay", "epusdt"].includes(type)) throw new Error("支付方式类型无效");
      ids.add(id);
      return {
        id,
        name,
        type,
        enabled: item?.enabled !== false,
        instructions: String(item?.instructions || "").slice(0, 1000),
        paymentUrl: String(item?.paymentUrl || "").slice(0, 1000),
        sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : index * 10,
      };
    });
    if (!methods.some(method => method.enabled)) throw new Error("至少需要启用一种支付方式");
    const save = this.db.transaction(() => {
      const existing = new Map((this.db.prepare("SELECT id, merchant_secret_encrypted, private_key_encrypted, api_v3_key_encrypted FROM payment_channels").all() as any[])
        .map(row => [row.id, row]));
      const timestamp = nowIso();
      for (const method of methods) {
        const raw = value.find((item: any) => String(item?.id || "").trim().toLowerCase() === method.id) as any;
        const supportedProviders: PaymentProvider[] = ["manual", "epay", "mgate", "tokenpay", "epusdt", "alipay_official", "wechat_official"];
        const requestedProvider = String(raw?.provider || "");
        const provider = supportedProviders.includes(requestedProvider as PaymentProvider)
          ? requestedProvider as PaymentProvider
          : method.type === "epay" ? "epay"
            : method.type === "mgate" || method.type === "tokenpay" || method.type === "epusdt" ? method.type
              : "manual";
        const gatewayUrl = String(raw?.gatewayUrl || "").trim().slice(0, 1000);
        const merchantId = String(raw?.merchantId || "").trim().slice(0, 100);
        const enabledChannels = provider === "epay" ? normalizedEpayChannels(raw?.enabledChannels, raw?.channel) : [];
        if (provider === "epay") {
          const unsupported = enabledChannels.filter(item => !EPAY_CHANNEL_SET.has(item));
          if (unsupported.length) throw new Error(`支付通道 ${method.name} 包含不支持的支付类型：${unsupported.join("、")}`);
          if (method.enabled && !enabledChannels.length) throw new Error(`支付通道 ${method.name} 启用前至少选择一种支付方式`);
        }
        const channel = provider === "epay" ? enabledChannels[0] || "alipay" : String(raw?.channel || "alipay").trim().slice(0, 50);
        let currency = String(raw?.currency || "CNY").trim().toUpperCase().slice(0, 20);
        if (provider === "tokenpay") {
          const selected = normalizeTokenPayCurrency(currency);
          const legacy = normalizeTokenPayCurrency(merchantId);
          currency = TOKENPAY_CURRENCIES.has(selected) ? selected : TOKENPAY_CURRENCIES.has(legacy) ? legacy : selected;
          if (!TOKENPAY_CURRENCIES.has(currency)) throw new Error(`支付通道 ${method.name} 的 TokenPay 币种无效`);
        }
        if (provider === "epusdt") {
          if (currency !== "CNY" && currency !== "USDT-TRC20" && currency !== "USDT_TRC20") throw new Error(`支付通道 ${method.name} 的 Epusdt 币种无效`);
          currency = "USDT-TRC20";
        }
        if (provider === "mgate" && !MGATE_CURRENCIES.has(currency)) throw new Error(`支付通道 ${method.name} 的源货币无效`);
        if (["alipay_official", "wechat_official"].includes(provider)) currency = "CNY";
        const callbackBaseUrl = String(raw?.callbackBaseUrl || "").trim().replace(/\/+$/, "").slice(0, 1000);
        const appId = String(raw?.appId || "").trim().slice(0, 100);
        const publicKey = String(raw?.publicKey || "").trim().slice(0, 20_000);
        const certificateSerial = String(raw?.certificateSerial || "").trim().slice(0, 200);
        const suppliedSecret = String(raw?.merchantSecret || "");
        const suppliedPrivateKey = String(raw?.privateKey || "");
        const suppliedApiV3Key = String(raw?.apiV3Key || "");
        const retained = existing.get(method.id);
        const encryptedSecret = suppliedSecret ? this.vault.encrypt(suppliedSecret) : retained?.merchant_secret_encrypted || "";
        const encryptedPrivateKey = suppliedPrivateKey ? this.vault.encrypt(suppliedPrivateKey) : retained?.private_key_encrypted || "";
        const encryptedApiV3Key = suppliedApiV3Key ? this.vault.encrypt(suppliedApiV3Key) : retained?.api_v3_key_encrypted || "";
        if (callbackBaseUrl) {
          const callback = new URL(callbackBaseUrl);
          if (!['http:', 'https:'].includes(callback.protocol)) throw new Error(`支付通道 ${method.name} 的回调域名必须是 HTTP 或 HTTPS 地址`);
        }
        if (provider !== "manual" && method.enabled && !gatewayUrl && !["alipay_official", "wechat_official"].includes(provider)) {
          throw new Error(`支付通道 ${method.name} 启用前必须填写网关或 API 地址`);
        }
        if (["epay", "mgate"].includes(provider) && method.enabled && (!merchantId || !encryptedSecret)) {
          throw new Error(`支付通道 ${method.name} 启用前必须填写商户标识和商户密钥`);
        }
        if (provider === "tokenpay" && method.enabled && !encryptedSecret) throw new Error(`支付通道 ${method.name} 启用前必须填写 API 密钥`);
        if (provider === "epusdt" && method.enabled && !encryptedSecret) throw new Error(`支付通道 ${method.name} 启用前必须填写签名 Token`);
        if (provider === "alipay_official" && method.enabled && (!merchantId || !encryptedPrivateKey || !publicKey)) {
          throw new Error(`支付通道 ${method.name} 启用前必须填写 APPID、应用私钥和支付宝公钥`);
        }
        if (provider === "wechat_official" && method.enabled && (!merchantId || !appId || !encryptedPrivateKey || !publicKey || !certificateSerial || !encryptedApiV3Key)) {
          throw new Error(`支付通道 ${method.name} 启用前必须填写 AppID、商户号、商户私钥、平台证书、证书序列号和 API v3 密钥`);
        }
        this.db.prepare(`
          INSERT INTO payment_channels (
            id, name, provider, enabled, instructions, payment_url, gateway_url, merchant_id,
            merchant_secret_encrypted, channel, enabled_channels, currency, callback_base_url, app_id, private_key_encrypted,
            public_key, certificate_serial, api_v3_key_encrypted, sandbox, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, provider = excluded.provider,
            enabled = excluded.enabled, instructions = excluded.instructions, payment_url = excluded.payment_url,
            gateway_url = excluded.gateway_url, merchant_id = excluded.merchant_id,
            merchant_secret_encrypted = excluded.merchant_secret_encrypted, channel = excluded.channel,
            enabled_channels = excluded.enabled_channels,
            currency = excluded.currency, callback_base_url = excluded.callback_base_url, app_id = excluded.app_id,
            private_key_encrypted = excluded.private_key_encrypted, public_key = excluded.public_key,
            certificate_serial = excluded.certificate_serial, api_v3_key_encrypted = excluded.api_v3_key_encrypted,
            sandbox = excluded.sandbox, archived = 0, sort_order = excluded.sort_order, updated_at = excluded.updated_at
        `).run(method.id, method.name, provider, method.enabled ? 1 : 0, method.instructions, method.paymentUrl,
          gatewayUrl, merchantId, encryptedSecret, channel, JSON.stringify(enabledChannels), currency, callbackBaseUrl, appId, encryptedPrivateKey,
          publicKey, certificateSerial, encryptedApiV3Key, raw?.sandbox === true ? 1 : 0, method.sortOrder, timestamp, timestamp);
      }
      const retained = methods.map(method => method.id);
      if (retained.length) {
        const placeholders = retained.map(() => "?").join(",");
        this.db.prepare(`UPDATE payment_channels SET enabled = 0, archived = 1, updated_at = ? WHERE id NOT IN (${placeholders}) AND id IN (SELECT DISTINCT payment_provider FROM orders)`)
          .run(nowIso(), ...retained);
        this.db.prepare(`DELETE FROM payment_channels WHERE id NOT IN (${placeholders}) AND id NOT IN (SELECT DISTINCT payment_provider FROM orders)`)
          .run(...retained);
      }
    });
    save();
    return this.getPaymentMethods(true);
  }

  getEmailSettings(includePassword = false): EmailSettings {
    const encryptedPassword = this.getSetting("smtp_password_encrypted", "");
    const encryption = this.getSetting("smtp_encryption", "ssl");
    return {
      emailEnabled: this.getSetting("email_enabled", "false") === "true",
      emailVerificationRequired: this.getSetting("email_verification_required", "false") === "true",
      smtpHost: this.getSetting("smtp_host", ""),
      smtpPort: Number(this.getSetting("smtp_port", "465")) || 465,
      smtpEncryption: encryption === "none" || encryption === "starttls" ? encryption : "ssl",
      smtpUsername: this.getSetting("smtp_username", ""),
      smtpPassword: includePassword && encryptedPassword ? this.vault.decrypt(encryptedPassword) : undefined,
      smtpPasswordConfigured: Boolean(encryptedPassword),
      smtpFromName: this.getSetting("smtp_from_name", "NEXUS CLOUD"),
      smtpFromEmail: this.getSetting("smtp_from_email", ""),
      smtpReplyTo: this.getSetting("smtp_reply_to", ""),
      verificationCodeTtlMinutes: Number(this.getSetting("verification_code_ttl_minutes", "10")) || 10,
      verificationResendSeconds: Number(this.getSetting("verification_resend_seconds", "60")) || 60,
      siteName: this.getSetting("site_name", "NEXUS CLOUD"),
      publicBaseUrl: this.getSetting("public_base_url", ""),
    };
  }

  setEmailSettings(input: Partial<EmailSettings>) {
    const current = this.getEmailSettings(true);
    const next = { ...current, ...input };
    if (next.emailEnabled && (!next.smtpHost.trim() || !next.smtpPort || !next.smtpFromEmail.trim())) {
      throw new Error("启用邮件服务前必须填写 SMTP 主机、端口和发件邮箱");
    }
    if (next.emailVerificationRequired && !next.emailEnabled) throw new Error("强制邮箱验证前必须先启用邮件服务");
    if (!["none", "starttls", "ssl"].includes(next.smtpEncryption)) throw new Error("SMTP 加密方式无效");
    if (next.smtpPort < 1 || next.smtpPort > 65535) throw new Error("SMTP 端口无效");
    if (next.verificationCodeTtlMinutes < 3 || next.verificationCodeTtlMinutes > 60) throw new Error("验证码有效期必须为 3 到 60 分钟");
    if (next.verificationResendSeconds < 30 || next.verificationResendSeconds > 600) throw new Error("重发间隔必须为 30 到 600 秒");
    const values: Record<string, string> = {
      email_enabled: String(next.emailEnabled), email_verification_required: String(next.emailVerificationRequired),
      smtp_host: next.smtpHost.trim(), smtp_port: String(next.smtpPort), smtp_encryption: next.smtpEncryption,
      smtp_username: next.smtpUsername.trim(), smtp_from_name: next.smtpFromName.trim(), smtp_from_email: next.smtpFromEmail.trim(),
      smtp_reply_to: next.smtpReplyTo.trim(), verification_code_ttl_minutes: String(next.verificationCodeTtlMinutes),
      verification_resend_seconds: String(next.verificationResendSeconds), site_name: next.siteName.trim(), public_base_url: next.publicBaseUrl.trim(),
    };
    if (input.smtpPassword) values.smtp_password_encrypted = this.vault.encrypt(input.smtpPassword);
    for (const [key, value] of Object.entries(values)) this.setSetting(key, value);
    return this.getEmailSettings();
  }

  createEmailCode(email: string, purpose: "register" | "reset_password" | "change_email") {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("邮箱格式不正确");
    const settings = this.getEmailSettings();
    const latest = this.db.prepare(`SELECT last_sent_at AS lastSentAt FROM email_verification_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`).get(normalized, purpose) as any;
    if (latest && Date.now() - new Date(latest.lastSentAt).getTime() < settings.verificationResendSeconds * 1000) {
      throw new Error(`验证码发送过于频繁，请等待 ${settings.verificationResendSeconds} 秒`);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const timestamp = nowIso();
    this.db.prepare("UPDATE email_verification_codes SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL")
      .run(timestamp, normalized, purpose);
    this.db.prepare(`INSERT INTO email_verification_codes (id, email, purpose, code_hash, expires_at, created_at, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), normalized, purpose, hashToken(code), new Date(Date.now() + settings.verificationCodeTtlMinutes * 60_000).toISOString(), timestamp, timestamp);
    return { email: normalized, code, expiresAt: new Date(Date.now() + settings.verificationCodeTtlMinutes * 60_000).toISOString() };
  }

  verifyEmailCode(email: string, purpose: "register" | "reset_password" | "change_email", code: string, consume = true) {
    const normalized = email.trim().toLowerCase();
    const row = this.db.prepare(`SELECT * FROM email_verification_codes WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`).get(normalized, purpose) as any;
    if (!row || row.expires_at <= nowIso()) throw new Error("验证码无效或已过期");
    if (row.attempt_count >= 5) throw new Error("验证码尝试次数过多，请重新获取");
    if (!timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashToken(code.trim())))) {
      this.db.prepare("UPDATE email_verification_codes SET attempt_count = attempt_count + 1 WHERE id = ?").run(row.id);
      throw new Error("验证码错误");
    }
    if (consume) this.db.prepare("UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?").run(nowIso(), row.id);
    return true;
  }

  recordEmailDelivery(recipient: string, purpose: string, status: "sent" | "failed", errorMessage = "") {
    this.db.prepare("INSERT INTO email_delivery_logs (id, recipient, purpose, status, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), recipient, purpose, status, errorMessage.slice(0, 1000), nowIso());
  }

  createUser(username: string, password: string, role: UserRole = "user", email?: string, emailVerified = false) {
    const normalizedEmail = email?.trim().toLowerCase() || null;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("邮箱格式不正确");
    let normalized = username.trim();
    if (!normalized && normalizedEmail) normalized = this.availableUsername(normalizedEmail.split("@")[0]);
    if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(normalized)) throw new Error("用户名必须为 3 到 64 位字母、数字或 ._@-");
    if (password.length < 8 || password.length > 128) throw new Error("密码必须为 8 到 128 位");
    const id = randomUUID();
    const timestamp = nowIso();
    try {
      this.db.prepare(`INSERT INTO users (id, username, email, email_verified, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, normalized, normalizedEmail, emailVerified ? 1 : 0, hashPassword(password), role, timestamp, timestamp);
    } catch (error: any) {
      if (/users\.email|idx_users_email/i.test(String(error?.message))) throw new Error("邮箱已经注册");
      if (/UNIQUE/i.test(String(error?.message))) throw new Error("用户名已经存在");
      throw error;
    }
    return this.getUserById(id)!;
  }

  private availableUsername(seed: string) {
    const base = seed.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 48) || "user";
    const normalized = base.length >= 3 ? base : `${base}user`;
    if (!this.db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(normalized)) return normalized;
    for (let index = 1; index < 1000; index += 1) {
      const candidate = `${normalized.slice(0, 56)}-${index}`;
      if (!this.db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE").get(candidate)) return candidate;
    }
    return `user-${randomBytes(5).toString("hex")}`;
  }

  authenticate(identifier: string, password: string) {
    const normalized = identifier.trim();
    const row = this.db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE").get(normalized, normalized) as any;
    if (!row || !verifyPassword(password, row.password_hash)) throw new Error("邮箱、用户名或密码错误");
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
      SELECT u.id, u.username, u.email, u.email_verified AS emailVerified, u.role, u.status
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(hashToken(token), nowIso()) as any;
    return row ? { ...row, emailVerified: Boolean(row.emailVerified) } : null;
  }

  getUserById(id: string): SessionUser | null {
    const row = this.db.prepare("SELECT id, username, email, email_verified AS emailVerified, role, status FROM users WHERE id = ?").get(id) as any;
    return row ? { ...row, emailVerified: Boolean(row.emailVerified) } : null;
  }

  listUsers() {
    return (this.db.prepare(`
      SELECT id, username, email, email_verified AS emailVerified, role, status, created_at AS createdAt, last_login_at AS lastLoginAt
      FROM users ORDER BY created_at DESC
    `).all() as any[]).map(row => ({ ...row, emailVerified: Boolean(row.emailVerified) }));
  }

  listAdministrators() {
    return (this.db.prepare(`
      SELECT id, username, email, email_verified AS emailVerified, status,
             created_at AS createdAt, last_login_at AS lastLoginAt
      FROM users WHERE role = 'admin' ORDER BY created_at, username
    `).all() as any[]).map(row => ({ ...row, emailVerified: Boolean(row.emailVerified) }));
  }

  updateAdministratorCredentials(currentUsername: string, nextUsername?: string, nextPassword?: string) {
    const current = currentUsername.trim();
    const next = nextUsername?.trim() || current;
    if (!current) throw new Error("请输入当前管理员用户名");
    if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(next)) throw new Error("用户名必须为 3 到 64 位字母、数字或 ._@-");
    if (nextPassword !== undefined && (nextPassword.length < 8 || nextPassword.length > 128)) {
      throw new Error("新密码必须为 8 到 128 位");
    }

    const update = this.db.transaction(() => {
      const row = this.db.prepare("SELECT id, username FROM users WHERE role = 'admin' AND username = ? COLLATE NOCASE")
        .get(current) as any;
      if (!row) throw new Error("管理员账号不存在");
      try {
        this.db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?").run(next, nowIso(), row.id);
      } catch (error: any) {
        if (/UNIQUE/i.test(String(error?.message))) throw new Error("用户名已经存在");
        throw error;
      }
      if (nextPassword !== undefined) {
        this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
          .run(hashPassword(nextPassword), nowIso(), row.id);
      }
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
      return { id: row.id as string, previousUsername: row.username as string };
    });

    const result = update.immediate();
    this.recordAdminAction(result.id, "服务器菜单修改管理员账号", "user", result.id,
      `${result.previousUsername} -> ${next}; passwordReset=${nextPassword !== undefined}`);
    return this.getUserById(result.id)!;
  }

  getUserDetail(id: string) {
    const user = this.db.prepare(`
      SELECT id, username, email, email_verified AS emailVerified, role, status, created_at AS createdAt, last_login_at AS lastLoginAt
      FROM users WHERE id = ?
    `).get(id) as any;
    if (!user) return null;
    user.emailVerified = Boolean(user.emailVerified);
    return {
      user,
      orders: this.listOrders(id),
      entitlements: this.listEntitlements(id),
      deployments: this.listDeployments(id),
    };
  }

  updateUserStatus(id: string, status: "active" | "disabled") {
    this.db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
    if (status === "disabled") this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }

  updateUserRole(id: string, role: UserRole) {
    this.db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(role, nowIso(), id);
  }

  updateUsername(id: string, username: string) {
    const normalized = username.trim();
    if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(normalized)) throw new Error("用户名必须为 3 到 64 位字母、数字或 ._@-");
    try {
      const result = this.db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?")
        .run(normalized, nowIso(), id);
      if (!result.changes) throw new Error("用户不存在");
    } catch (error: any) {
      if (/UNIQUE/i.test(String(error?.message))) throw new Error("用户名已经存在");
      throw error;
    }
    return this.getUserById(id)!;
  }

  changePassword(userId: string, currentPassword: string, nextPassword: string) {
    const row = this.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as any;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) throw new Error("当前密码错误");
    if (nextPassword.length < 8 || nextPassword.length > 128) throw new Error("新密码必须为 8 到 128 位");
    this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(nextPassword), nowIso(), userId);
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  resetPassword(userId: string, nextPassword: string) {
    if (nextPassword.length < 8 || nextPassword.length > 128) throw new Error("新密码长度必须为 8 到 128 位");
    const result = this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(nextPassword), nowIso(), userId);
    if (!result.changes) throw new Error("用户不存在");
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  resetPasswordByEmail(email: string, nextPassword: string) {
    const row = this.db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email.trim()) as any;
    if (!row) throw new Error("该邮箱没有注册账户");
    this.resetPassword(row.id, nextPassword);
  }

  emailExists(email: string) {
    return Boolean(this.db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email.trim()));
  }

  updateUserEmail(id: string, email: string, verified = false) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("邮箱格式不正确");
    try {
      const result = this.db.prepare("UPDATE users SET email = ?, email_verified = ?, updated_at = ? WHERE id = ?")
        .run(normalized, verified ? 1 : 0, nowIso(), id);
      if (!result.changes) throw new Error("用户不存在");
    } catch (error: any) {
      if (/UNIQUE|users\.email|idx_users_email/i.test(String(error?.message))) throw new Error("邮箱已经注册");
      throw error;
    }
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

  createOrder(userId: string, planId: string, paymentProvider = "manual") {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error("套餐不存在或已经下架");
    const publicMethod = this.getPaymentMethods().find(method => method.id === paymentProvider);
    const legacyMethod = this.getPaymentMethods(true).find(method => method.id === paymentProvider && method.enabled);
    const paymentMethod = publicMethod || legacyMethod;
    if (!paymentMethod) throw new Error("所选支付方式不存在或已停用");
    const storedProvider = paymentMethod.baseMethodId || paymentMethod.id;
    const paymentChannel = paymentMethod.provider === "epay"
      ? paymentMethod.channel || paymentMethod.enabledChannels?.[0] || "alipay"
      : "";
    const id = randomUUID();
    const timestamp = nowIso();
    const orderNo = `XUI${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`;
    const expiryMinutes = Math.max(5, Number(this.getSetting("order_expiry_minutes", "30")) || 30);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
    this.db.prepare(`
      INSERT INTO orders (id, order_no, user_id, plan_id, status, amount_cents, plan_snapshot, payment_provider, payment_channel, created_at, expires_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, orderNo, userId, planId, plan.priceCents, JSON.stringify(plan), storedProvider, paymentChannel, timestamp, expiresAt, timestamp);
    return this.getOrder(id)!;
  }

  getOrder(id: string) {
    return this.db.prepare(`
      SELECT id, order_no AS orderNo, user_id AS userId, plan_id AS planId, status,
        amount_cents AS amountCents, plan_snapshot AS planSnapshot, payment_provider AS paymentProvider,
        payment_channel AS paymentChannel,
        CASE WHEN payment_channel <> '' THEN payment_provider || '--' || payment_channel ELSE payment_provider END AS paymentOptionId,
        payment_trade_no AS paymentTradeNo, created_at AS createdAt, paid_at AS paidAt,
        expires_at AS expiresAt, cancelled_at AS cancelledAt, refunded_at AS refundedAt,
        refund_trade_no AS refundTradeNo, cancel_reason AS cancelReason, refund_reason AS refundReason
      FROM orders WHERE id = ?
    `).get(id) as any;
  }

  getOrderByNo(orderNo: string) {
    const row = this.db.prepare("SELECT id FROM orders WHERE order_no = ?").get(orderNo) as any;
    return row ? this.getOrder(row.id) : null;
  }

  listOrders(userId?: string) {
    return this.db.prepare(`
      SELECT o.id, o.order_no AS orderNo, o.user_id AS userId, u.username, o.status,
        o.amount_cents AS amountCents, o.plan_snapshot AS planSnapshot, o.payment_provider AS paymentProvider,
        o.payment_channel AS paymentChannel,
        CASE WHEN o.payment_channel <> '' THEN o.payment_provider || '--' || o.payment_channel ELSE o.payment_provider END AS paymentOptionId,
        o.payment_trade_no AS paymentTradeNo, o.created_at AS createdAt, o.paid_at AS paidAt,
        o.expires_at AS expiresAt, o.cancelled_at AS cancelledAt, o.refunded_at AS refundedAt,
        o.refund_trade_no AS refundTradeNo, o.cancel_reason AS cancelReason, o.refund_reason AS refundReason
      FROM orders o JOIN users u ON u.id = o.user_id
      ${userId ? "WHERE o.user_id = ?" : ""}
      ORDER BY o.created_at DESC
    `).all(...(userId ? [userId] : []));
  }

  markOrderPaid(orderId: string, provider = "manual", tradeNo = `manual-${randomUUID()}`) {
    return this.db.transaction(() => {
      const order = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as any;
      if (!order) throw new Error("订单不存在");
      if (order.status === "paid") {
        if (order.payment_provider !== provider || (order.payment_trade_no && order.payment_trade_no !== tradeNo)) {
          throw new Error("订单已经由其他支付交易完成");
        }
        return this.getOrder(orderId);
      }
      if (order.status !== "pending") throw new Error("只有待支付订单可以确认收款");
      if (order.expires_at && order.expires_at <= nowIso()) {
        this.db.prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), orderId);
        throw new Error("订单已过期，请重新下单");
      }
      const eventKey = `${provider}:${tradeNo}`;
      this.db.prepare("INSERT INTO payment_events (id, provider, event_key, order_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), provider, eventKey, orderId, "{}", nowIso());
      this.db.prepare("UPDATE orders SET status = 'paid', payment_provider = ?, payment_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?")
        .run(provider, tradeNo, nowIso(), nowIso(), orderId);
      this.grantOrderEntitlement(order);
      return this.getOrder(orderId);
    })();
  }

  cancelOrder(orderId: string, userId?: string, reason = "") {
    const order = this.getOrder(orderId);
    if (!order || (userId && order.userId !== userId)) throw new Error("订单不存在");
    if (order.status !== "pending") throw new Error("只有待支付订单可以取消");
    this.db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ?")
      .run(nowIso(), reason.slice(0, 500), nowIso(), orderId);
    return this.getOrder(orderId);
  }

  refundOrder(orderId: string, reason = "", refundTradeNo = "") {
    return this.db.transaction(() => {
      const order = this.getOrder(orderId);
      if (!order) throw new Error("订单不存在");
      if (order.status === "refunded") return order;
      if (order.status !== "paid") throw new Error("只有已付款订单可以退款");
      const activeDeployment = this.db.prepare(`
        SELECT d.id FROM deployments d
        JOIN entitlements e ON e.id = d.entitlement_id
        WHERE e.source_order_id = ? AND d.status IN ('reserved', 'running', 'uncertain')
        LIMIT 1
      `).get(orderId);
      if (activeDeployment) throw new Error("该订单仍有执行中或待确认任务，请处理完成后再退款");
      this.db.prepare("UPDATE orders SET status = 'refunded', refunded_at = ?, refund_reason = ?, refund_trade_no = ?, updated_at = ? WHERE id = ?")
        .run(nowIso(), reason.slice(0, 500), refundTradeNo.slice(0, 200), nowIso(), orderId);
      this.db.prepare("UPDATE entitlements SET status = 'revoked' WHERE source_order_id = ?")
        .run(orderId);
      return this.getOrder(orderId);
    })();
  }

  expirePendingOrders() {
    const timestamp = nowIso();
    const result = this.db.prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?")
      .run(timestamp, timestamp);
    this.db.prepare("UPDATE payment_attempts SET status = 'closed', updated_at = ? WHERE status IN ('created', 'pending') AND order_id IN (SELECT id FROM orders WHERE status = 'expired')").run(timestamp);
    return result.changes;
  }

  createPaymentAttempt(orderId: string, provider: string, checkoutUrl: string, requestPayload: unknown, expiresAt?: string | null) {
    const id = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`INSERT INTO payment_attempts (id, order_id, provider, status, checkout_url, request_payload, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
      .run(id, orderId, provider, checkoutUrl, JSON.stringify(requestPayload || {}), expiresAt || null, timestamp, timestamp);
    return this.getPaymentAttempt(id)!;
  }

  createFailedPaymentAttempt(orderId: string, provider: string, requestPayload: unknown, error: unknown, expiresAt?: string | null) {
    const id = randomUUID();
    const timestamp = nowIso();
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.db.prepare(`INSERT INTO payment_attempts (id, order_id, provider, status, request_payload, error_message, expires_at, created_at, updated_at) VALUES (?, ?, ?, 'failed', ?, ?, ?, ?, ?)`)
      .run(id, orderId, provider, JSON.stringify(requestPayload || {}), errorMessage.slice(0, 1000), expiresAt || null, timestamp, timestamp);
    return this.getPaymentAttempt(id)!;
  }

  getPaymentAttempt(id: string) {
    return this.db.prepare(`SELECT id, order_id AS orderId, provider, status, provider_trade_no AS providerTradeNo,
      checkout_url AS checkoutUrl, error_message AS errorMessage, expires_at AS expiresAt, paid_at AS paidAt,
      created_at AS createdAt, updated_at AS updatedAt FROM payment_attempts WHERE id = ?`).get(id) as any;
  }

  listPaymentAttempts(orderId?: string) {
    return this.db.prepare(`SELECT pa.id, pa.order_id AS orderId, o.order_no AS orderNo, pa.provider, pa.status,
      pa.provider_trade_no AS providerTradeNo, pa.checkout_url AS checkoutUrl, pa.error_message AS errorMessage,
      pa.expires_at AS expiresAt, pa.paid_at AS paidAt, pa.created_at AS createdAt, pa.updated_at AS updatedAt
      FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id ${orderId ? "WHERE pa.order_id = ?" : ""}
      ORDER BY pa.created_at DESC LIMIT 500`).all(...(orderId ? [orderId] : []));
  }

  completePaymentAttempt(orderId: string, provider: string, tradeNo: string, payload: unknown) {
    return this.db.transaction(() => {
      const result = this.markOrderPaid(orderId, provider, tradeNo);
      this.db.prepare(`UPDATE payment_attempts SET status = 'paid', provider_trade_no = ?, response_payload = ?, paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE order_id = ? AND provider = ? AND status IN ('created', 'pending', 'paid')`)
        .run(tradeNo, JSON.stringify(payload || {}), nowIso(), nowIso(), orderId, provider);
      return result;
    })();
  }

  closeOpenPaymentAttempts(orderId: string) {
    this.db.prepare("UPDATE payment_attempts SET status = 'closed', updated_at = ? WHERE order_id = ? AND status IN ('created', 'pending')")
      .run(nowIso(), orderId);
  }

  recordPaymentNotification(channelId: string, provider: string, orderNo: string, status: "accepted" | "rejected", payload: unknown, errorMessage = "") {
    const sanitize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /sign|signature|ciphertext|private|secret|key/i.test(key) ? "[REDACTED]" : sanitize(item),
      ]));
    };
    this.db.prepare("INSERT INTO payment_notifications (id, channel_id, provider, order_no, status, payload, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), channelId, provider, orderNo.slice(0, 100), status, JSON.stringify(sanitize(payload || {})).slice(0, 20_000), errorMessage.slice(0, 1000), nowIso());
  }

  listPaymentNotifications() {
    return this.db.prepare(`SELECT id, channel_id AS channelId, provider, order_no AS orderNo, status,
      payload, error_message AS errorMessage, created_at AS createdAt
      FROM payment_notifications ORDER BY created_at DESC LIMIT 500`).all();
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
    for (const capability of ["panel", "node"] as Capability[]) {
      const mode = input[`${capability}Mode`];
      const amount = mode === "limited" ? input[`${capability}Limit`] : 0;
      if (mode !== "none") this.addLedger(userId, id, null, capability, "grant", amount, "管理员手工发放权益");
    }
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
    const result = this.db.prepare("UPDATE entitlements SET status = ? WHERE id = ?").run(status, id);
    if (!result.changes) throw new Error("权益不存在");
  }

  adjustEntitlement(id: string, input: {
    panelRemaining?: number;
    nodeRemaining?: number;
    dailyPanelLimit?: number;
    dailyNodeLimit?: number;
    concurrencyLimit?: number;
  }) {
    const entitlement = this.db.prepare("SELECT * FROM entitlements WHERE id = ?").get(id) as any;
    if (!entitlement) throw new Error("权益不存在");
    const values = {
      panelRemaining: input.panelRemaining ?? entitlement.panel_remaining,
      nodeRemaining: input.nodeRemaining ?? entitlement.node_remaining,
      dailyPanelLimit: input.dailyPanelLimit ?? entitlement.daily_panel_limit,
      dailyNodeLimit: input.dailyNodeLimit ?? entitlement.daily_node_limit,
      concurrencyLimit: input.concurrencyLimit ?? entitlement.concurrency_limit,
    };
    for (const [label, value] of [
      ["面板剩余次数", values.panelRemaining], ["节点剩余次数", values.nodeRemaining],
      ["每日面板上限", values.dailyPanelLimit], ["每日节点上限", values.dailyNodeLimit],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) throw new Error(`${label}必须为非负整数`);
    }
    if (!Number.isInteger(values.concurrencyLimit) || values.concurrencyLimit < 1) throw new Error("并发上限至少为 1");
    if (entitlement.panel_mode !== "limited" && input.panelRemaining !== undefined) throw new Error("只有限次面板权益可以调整剩余次数");
    if (entitlement.node_mode !== "limited" && input.nodeRemaining !== undefined) throw new Error("只有限次节点权益可以调整剩余次数");

    this.db.prepare(`
      UPDATE entitlements SET
        panel_remaining = ?, panel_total = CASE WHEN panel_mode = 'limited' THEN panel_used + panel_reserved + ? ELSE panel_total END,
        node_remaining = ?, node_total = CASE WHEN node_mode = 'limited' THEN node_used + node_reserved + ? ELSE node_total END,
        daily_panel_limit = ?, daily_node_limit = ?, concurrency_limit = ?
      WHERE id = ?
    `).run(
      values.panelRemaining, values.panelRemaining,
      values.nodeRemaining, values.nodeRemaining,
      values.dailyPanelLimit, values.dailyNodeLimit, values.concurrencyLimit, id,
    );
    if (entitlement.panel_mode === "limited" && values.panelRemaining !== entitlement.panel_remaining) {
      this.addLedger(entitlement.user_id, id, null, "panel", "adjust", values.panelRemaining - entitlement.panel_remaining, "管理员调整面板剩余次数");
    }
    if (entitlement.node_mode === "limited" && values.nodeRemaining !== entitlement.node_remaining) {
      this.addLedger(entitlement.user_id, id, null, "node", "adjust", values.nodeRemaining - entitlement.node_remaining, "管理员调整节点剩余次数");
    }
    return (this.listAllEntitlements() as any[]).find(item => item.id === id);
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

  listUsageLedger() {
    return this.db.prepare(`
      SELECT l.id, l.user_id AS userId, u.username, l.entitlement_id AS entitlementId,
        e.plan_name AS planName, l.deployment_id AS deploymentId, l.capability,
        l.action, l.amount, l.note, l.created_at AS createdAt
      FROM usage_ledger l
      JOIN users u ON u.id = l.user_id
      JOIN entitlements e ON e.id = l.entitlement_id
      ORDER BY l.created_at DESC LIMIT 500
    `).all();
  }

  recordAdminAction(adminUserId: string, action: string, targetType: string, targetId = "", detail = "") {
    this.db.prepare(`
      INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), adminUserId, action.slice(0, 80), targetType.slice(0, 40), targetId.slice(0, 128), detail.slice(0, 500), nowIso());
  }

  listAdminAuditLogs() {
    return this.db.prepare(`
      SELECT l.id, l.admin_user_id AS adminUserId, u.username AS adminUsername,
        l.action, l.target_type AS targetType, l.target_id AS targetId,
        l.detail, l.created_at AS createdAt
      FROM admin_audit_logs l
      JOIN users u ON u.id = l.admin_user_id
      ORDER BY l.created_at DESC LIMIT 500
    `).all();
  }

  getDashboardStats() {
    const now = nowIso();
    return {
      users: Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user'").get() as any).count),
      activeUsers: Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user' AND status = 'active'").get() as any).count),
      disabledUsers: Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'user' AND status = 'disabled'").get() as any).count),
      admins: Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as any).count),
      orders: Number((this.db.prepare("SELECT COUNT(*) AS count FROM orders").get() as any).count),
      pendingOrders: Number((this.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'").get() as any).count),
      paidOrders: Number((this.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'").get() as any).count),
      refundedOrders: Number((this.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'refunded'").get() as any).count),
      revenueCents: Number((this.db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM orders WHERE status = 'paid'").get() as any).total),
      entitlements: Number((this.db.prepare("SELECT COUNT(*) AS count FROM entitlements").get() as any).count),
      activeEntitlements: Number((this.db.prepare(`
        SELECT COUNT(*) AS count FROM entitlements
        WHERE status = 'active' AND starts_at <= ? AND (lifetime = 1 OR expires_at > ?)
      `).get(now, now) as any).count),
      expiredEntitlements: Number((this.db.prepare(`
        SELECT COUNT(*) AS count FROM entitlements
        WHERE status = 'active' AND lifetime = 0 AND expires_at <= ?
      `).get(now) as any).count),
      revokedEntitlements: Number((this.db.prepare("SELECT COUNT(*) AS count FROM entitlements WHERE status = 'revoked'").get() as any).count),
      deployments: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments").get() as any).count),
      running: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status IN ('reserved', 'running')").get() as any).count),
      succeeded: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status = 'succeeded'").get() as any).count),
      failed: Number((this.db.prepare("SELECT COUNT(*) AS count FROM deployments WHERE status = 'failed'").get() as any).count),
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
