import type {
  Entitlement,
  Order,
  PaymentCheckResult,
  PaymentMethod,
  PaymentProvider,
  Plan,
} from '../../commercial';
import type { AdminUser } from './adminModel';
import {
  LEGACY_TOKENPAY_CURRENCIES,
  TOKENPAY_CURRENCIES,
} from './adminModel';

export function entitlementStatus(item: Entitlement) {
  if (item.status === 'revoked') return 'revoked';
  if (!item.lifetime && item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

export function paymentCheckLabel(status: PaymentCheckResult['status']) {
  return {
    ready: '检测通过',
    disabled: '渠道已停用',
    incomplete: '配置不完整',
    unreachable: '网关不可达',
    invalid: '配置无效',
  }[status];
}

export function durationText(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', quarters: '个季度', years: '年' };
  return `${plan.durationValue} ${units[plan.durationUnit]}`;
}

export function paymentProviderText(method: PaymentMethod) {
  return paymentProviderName(paymentProvider(method));
}

export function paymentChannelText(method: PaymentMethod) {
  const provider = paymentProvider(method);
  if (provider === 'epay') {
    const channels: Record<string, string> = { alipay: '支付宝', wxpay: '微信支付', qqpay: 'QQ 钱包', paypal: 'PayPal', 'usdt.trc20': 'USDT' };
    const enabled = method.enabledChannels || [method.channel || 'alipay'];
    return enabled.map(channel => channels[channel] || channel).join('、') || '未启用支付方式';
  }
  if (provider === 'tokenpay') return tokenPayCurrency(method).replace('_', '-').replace('_', '-');
  if (provider === 'epusdt') return 'USDT-TRC20';
  if (provider === 'paypal') return method.sandbox ? 'PayPal 沙箱' : 'PayPal Orders v2';
  if (provider === 'alipay_official') return '当面付二维码';
  if (provider === 'wechat_official') return 'Native 二维码';
  return method.currency || 'CNY';
}

export function tokenPayCurrency(method: PaymentMethod) {
  const values = [...TOKENPAY_CURRENCIES.map(item => item.value), ...LEGACY_TOKENPAY_CURRENCIES] as readonly string[];
  const configured = String(method.currency || '').toUpperCase().replace(/-/g, '_');
  if (values.includes(configured)) return configured;
  const legacy = String(method.merchantId || '').toUpperCase().replace(/-/g, '_');
  return values.includes(legacy) ? legacy : 'USDT_TRC20';
}

export function isLegacyTokenPayCurrency(method: PaymentMethod) {
  return (LEGACY_TOKENPAY_CURRENCIES as readonly string[]).includes(tokenPayCurrency(method));
}

export function defaultPaymentCurrency(provider: PaymentProvider, method: PaymentMethod) {
  if (provider === 'tokenpay') return tokenPayCurrency(method);
  if (provider === 'epusdt') return 'USDT-TRC20';
  if (provider === 'paypal') return 'CNY';
  return 'CNY';
}

export function paymentProvider(method: PaymentMethod): PaymentProvider {
  if (method.provider) return method.provider;
  if (method.type === 'alipay') return 'alipay_official';
  if (method.type === 'wechat') return 'wechat_official';
  if (method.type === 'epay' || method.type === 'mgate' || method.type === 'tokenpay' || method.type === 'epusdt' || method.type === 'paypal') return method.type;
  return 'epay';
}

export function legacyPaymentType(provider: PaymentProvider): PaymentMethod['type'] {
  if (provider === 'alipay_official') return 'alipay';
  if (provider === 'wechat_official') return 'wechat';
  return provider;
}

export const EPAY_CHANNEL_OPTIONS = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wxpay', label: '微信支付' },
  { value: 'qqpay', label: 'QQ 钱包' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'usdt.trc20', label: 'USDT' },
] as const;

export function paymentProviderName(provider: string) {
  const labels: Record<string, string> = { redeem_code: '金额卡密直购', external_redeem: '第三方卡密', balance: '账户余额', epay: '易支付聚合', mgate: 'MGate', tokenpay: 'USDT / TokenPay', epusdt: 'USDT / Epusdt', paypal: 'PayPal 官方', alipay_official: '支付宝官方', wechat_official: '微信支付官方' };
  return labels[provider] || provider;
}

export function paymentChannelName(channelId: string, methods: PaymentMethod[]) {
  return methods.find(method => method.id === channelId)?.name || channelId;
}

export function planSnapshotName(order: Order) {
  return String(parsePlanSnapshot(order).name || '套餐快照');
}

export function parsePlanSnapshot(order: Order): Record<string, unknown> {
  try {
    const value = JSON.parse(order.planSnapshot);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

const auditFieldLabels: Record<string, string> = {
  registrationEnabled: '开放注册',
  panelDeployEnabled: '面板搭建',
  nodeDeployEnabled: '节点创建',
  redeemCodePurchaseUrl: '卡密购买链接',
  paymentMethods: '支付方式',
  contact: '咨询联系方式',
  recommendations: '资源推荐',
  adminPath: '管理入口',
  status: '状态',
  role: '角色',
  amountCents: '金额',
  quantity: '数量',
  note: '备注',
  resolution: '处理结果',
};

function auditValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? '已开启' : '已关闭';
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '无';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => `${auditFieldLabels[childKey] || childKey}：${auditValue(childKey, childValue)}`)
      .join('；');
  }
  if (key === 'amountCents' && Number.isFinite(Number(value))) return `¥${(Number(value) / 100).toFixed(2)}`;
  if (value === 'manual') return '人工收款';
  return String(value);
}

