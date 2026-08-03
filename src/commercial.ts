export type UserRole = 'user' | 'admin';
export type QuotaMode = 'none' | 'limited' | 'unlimited';
export type DurationUnit = 'days' | 'months' | 'years' | 'lifetime';

export interface CurrentUser {
  id: string;
  username: string;
  role: UserRole;
  status: 'active' | 'disabled';
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
  sortOrder: number;
}

export interface Entitlement {
  id: string;
  userId?: string;
  username?: string;
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
  paymentTradeNo?: string;
  createdAt: string;
  paidAt?: string;
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
