import type React from 'react';
import {
  Activity,
  BadgeCheck,
  Boxes,
  ClipboardCheck,
  CreditCard,
  FileText,
  KeyRound,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';
import type {
  AdminExceptions,
  ContactMethod,
  ContactSettings,
  DeploymentRecord,
  EmailSettings,
  ExternalRedeemSettings,
  Entitlement,
  Order,
  PaymentMethod,
  Plan,
  RedeemCode,
  ResourceRecommendation,
  ResourceRecommendationSettings,
} from '../../commercial';

export type AdminTab = 'dashboard' | 'orders' | 'plans' | 'redeem-codes' | 'users' | 'entitlements' | 'ledger' | 'deployments' | 'audit' | 'settings' | 'security';
export type SettingsSection = 'general' | 'recommendations' | 'email' | 'payments';
export type SettingsDialog = 'order' | 'redeem' | 'contact' | 'smtp' | 'sender' | 'verification' | 'test-email' | null;
export type AdminUser = { id: string; username: string; email: string | null; emailVerified: boolean; role: 'user' | 'admin'; status: 'active' | 'disabled'; createdAt: string; lastLoginAt?: string };
export type UsageLedgerEntry = { id: string; userId: string; username: string; entitlementId: string; planName: string; deploymentId?: string; capability: 'panel' | 'node'; action: 'grant' | 'reserve' | 'consume' | 'release' | 'adjust'; amount: number; note: string; createdAt: string };
export type AuditLog = { id: string; adminUserId: string; adminUsername: string; action: string; targetType: string; targetId: string; detail: string; createdAt: string };
export type UserDetail = { user: AdminUser; orders: Order[]; entitlements: Entitlement[]; deployments: DeploymentRecord[] };
export type UserProfileTab = 'overview' | 'entitlements' | 'orders' | 'deployments' | 'ledger';
export type Stats = {
  users: number;
  activeUsers: number;
  disabledUsers: number;
  admins: number;
  orders: number;
  pendingOrders: number;
  paidOrders: number;
  refundedOrders: number;
  revenueCents: number;
  entitlements: number;
  activeEntitlements: number;
  expiredEntitlements: number;
  revokedEntitlements: number;
  deployments: number;
  running: number;
  succeeded: number;
  failed: number;
  uncertain: number;
};
export type SystemSettings = { registrationEnabled: boolean; panelDeployEnabled: boolean; nodeDeployEnabled: boolean; paymentInstructions: string; paymentMethods: PaymentMethod[]; email: EmailSettings; orderExpiryMinutes: number; adminPath: string; redeemCodePurchaseUrl: string; externalRedeem: ExternalRedeemSettings; contact: ContactSettings; recommendations: ResourceRecommendationSettings };
export type CreatedRedeemCode = RedeemCode & { code: string };
export type SystemVersionStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  canAutoUpdate: boolean;
  deploymentMode: 'managed-linux' | '1panel' | 'development';
  reason: string;
  releaseUrl: string;
  state: 'idle' | 'scheduled' | 'running' | 'succeeded' | 'failed';
  progress: number;
  stage?: string;
  targetVersion?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
};

export const PAGE_SIZE = 10;
export const emptyPlan: Omit<Plan, 'id'> = {
  name: '',
  description: '',
  priceCents: 990,
  durationUnit: 'lifetime',
  durationValue: 0,
  panelMode: 'limited',
  panelLimit: 1,
  nodeMode: 'limited',
  nodeLimit: 3,
  dailyPanelLimit: 0,
  dailyNodeLimit: 0,
  concurrencyLimit: 1,
  enabled: true,
  homepageVisible: false,
  sortOrder: 10,
};
export const emptyGrant = {
  userId: '',
  name: '管理员发放权益',
  durationUnit: 'lifetime',
  durationValue: 0,
  panelMode: 'limited',
  panelLimit: 1,
  nodeMode: 'limited',
  nodeLimit: 5,
  dailyPanelLimit: 0,
  dailyNodeLimit: 0,
  concurrencyLimit: 1,
};
export const emptyUser = { username: '', email: '', password: '', role: 'user' as 'user' | 'admin' };
export const emptyPaymentMethod = (): PaymentMethod => ({ id: `method-${Date.now()}`, name: '易支付', type: 'epay', provider: 'epay', enabled: true, instructions: '', paymentUrl: '', gatewayUrl: '', merchantId: '', merchantSecret: '', merchantSecretConfigured: false, channel: 'alipay', enabledChannels: ['alipay'], currency: 'CNY', sortOrder: 10 });
export const emptyEmailSettings: EmailSettings = { emailEnabled: false, emailVerificationRequired: false, smtpHost: '', smtpPort: 465, smtpEncryption: 'ssl', smtpUsername: '', smtpPassword: '', smtpPasswordConfigured: false, smtpFromName: 'xui面板一键搭建助手', smtpFromEmail: '', smtpReplyTo: '', verificationCodeTtlMinutes: 10, verificationResendSeconds: 60, siteName: 'xui面板一键搭建助手', publicBaseUrl: '' };
export const emptyExternalRedeemSettings: ExternalRedeemSettings = { provider: 'generic_json', enabled: false, name: '第三方卡密', apiUrl: '', appKey: '', apiKey: '', apiKeyConfigured: false, authMode: 'bearer', amountUnit: 'cents', timeoutSeconds: 10, allowPrivateNetwork: false };
export const emptyContactSettings: ContactSettings = { enabled: false, buttonLabel: '立即咨询', title: '联系站长', description: '', methods: [] };
export const contactTypeLabels: Record<ContactMethod['type'], string> = {
  wechat: '微信',
  qq: 'QQ',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  wecom: '企业微信',
  email: '邮箱',
  phone: '电话',
  discord: 'Discord',
  line: 'LINE',
  custom: '自定义',
};
export const emptyContactMethod = (): ContactMethod => ({
  id: `contact-${Date.now().toString(36)}`,
  type: 'wechat',
  enabled: true,
  name: '微信',
  value: '',
  contactUrl: '',
  qrCodeUrl: '',
  qrCodeUploaded: false,
  sortOrder: 10,
});
export const emptyRecommendationSettings: ResourceRecommendationSettings = { serverEnabled: true, residentialIpEnabled: true, items: [] };
export const emptyRecommendation = (): ResourceRecommendation => ({
  id: `resource-${Date.now().toString(36)}`,
  category: 'server',
  enabled: true,
  name: '',
  description: '',
  logoUrl: '',
  logoUploaded: false,
  badge: '',
  purchaseUrl: '',
  buttonLabel: '了解详情',
  openInNewTab: true,
  sortOrder: 10,
});
export const TOKENPAY_CURRENCIES = [
  { value: 'USDT_TRC20', label: 'USDT-TRC20' },
  { value: 'USDT_ERC20', label: 'USDT-ERC20' },
] as const;
export const LEGACY_TOKENPAY_CURRENCIES = ['TRX', 'ETH', 'USDC_ERC20'] as const;
export const MGATE_CURRENCIES = ['CNY', 'USD', 'EUR', 'HKD', 'TWD', 'JPY', 'KRW', 'SGD'] as const;
export const emptyAdminExceptions: AdminExceptions = { summary: { total: 0, critical: 0, warning: 0 }, items: [] };
export const PORTABLE_BACKUP_CONTENT_TYPE = 'application/vnd.xui-portable-backup';