export function auditActionText(action: string) {
  const labels: Record<string, string> = {
    update_settings: '更新系统设置',
    check_payment: '检测支付渠道',
    manual: '人工收款',
  };
  return labels[action] || action.replace(/\bmanual\b/gi, '人工收款');
}

export function auditDetail(value: string) {
  if (!value) return '-';
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${auditFieldLabels[key] || key}：${auditValue(key, item)}`).join('；');
  } catch {
    let readable = value.replace(/\[object Object\]/g, '已配置').replace(/\[updated\]/g, '已更新').replace(/\bmanual\b/gi, '人工收款');
    for (const [key, label] of Object.entries(auditFieldLabels)) {
      readable = readable.replace(new RegExp(`\\b${key}\\s*:`), `${label}：`);
    }
    return readable
      .replace(/人工收款方式已启用，无需检测支付网关/g, '历史人工收款配置（已停用）')
      .replace(/:\s*true\b/g, '：已开启')
      .replace(/:\s*false\b/g, '：已关闭');
  }
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const escapeCell = (value: unknown) => {
    const normalized = value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    return `"${normalized.replace(/"/g, '""')}"`;
  };
  const content = [columns.map(escapeCell).join(','), ...rows.map(row => columns.map(column => escapeCell(row[column])).join(','))].join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function userActionTitle(action: typeof undefined | { user: AdminUser; kind: 'status' | 'role' | 'password'; nextValue?: string } | null) {
  if (!action) return '';
  if (action.kind === 'password') return `重置 ${action.user.username} 的密码`;
  if (action.kind === 'status') return action.nextValue === 'disabled' ? `禁用用户 ${action.user.username}` : `启用用户 ${action.user.username}`;
  return action.nextValue === 'admin' ? `授予 ${action.user.username} 管理员权限` : `移除 ${action.user.username} 的管理员权限`;
}

export function userActionDescription(action: typeof undefined | { user: AdminUser; kind: 'status' | 'role' | 'password'; nextValue?: string } | null) {
  if (!action) return '';
  if (action.kind === 'password') return '重置后，该用户的所有现有登录会话会立即失效。';
  if (action.kind === 'status' && action.nextValue === 'disabled') return '禁用后该用户会立即退出登录，且不能继续使用用户端接口。';
  if (action.kind === 'status') return '启用后该用户可以重新登录并使用其有效权益。';
  if (action.nextValue === 'admin') return '管理员账号可以登录管理后台并执行收款、退款、调额等高权限操作。';
  return '移除后该账号只能作为普通用户登录，不能再访问管理后台。';
}
