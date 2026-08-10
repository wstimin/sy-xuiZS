export type UserRole = 'user' | 'admin';
export type QuotaMode = 'none' | 'limited' | 'unlimited';
export type DurationUnit = 'days' | 'months' | 'quarters' | 'years' | 'lifetime';
export type PaymentProvider = 'manual' | 'epay' | 'mgate' | 'tokenpay' | 'epusdt' | 'paypal' | 'alipay_official' | 'wechat_official';
export type PaymentMethodType = 'manual' | 'alipay' | 'wechat' | 'epay' | 'mgate' | 'tokenpay' | 'epusdt' | 'paypal';

export interface CurrentUser {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  status: 'active' | 'disabled';
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
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
  callbackUrl?: string;
  appId?: string;
  privateKey?: string;
  privateKeyConfigured?: boolean;
  publicKey?: string;
  certificateSerial?: string;
  apiV3Key?: string;
  apiV3KeyConfigured?: boolean;
  sandbox?: boolean;
}

export interface PaymentAttempt {
  id: string;
  orderId: string;
  orderNo: string;
  provider: string;
  status: 'created' | 'pending' | 'paid' | 'failed' | 'closed';
  providerOrderId?: string;
  providerTradeNo?: string;
  checkoutUrl?: string;
  errorMessage?: string;
  expiresAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentNotification {
  id: string;
  channelId: string;
  provider: string;
  orderNo: string;
  status: 'accepted' | 'rejected';
  payload: string;
  errorMessage: string;
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  provider: string;
  eventKey: string;
  payload: string;
  createdAt: string;
}

export interface PaymentCheckout {
  attemptId: string;
  checkoutType: 'redirect' | 'qrcode';
  checkoutUrl: string;
}

export interface EmailSettings {
  emailEnabled: boolean;
  emailVerificationRequired: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: 'none' | 'starttls' | 'ssl';
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

export type ContactMethodType = 'wechat' | 'qq' | 'telegram' | 'whatsapp' | 'wecom' | 'email' | 'phone' | 'discord' | 'line' | 'custom';

export interface ContactMethod {
  id: string;
  type: ContactMethodType;
  enabled: boolean;
  name: string;
  value: string;
  contactUrl: string;
  qrCodeUrl: string;
  qrCodeUploaded: boolean;
  sortOrder: number;
}

export interface ContactSettings {
  enabled: boolean;
  buttonLabel: string;
  title: string;
  description: string;
  methods: ContactMethod[];
}

export type ResourceRecommendationCategory = 'server' | 'residential_ip';

export interface ResourceRecommendation {
  id: string;
  category: ResourceRecommendationCategory;
  enabled: boolean;
  name: string;
  description: string;
  logoUrl: string;
  logoUploaded: boolean;
  badge: string;
  purchaseUrl: string;
  buttonLabel: string;
  openInNewTab: boolean;
  sortOrder: number;
}

export interface ResourceRecommendationSettings {
  serverEnabled: boolean;
  residentialIpEnabled: boolean;
  items: ResourceRecommendation[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
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
  homepageVisible: boolean;
  sortOrder: number;
}

export interface Entitlement {
  id: string;
  userId?: string;
  username?: string;
  sourceOrderId?: string;
  planName: string;
  startsAt: string;
  expiresAt: string | null;
  lifetime: boolean;
  panelMode: QuotaMode;
  panelTotal: number;
  panelRemaining: number;
  panelReserved: number;
  panelUsed: number;
  nodeMode: QuotaMode;
  nodeTotal: number;
  nodeRemaining: number;
  nodeReserved: number;
  nodeUsed: number;
  dailyPanelLimit: number;
  dailyNodeLimit: number;
  concurrencyLimit: number;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  username?: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';
  amountCents: number;
  planSnapshot: string;
  paymentProvider: string;
  paymentChannel?: string;
  paymentOptionId?: string;
  paymentTradeNo?: string;
  createdAt: string;
  paidAt?: string;
  expiresAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
  refundTradeNo?: string;
  cancelReason?: string;
  refundReason?: string;
  diagnosis?: OrderDetail['diagnosis'];
}

export interface OrderDetail {
  order: Order & { email?: string | null };
  attempts: PaymentAttempt[];
  notifications: PaymentNotification[];
  paymentEvents: PaymentEvent[];
  entitlements: Entitlement[];
  redeemCode: null | {
    id: string;
    codeMasked: string;
    note: string;
    redeemedAt: string;
  };
  diagnosis: {
    processingStatus: string;
    processingLabel: string;
    severity: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
    recommendedAction: string;
    canRepairEntitlement: boolean;
    failedAttemptCount: number;
    rejectedNotificationCount: number;
  };
}

export interface AdminExceptionItem {
  id: string;
  type: string;
  severity: 'warning' | 'danger';
  title: string;
  description: string;
  targetType: 'order' | 'deployment';
  targetId: string;
  createdAt: string;
  order?: Order;
  deployment?: DeploymentRecord;
}

export interface AdminExceptions {
  summary: { total: number; critical: number; warning: number };
  items: AdminExceptionItem[];
}

export interface PaymentCheckResult {
  methodId: string;
  provider: string;
  status: 'ready' | 'disabled' | 'incomplete' | 'unreachable' | 'invalid';
  message: string;
  details: string[];
  checkedAt: string;
}

export interface DatabaseBackupValidation {
  valid: true;
  sizeBytes: number;
  counts: Record<string, number>;
}

export interface DeploymentRecord {
  id: string;
  requestId: string;
  userId: string;
  username?: string;
  capability: 'panel' | 'node';
  status: 'reserved' | 'running' | 'succeeded' | 'failed' | 'uncertain';
  quotaMode: 'limited' | 'unlimited';
  targetHostMasked: string;
  resultSummary: string;
  errorMessage: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AccountData {
  user: CurrentUser;
  entitlements: Entitlement[];
  orders: Order[];
  deployments: DeploymentRecord[];
  paymentInstructions: string;
  paymentMethods: PaymentMethod[];
  redeemCodePurchaseUrl: string;
}

export interface RedeemCode {
  id: string;
  codeMasked: string;
  planId: string;
  planName: string;
  status: 'active' | 'redeemed' | 'disabled' | 'expired';
  note: string;
  redeemedByUserId?: string;
  redeemedByUsername?: string;
  orderId?: string;
  entitlementId?: string;
  redeemedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `请求失败（HTTP ${response.status}）`, response.status, data.code);
  return data as T;
}

export function formatMoney(cents: number) {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function formatDate(value?: string | null) {
  if (!value) return '永久有效';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function quotaText(mode: QuotaMode, remaining: number, total?: number) {
  if (mode === 'none') return '不包含';
  if (mode === 'unlimited') return '不限次数';
  return total === undefined ? `${remaining} 次` : `${remaining} / ${total} 次`;
}

export function activeCapability(entitlements: Entitlement[], capability: 'panel' | 'node') {
  const now = Date.now();
  return entitlements.filter(item => item.status === 'active' && (!item.expiresAt || new Date(item.expiresAt).getTime() > now))
    .filter(item => item[`${capability}Mode`] !== 'none')
    .filter(item => item[`${capability}Mode`] === 'unlimited' || item[`${capability}Remaining`] > 0);
}