export const navigationGroups: Array<{ label: string; items: Array<{ id: AdminTab; label: string; icon: React.ElementType; tone: string }> }> = [
  { label: '工作台', items: [{ id: 'dashboard', label: '运营概览', icon: LayoutDashboard, tone: 'cyan' }] },
  { label: '客户', items: [
    { id: 'users', label: '客户列表', icon: Users, tone: 'blue' },
    { id: 'entitlements', label: '权益管理', icon: BadgeCheck, tone: 'emerald' },
  ] },
  { label: '交易', items: [
    { id: 'orders', label: '订单管理', icon: CreditCard, tone: 'green' },
    { id: 'plans', label: '套餐管理', icon: Boxes, tone: 'violet' },
    { id: 'redeem-codes', label: '卡密管理', icon: KeyRound, tone: 'amber' },
  ] },
  { label: '交付', items: [
    { id: 'deployments', label: '搭建任务', icon: Activity, tone: 'amber' },
    { id: 'ledger', label: '额度流水', icon: FileText, tone: 'sky' },
  ] },
  { label: '系统', items: [
    { id: 'settings', label: '系统设置', icon: Settings, tone: 'indigo' },
    { id: 'audit', label: '操作审计', icon: ClipboardCheck, tone: 'slate' },
    { id: 'security', label: '账号安全', icon: KeyRound, tone: 'rose' },
  ] },
];
export const navigation = navigationGroups.flatMap(group => group.items);

export const adminTabMeta: Record<AdminTab, { area: string; description: string }> = {
  dashboard: { area: '工作台', description: '业务指标、异常和待处理事项' },
  orders: { area: '交易', description: '订单状态、支付链路和权益发放' },
  plans: { area: '交易', description: '套餐价格、有效期和使用额度' },
  'redeem-codes': { area: '交易', description: '卡密生成、兑换和停用记录' },
  users: { area: '客户', description: '客户身份、状态和关联业务数据' },
  entitlements: { area: '客户', description: '客户权益、剩余额度和有效期' },
  ledger: { area: '交付', description: '额度发放、冻结、核销和返还流水' },
  deployments: { area: '交付', description: '面板安装和节点创建任务' },
  audit: { area: '系统', description: '管理员关键操作与变更记录' },
  settings: { area: '系统', description: '业务、推荐、邮箱和支付配置' },
  security: { area: '系统', description: '管理员身份、入口和数据安全' },
};

export const adminCommands: Array<{ id: string; label: string; description: string; tab: AdminTab; section?: SettingsSection }> = [
  ...navigation.map(item => ({ id: `tab-${item.id}`, label: item.label, description: adminTabMeta[item.id].description, tab: item.id })),
  { id: 'settings-general', label: '基础业务设置', description: '注册、搭建开关、订单和客服入口', tab: 'settings', section: 'general' },
  { id: 'settings-recommendations', label: '资源推荐设置', description: '服务器与住宅 IP 推荐资源', tab: 'settings', section: 'recommendations' },
  { id: 'settings-email', label: '邮件与验证设置', description: 'SMTP、发件身份和验证码规则', tab: 'settings', section: 'email' },
  { id: 'settings-payments', label: '支付渠道设置', description: '在线支付、回调和卡密模式', tab: 'settings', section: 'payments' },
  { id: 'security-backup', label: '完整备份与迁移', description: '下载、校验并恢复跨服务器备份', tab: 'security' },
  { id: 'security-update', label: '版本与自动更新', description: '检查官方版本并启动安全更新', tab: 'security' },
];
