import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardCheck,
  ClipboardCopy,
  CreditCard,
  Download,
  Eye,
  ExternalLink,
  FileClock,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Network,
  PackagePlus,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  api,
  CurrentUser,
  DeploymentRecord,
  Entitlement,
  formatDate,
  formatMoney,
  Order,
  PaymentAttempt,
  PaymentMethod,
  PaymentNotification,
  PaymentProvider,
  EmailSettings,
  Plan,
  RedeemCode,
  quotaText,
} from '../commercial';
import { copyToClipboard } from '../utils/clipboard';
import { ChangePasswordForm } from './ChangePasswordForm';
import { AdminDialog } from './admin/AdminDialog';

type AdminTab = 'dashboard' | 'orders' | 'plans' | 'redeem-codes' | 'users' | 'entitlements' | 'ledger' | 'deployments' | 'audit' | 'settings' | 'security';
type SettingsSection = 'general' | 'email' | 'payments';
type SettingsDialog = 'order' | 'smtp' | 'sender' | 'verification' | 'test-email' | null;
type AdminUser = { id: string; username: string; email: string | null; emailVerified: boolean; role: 'user' | 'admin'; status: 'active' | 'disabled'; createdAt: string; lastLoginAt?: string };
type UsageLedgerEntry = { id: string; userId: string; username: string; entitlementId: string; planName: string; deploymentId?: string; capability: 'panel' | 'node'; action: 'grant' | 'reserve' | 'consume' | 'release' | 'adjust'; amount: number; note: string; createdAt: string };
type AuditLog = { id: string; adminUserId: string; adminUsername: string; action: string; targetType: string; targetId: string; detail: string; createdAt: string };
type UserDetail = { user: AdminUser; orders: Order[]; entitlements: Entitlement[]; deployments: DeploymentRecord[] };
type Stats = {
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
type SystemSettings = { registrationEnabled: boolean; panelDeployEnabled: boolean; nodeDeployEnabled: boolean; paymentInstructions: string; paymentMethods: PaymentMethod[]; email: EmailSettings; orderExpiryMinutes: number; adminPath: string; redeemCodePurchaseUrl: string };
type CreatedRedeemCode = RedeemCode & { code: string };

const PAGE_SIZE = 10;
const emptyPlan: Omit<Plan, 'id'> = {
  name: '',
  description: '',
  priceCents: 990,
  durationUnit: 'days',
  durationValue: 7,
  panelMode: 'limited',
  panelLimit: 1,
  nodeMode: 'limited',
  nodeLimit: 3,
  dailyPanelLimit: 1,
  dailyNodeLimit: 3,
  concurrencyLimit: 1,
  enabled: true,
  sortOrder: 10,
};
const emptyGrant = {
  userId: '',
  name: '管理员发放权益',
  durationUnit: 'months',
  durationValue: 1,
  panelMode: 'limited',
  panelLimit: 1,
  nodeMode: 'limited',
  nodeLimit: 5,
  dailyPanelLimit: 1,
  dailyNodeLimit: 5,
  concurrencyLimit: 1,
};
const emptyUser = { username: '', email: '', password: '', role: 'user' as 'user' | 'admin' };
const emptyPaymentMethod = (): PaymentMethod => ({ id: `method-${Date.now()}`, name: '易支付', type: 'epay', provider: 'epay', enabled: true, instructions: '', paymentUrl: '', gatewayUrl: '', merchantId: '', merchantSecret: '', merchantSecretConfigured: false, channel: 'alipay', enabledChannels: ['alipay'], currency: 'CNY', sortOrder: 10 });
const emptyEmailSettings: EmailSettings = { emailEnabled: false, emailVerificationRequired: false, smtpHost: '', smtpPort: 465, smtpEncryption: 'ssl', smtpUsername: '', smtpPassword: '', smtpPasswordConfigured: false, smtpFromName: 'NEXUS CLOUD', smtpFromEmail: '', smtpReplyTo: '', verificationCodeTtlMinutes: 10, verificationResendSeconds: 60, siteName: 'NEXUS CLOUD', publicBaseUrl: '' };
const TOKENPAY_CURRENCIES = [
  { value: 'USDT_TRC20', label: 'USDT-TRC20' },
  { value: 'USDT_ERC20', label: 'USDT-ERC20' },
] as const;
const LEGACY_TOKENPAY_CURRENCIES = ['TRX', 'ETH', 'USDC_ERC20'] as const;
const MGATE_CURRENCIES = ['CNY', 'USD', 'EUR', 'HKD', 'TWD', 'JPY', 'KRW', 'SGD'] as const;

const navigation: Array<{ id: AdminTab; label: string; icon: React.ElementType; tone: string; section?: string }> = [
  { id: 'dashboard', label: '运营概览', icon: LayoutDashboard, tone: 'cyan' },
  { id: 'orders', label: '订单管理', icon: CreditCard, tone: 'green', section: '业务管理' },
  { id: 'plans', label: '套餐管理', icon: Boxes, tone: 'violet' },
  { id: 'redeem-codes', label: '卡密管理', icon: KeyRound, tone: 'amber' },
  { id: 'users', label: '用户管理', icon: Users, tone: 'blue' },
  { id: 'entitlements', label: '权益管理', icon: BadgeCheck, tone: 'emerald' },
  { id: 'ledger', label: '额度流水', icon: FileText, tone: 'sky' },
  { id: 'deployments', label: '交付任务', icon: Activity, tone: 'amber' },
  { id: 'audit', label: '操作审计', icon: ClipboardCheck, tone: 'slate', section: '安全与系统' },
  { id: 'settings', label: '系统设置', icon: Settings, tone: 'indigo' },
  { id: 'security', label: '账号安全', icon: KeyRound, tone: 'rose' },
];

interface AdminViewProps {
  currentUser: CurrentUser;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onLogout: () => void;
  onSessionEnded: () => void;
  onCurrentUserChanged: (user: CurrentUser) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ currentUser, showToast, onLogout, onSessionEnded, onCurrentUserChanged }) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<UsageLedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
  const [paymentNotifications, setPaymentNotifications] = useState<PaymentNotification[]>([]);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [settingsData, setSettingsData] = useState<SystemSettings>({ registrationEnabled: true, panelDeployEnabled: true, nodeDeployEnabled: true, paymentInstructions: '', paymentMethods: [], email: emptyEmailSettings, orderExpiryMinutes: 30, adminPath: 'admin', redeemCodePurchaseUrl: '' });
  const [accountUsername, setAccountUsername] = useState(currentUser.username);
  const [adminPathDraft, setAdminPathDraft] = useState('admin');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsDialog, setSettingsDialog] = useState<SettingsDialog>(null);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<{ index: number; method: PaymentMethod } | null>(null);
  const [deletingPaymentMethod, setDeletingPaymentMethod] = useState<{ index: number; method: PaymentMethod } | null>(null);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editingPlan, setEditingPlan] = useState<(Omit<Plan, 'id'> & { id?: string }) | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [tradeNo, setTradeNo] = useState('');
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundTradeNo, setRefundTradeNo] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [userAction, setUserAction] = useState<{ user: AdminUser; kind: 'status' | 'role' | 'password'; nextValue?: string } | null>(null);
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState(emptyGrant);
  const [editingEntitlement, setEditingEntitlement] = useState<Entitlement | null>(null);
  const [entitlementAction, setEntitlementAction] = useState<Entitlement | null>(null);
  const [deploymentAction, setDeploymentAction] = useState<{ item: DeploymentRecord; resolution: 'succeeded' | 'failed' } | null>(null);
  const [creatingUser, setCreatingUser] = useState<null | typeof emptyUser>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [viewDeployment, setViewDeployment] = useState<DeploymentRecord | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [redeemCodeDraft, setRedeemCodeDraft] = useState({ planId: '', quantity: 10, note: '', expiresAt: '' });
  const [redeemCodeDialogOpen, setRedeemCodeDialogOpen] = useState(false);
  const [createdRedeemCodes, setCreatedRedeemCodes] = useState<CreatedRedeemCode[]>([]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [statsResult, plansResult, ordersResult, usersResult, entitlementResult, deploymentResult, ledgerResult, auditResult, settingsResult, attemptResult, notificationResult, redeemCodeResult] = await Promise.all([
        api<{ stats: Stats }>('/api/admin/stats'),
        api<{ plans: Plan[] }>('/api/admin/plans'),
        api<{ orders: Order[] }>('/api/admin/orders'),
        api<{ users: AdminUser[] }>('/api/admin/users'),
        api<{ entitlements: Entitlement[] }>('/api/admin/entitlements'),
        api<{ deployments: DeploymentRecord[] }>('/api/admin/deployments'),
        api<{ entries: UsageLedgerEntry[] }>('/api/admin/usage-ledger'),
        api<{ logs: AuditLog[] }>('/api/admin/audit-logs'),
        api<{ settings: SystemSettings }>('/api/admin/settings'),
        api<{ attempts: PaymentAttempt[] }>('/api/admin/payment-attempts'),
        api<{ notifications: PaymentNotification[] }>('/api/admin/payment-notifications'),
        api<{ redeemCodes: RedeemCode[] }>('/api/admin/redeem-codes'),
      ]);
      setStats(statsResult.stats);
      setPlans(plansResult.plans);
      setOrders(ordersResult.orders);
      setUsers(usersResult.users);
      setEntitlements(entitlementResult.entitlements);
      setDeployments(deploymentResult.deployments);
      setLedgerEntries(ledgerResult.entries);
      setAuditLogs(auditResult.logs);
      setPaymentAttempts(attemptResult.attempts);
      setPaymentNotifications(notificationResult.notifications);
      setRedeemCodes(redeemCodeResult.redeemCodes);
      setSettingsData(settingsResult.settings);
      setAdminPathDraft(settingsResult.settings.adminPath);
      if (!grant.userId && usersResult.users.length) {
        setGrant(value => ({ ...value, userId: usersResult.users.find(user => user.role === 'user')?.id || usersResult.users[0].id }));
      }
      if (!redeemCodeDraft.planId && plansResult.plans.length) {
        setRedeemCodeDraft(value => ({ ...value, planId: plansResult.plans.find(plan => plan.enabled)?.id || plansResult.plans[0].id }));
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 401) onSessionEnded();
      else showToast('管理数据加载失败', error instanceof Error ? error.message : '请刷新后重试', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { setAccountUsername(currentUser.username); }, [currentUser.username]);
  useEffect(() => { setQuery(''); setStatusFilter('all'); setPage(1); setMobileNavOpen(false); }, [tab]);

  const runAction = async (title: string, url: string, options: RequestInit, after?: () => void) => {
    setBusy(true);
    try {
      await api(url, options);
      await load(true);
      after?.();
      showToast(title, '数据库数据已更新', 'success');
      return true;
    } catch (error) {
      showToast('操作失败', error instanceof Error ? error.message : '请稍后重试', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOrders = useMemo(() => orders.filter(order => {
    const matchesQuery = !normalizedQuery || `${order.orderNo} ${order.username || ''} ${order.paymentTradeNo || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || order.status === statusFilter);
  }), [normalizedQuery, orders, statusFilter]);
  const filteredPlans = useMemo(() => plans.filter(plan => {
    const matchesQuery = !normalizedQuery || `${plan.name} ${plan.description}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || (statusFilter === 'enabled' ? plan.enabled : !plan.enabled));
  }), [normalizedQuery, plans, statusFilter]);
  const filteredRedeemCodes = useMemo(() => redeemCodes.filter(item => {
    const matchesQuery = !normalizedQuery || `${item.codeMasked} ${item.planName} ${item.note} ${item.redeemedByUsername || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || item.status === statusFilter);
  }), [normalizedQuery, redeemCodes, statusFilter]);
  const filteredUsers = useMemo(() => users.filter(user => {
    const matchesQuery = !normalizedQuery || `${user.username} ${user.email || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || user.status === statusFilter || user.role === statusFilter);
  }), [normalizedQuery, statusFilter, users]);
  const filteredEntitlements = useMemo(() => entitlements.filter(item => {
    const effectiveStatus = entitlementStatus(item);
    const matchesQuery = !normalizedQuery || `${item.username || ''} ${item.planName}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || effectiveStatus === statusFilter);
  }), [entitlements, normalizedQuery, statusFilter]);
  const filteredDeployments = useMemo(() => deployments.filter(item => {
    const matchesQuery = !normalizedQuery || `${item.username || ''} ${item.requestId} ${item.targetHostMasked || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || item.status === statusFilter || item.capability === statusFilter);
  }), [deployments, normalizedQuery, statusFilter]);
  const filteredLedger = useMemo(() => ledgerEntries.filter(item => {
    const matchesQuery = !normalizedQuery || `${item.username} ${item.planName} ${item.note}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || item.action === statusFilter || item.capability === statusFilter);
  }), [ledgerEntries, normalizedQuery, statusFilter]);
  const filteredAudit = useMemo(() => auditLogs.filter(item => {
    const matchesQuery = !normalizedQuery || `${item.adminUsername} ${item.action} ${item.targetType} ${item.detail}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || item.targetType === statusFilter);
  }), [auditLogs, normalizedQuery, statusFilter]);

  const activeList = tab === 'orders' ? filteredOrders : tab === 'plans' ? filteredPlans : tab === 'redeem-codes' ? filteredRedeemCodes : tab === 'users' ? filteredUsers : tab === 'entitlements' ? filteredEntitlements : tab === 'ledger' ? filteredLedger : tab === 'deployments' ? filteredDeployments : tab === 'audit' ? filteredAudit : [];
  const pageCount = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const currentTitle = navigation.find(item => item.id === tab)?.label || '管理后台';

  const savePlan = async () => {
    if (!editingPlan) return;
    const creating = !editingPlan.id;
    await runAction(
      creating ? '套餐已创建' : '套餐已保存',
      creating ? '/api/admin/plans' : `/api/admin/plans/${editingPlan.id}`,
      { method: creating ? 'POST' : 'PUT', body: JSON.stringify(editingPlan) },
      () => setEditingPlan(null),
    );
  };

  const saveSettings = async () => {
    await runAction('系统设置已保存', '/api/admin/settings', { method: 'PUT', body: JSON.stringify(settingsData) });
  };

  const createRedeemCodes = async () => {
    setBusy(true);
    try {
      const result = await api<{ redeemCodes: CreatedRedeemCode[] }>('/api/admin/redeem-codes', {
        method: 'POST',
        body: JSON.stringify({ ...redeemCodeDraft, expiresAt: redeemCodeDraft.expiresAt ? new Date(redeemCodeDraft.expiresAt).toISOString() : null }),
      });
      setCreatedRedeemCodes(result.redeemCodes);
      setRedeemCodeDialogOpen(false);
      setRedeemCodeDraft(value => ({ ...value, quantity: 10, note: '', expiresAt: '' }));
      await load(true);
      showToast('卡密已生成', '请立即复制或下载，本页面关闭后不能再次查看明文', 'success');
    } catch (error) {
      showToast('生成卡密失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyCreatedRedeemCodes = async () => {
    const success = await copyToClipboard(createdRedeemCodes.map(item => item.code).join('\n'));
    showToast(success ? '全部卡密已复制' : '复制失败', success ? `共 ${createdRedeemCodes.length} 张` : '请使用下载功能保存', success ? 'success' : 'error');
  };

  const downloadCreatedRedeemCodes = () => {
    const content = createdRedeemCodes.map(item => item.code).join('\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `redeem-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const saveAccountUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    const username = accountUsername.trim();
    if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(username)) {
      return showToast('用户名格式不正确', '请输入 3 到 64 位字母、数字或 ._@-', 'warning');
    }
    setBusy(true);
    try {
      const result = await api<{ user: CurrentUser }>('/api/admin/account', { method: 'PATCH', body: JSON.stringify({ username }) });
      onCurrentUserChanged(result.user);
      setUsers(current => current.map(user => user.id === result.user.id ? { ...user, username: result.user.username } : user));
      showToast('管理员用户名已更新', `下次可使用 ${result.user.username} 登录`, 'success');
    } catch (error) {
      showToast('用户名修改失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAdminPath = async (event: React.FormEvent) => {
    event.preventDefault();
    const adminPath = adminPathDraft.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(adminPath)) {
      return showToast('入口后缀格式不正确', '请输入 3 到 40 位小写字母、数字或短横线', 'warning');
    }
    setBusy(true);
    try {
      const result = await api<{ adminPath: string }>('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ adminPath }) });
      showToast('管理端入口已更新', `正在前往 /${result.adminPath}`, 'success');
      window.setTimeout(() => window.location.assign(`/${result.adminPath}`), 500);
    } catch (error) {
      showToast('入口修改失败', error instanceof Error ? error.message : '请稍后重试', 'error');
      setBusy(false);
    }
  };

  const testEmail = async () => {
    if (!testEmailRecipient.trim()) return showToast('请输入测试收件邮箱', '', 'warning');
    await runAction('测试邮件已发送', '/api/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ recipient: testEmailRecipient }) }, () => setSettingsDialog(null));
  };

  const confirmPayment = async () => {
    if (!paymentOrder) return;
    await runAction('订单已确认收款', `/api/admin/orders/${paymentOrder.id}/mark-paid`, {
      method: 'POST',
      body: JSON.stringify({ tradeNo: tradeNo.trim() }),
    }, () => { setPaymentOrder(null); setTradeNo(''); });
  };

  const confirmUserAction = async () => {
    if (!userAction) return;
    if (userAction.kind === 'password') {
      await runAction('用户密码已重置', `/api/admin/users/${userAction.user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ nextPassword }),
      }, () => { setUserAction(null); setNextPassword(''); setConfirmPassword(''); });
      return;
    }
    await runAction('用户资料已更新', `/api/admin/users/${userAction.user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [userAction.kind]: userAction.nextValue }),
    }, () => setUserAction(null));
  };

  const grantEntitlement = async () => {
    await runAction('权益已发放', '/api/admin/entitlements', { method: 'POST', body: JSON.stringify(grant) }, () => setGrantOpen(false));
  };

  const updateEntitlementQuota = async () => {
    if (!editingEntitlement) return;
    await runAction('权益额度已调整', `/api/admin/entitlements/${editingEntitlement.id}/quota`, {
      method: 'PATCH',
      body: JSON.stringify({
        panelRemaining: editingEntitlement.panelMode === 'limited' ? editingEntitlement.panelRemaining : undefined,
        nodeRemaining: editingEntitlement.nodeMode === 'limited' ? editingEntitlement.nodeRemaining : undefined,
        dailyPanelLimit: editingEntitlement.dailyPanelLimit,
        dailyNodeLimit: editingEntitlement.dailyNodeLimit,
        concurrencyLimit: editingEntitlement.concurrencyLimit,
      }),
    }, () => setEditingEntitlement(null));
  };

  const createUser = async () => {
    if (!creatingUser) return;
    await runAction('用户账号已创建', '/api/admin/users', { method: 'POST', body: JSON.stringify(creatingUser) }, () => setCreatingUser(null));
  };

  const updatePaymentMethod = (index: number, patch: Partial<PaymentMethod>) => {
    setSettingsData(value => ({ ...value, paymentMethods: value.paymentMethods.map((method, methodIndex) => methodIndex === index ? { ...method, ...patch } : method) }));
  };

  const removePaymentMethod = (index: number) => {
    setSettingsData(value => ({ ...value, paymentMethods: value.paymentMethods.filter((_method, methodIndex) => methodIndex !== index) }));
  };

  const openNewPaymentMethod = () => {
    setEditingPaymentMethod({ index: -1, method: emptyPaymentMethod() });
  };

  const savePaymentMethodDraft = () => {
    if (!editingPaymentMethod) return;
    const normalizedMethod = {
      ...editingPaymentMethod.method,
      id: editingPaymentMethod.method.id.trim(),
      name: editingPaymentMethod.method.name.trim(),
      provider: paymentProvider(editingPaymentMethod.method),
      type: legacyPaymentType(paymentProvider(editingPaymentMethod.method)),
    };
    setSettingsData(value => ({
      ...value,
      paymentMethods: editingPaymentMethod.index < 0
        ? [...value.paymentMethods, normalizedMethod]
        : value.paymentMethods.map((method, index) => index === editingPaymentMethod.index ? normalizedMethod : method),
    }));
    setEditingPaymentMethod(null);
  };

  const openUserDetail = async (user: AdminUser) => {
    setDetailLoading(true);
    try {
      setUserDetail(await api<UserDetail>(`/api/admin/users/${user.id}/detail`));
    } catch (error) {
      showToast('用户详情加载失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const exportCurrent = () => {
    const rows = activeList as unknown as Array<Record<string, unknown>>;
    if (!rows.length) return showToast('没有可导出的数据', '请先调整筛选条件', 'warning');
    downloadCsv(`admin-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    showToast('数据已导出', `共导出 ${rows.length} 条记录`, 'success');
  };

  return (
    <div className="admin-workspace">
      <aside className={`admin-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-brand"><span><Terminal /></span><div><strong>NEXUS CONTROL</strong><small>运营管理后台</small></div></div>
        <nav className="admin-navigation">
          {navigation.map(item => {
            const Icon = item.icon;
            return <React.Fragment key={item.id}>
              {item.section && <div className="admin-nav-section">{item.section}</div>}
              <button type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span className={`admin-nav-icon ${item.tone}`}><Icon /></span><span>{item.label}</span>{item.id === 'orders' && Boolean(stats?.pendingOrders) && <b>{stats?.pendingOrders}</b>}{item.id === 'deployments' && Boolean(stats?.uncertain) && <b className="warning">{stats?.uncertain}</b>}</button>
            </React.Fragment>;
          })}
        </nav>
        <div className="admin-sidebar-account"><div className="admin-avatar">{currentUser.username.slice(0, 1).toUpperCase()}</div><div><strong>{currentUser.username}</strong><small>系统管理员</small></div><button type="button" className="admin-sidebar-logout" title="退出管理端" onClick={onLogout}><LogOut /><span>退出</span></button></div>
      </aside>
      {mobileNavOpen && <button type="button" className="admin-sidebar-overlay" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" />}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title"><button type="button" className="admin-mobile-menu" onClick={() => setMobileNavOpen(value => !value)} title="打开导航">{mobileNavOpen ? <X /> : <Menu />}</button><div><span>运营管理后台</span><h1>{currentTitle}</h1></div></div>
          <div className="admin-topbar-actions">
            {activeList.length > 0 && <button type="button" className="admin-button secondary admin-export-button" onClick={exportCurrent}><Download /> 导出当前列表</button>}
            <a href="/" target="_blank" rel="noreferrer">打开用户端 <ExternalLink /></a>
            <button type="button" className="admin-icon-button" onClick={() => void load()} disabled={loading} title="刷新全部数据"><RefreshCw className={loading ? 'spinning' : ''} /></button>
          </div>
        </header>

        <main className="admin-content">
          {loading ? <AdminPageLoading /> : <>
            {tab === 'dashboard' && <Dashboard stats={stats} orders={orders} deployments={deployments} onNavigate={setTab} />}

            {tab === 'orders' && <AdminSection title="订单管理" description="核对用户订单、人工收款、取消待付订单与退款撤权。">
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索订单号、用户或交易号" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['pending', '待确认'], ['paid', '已付款'], ['refunded', '已退款'], ['cancelled', '已取消']]} />
              <AdminTable columns={['订单信息', '用户', '金额', '状态', '支付信息', '创建时间', '操作']} empty="没有符合条件的订单">
                {filteredOrders.slice(pageStart, pageStart + PAGE_SIZE).map(order => <tr key={order.id}>
                  <td><strong className="admin-primary-text">{order.orderNo}</strong><small className="admin-cell-sub">{planSnapshotName(order)}</small></td>
                  <td>{order.username || '-'}</td><td className="admin-money">{formatMoney(order.amountCents)}</td><td><StatusBadge status={order.status} /></td>
                  <td>{order.paymentTradeNo ? <><span>{paymentProviderName(order.paymentProvider || 'manual')}</span><small className="admin-cell-sub">{order.paymentTradeNo}</small></> : <span className="admin-muted">未支付</span>}</td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看订单详情" onClick={() => setViewOrder(order)}><Eye /></button>{order.status === 'pending' && <><button className="admin-link success" onClick={() => { setPaymentOrder(order); setTradeNo(''); }}>确认收款</button><button className="admin-link danger" onClick={() => setCancelOrder(order)}>取消</button></>}{order.status === 'paid' && order.paymentProvider !== 'redeem_code' && <button className="admin-link warning" onClick={() => { setRefundOrder(order); setRefundTradeNo(''); setRefundReason(''); }}>登记外部退款</button>}</div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredOrders.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'plans' && <AdminSection title="套餐管理" description="配置一次性服务、周期会员与对应的面板和节点使用额度。" action={<button className="admin-button primary" onClick={() => setEditingPlan({ ...emptyPlan })}><PackagePlus /> 新增套餐</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索套餐名称或说明" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['enabled', '已上架'], ['disabled', '已下架']]} />
              <AdminTable columns={['套餐', '价格与有效期', '面板额度', '节点额度', '每日/并发限制', '状态', '操作']} empty="没有符合条件的套餐">
                {filteredPlans.slice(pageStart, pageStart + PAGE_SIZE).map(plan => <tr key={plan.id}>
                  <td><strong className="admin-primary-text">{plan.name}</strong><small className="admin-cell-sub admin-truncate">{plan.description || '暂无说明'}</small></td>
                  <td><strong>{formatMoney(plan.priceCents)}</strong><small className="admin-cell-sub">{durationText(plan)}</small></td>
                  <td>{quotaText(plan.panelMode, plan.panelLimit)}</td><td>{quotaText(plan.nodeMode, plan.nodeLimit)}</td>
                  <td><span>每日 {plan.dailyPanelLimit || '不限'} / {plan.dailyNodeLimit || '不限'}</span><small className="admin-cell-sub">并发 {plan.concurrencyLimit}</small></td>
                  <td><StatusBadge status={plan.enabled ? 'enabled' : 'disabled'} /></td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="编辑套餐" onClick={() => setEditingPlan({ ...plan })}><Pencil /></button><button className="admin-icon-button small" title="复制套餐" onClick={() => setEditingPlan({ ...plan, id: undefined, name: `${plan.name} 副本`, enabled: false })}><ClipboardCopy /></button><button className={plan.enabled ? 'admin-link danger' : 'admin-link success'} onClick={() => void runAction(plan.enabled ? '套餐已下架' : '套餐已上架', `/api/admin/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ ...plan, enabled: !plan.enabled }) })}>{plan.enabled ? '下架' : '上架'}</button></div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredPlans.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'redeem-codes' && <AdminSection title="卡密管理" description="生成绑定套餐的一次性卡密，并查看兑换和停用状态。" action={<button className="admin-button primary" onClick={() => setRedeemCodeDialogOpen(true)}><KeyRound /> 生成卡密</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索卡密、套餐、备注或兑换用户" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['active', '未兑换'], ['redeemed', '已兑换'], ['disabled', '已停用'], ['expired', '已过期']]} />
              <AdminTable columns={['卡密', '套餐', '状态', '备注', '兑换用户', '有效期', '创建时间', '操作']} empty="没有符合条件的卡密">
                {filteredRedeemCodes.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td><strong className="admin-primary-text admin-code">{item.codeMasked}</strong></td>
                  <td>{item.planName}</td><td><StatusBadge status={item.status} /></td><td>{item.note || <span className="admin-muted">-</span>}</td>
                  <td>{item.redeemedByUsername ? <><strong>{item.redeemedByUsername}</strong><small className="admin-cell-sub">{formatDate(item.redeemedAt)}</small></> : <span className="admin-muted">未兑换</span>}</td>
                  <td>{item.expiresAt ? formatDate(item.expiresAt) : '长期有效'}</td><td>{formatDate(item.createdAt)}</td>
                  <td>{item.status === 'active' || item.status === 'disabled' ? <button className={item.status === 'active' ? 'admin-link danger' : 'admin-link success'} onClick={() => void runAction(item.status === 'active' ? '卡密已停用' : '卡密已启用', `/api/admin/redeem-codes/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'active' ? 'disabled' : 'active' }) })}>{item.status === 'active' ? '停用' : '启用'}</button> : <span className="admin-muted">-</span>}</td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredRedeemCodes.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'users' && <AdminSection title="用户管理" description="创建账号并管理真实账户状态、角色、密码与业务记录。" action={<button className="admin-button primary" onClick={() => setCreatingUser({ ...emptyUser })}><UserPlus /> 创建用户</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户名或邮箱" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部用户'], ['active', '正常'], ['disabled', '已禁用'], ['user', '普通用户'], ['admin', '管理员']]} />
              <AdminTable columns={['用户', '角色', '状态', '注册时间', '最后登录', '操作']} empty="没有符合条件的用户">
                {filteredUsers.slice(pageStart, pageStart + PAGE_SIZE).map(user => <tr key={user.id}>
                  <td><div className="admin-user-cell"><span>{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{user.username}</strong><small>{user.email || (user.id === currentUser.id ? '当前账号' : '未绑定邮箱')}</small></div></div></td>
                  <td><StatusBadge status={user.role} /></td><td><StatusBadge status={user.status} /></td><td>{formatDate(user.createdAt)}</td><td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : <span className="admin-muted">从未登录</span>}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看用户详情" disabled={detailLoading} onClick={() => void openUserDetail(user)}><Eye /></button><button className="admin-link" disabled={user.id === currentUser.id} onClick={() => setUserAction({ user, kind: 'role', nextValue: user.role === 'admin' ? 'user' : 'admin' })}>{user.role === 'admin' ? '移除管理员' : '设为管理员'}</button><button className={user.status === 'active' ? 'admin-link danger' : 'admin-link success'} disabled={user.id === currentUser.id} onClick={() => setUserAction({ user, kind: 'status', nextValue: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? '禁用' : '启用'}</button><button className="admin-icon-button small" disabled={user.id === currentUser.id} title="重置密码" onClick={() => { setUserAction({ user, kind: 'password' }); setNextPassword(''); setConfirmPassword(''); }}><KeyRound /></button></div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredUsers.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'entitlements' && <AdminSection title="权益管理" description="查看和调整用户实际可用的面板、节点次数与执行限制。" action={<button className="admin-button primary" onClick={() => setGrantOpen(true)}><BadgeCheck /> 发放权益</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户或权益名称" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['active', '有效'], ['expired', '已过期'], ['revoked', '已撤销']]} />
              <AdminTable columns={['用户与权益', '面板额度', '节点额度', '每日/并发限制', '有效期', '状态', '操作']} empty="没有符合条件的权益">
                {filteredEntitlements.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td><strong className="admin-primary-text">{item.username || '-'}</strong><small className="admin-cell-sub">{item.planName}</small></td>
                  <td>{quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}<small className="admin-cell-sub">已用 {item.panelUsed} / 冻结 {item.panelReserved}</small></td>
                  <td>{quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}<small className="admin-cell-sub">已用 {item.nodeUsed} / 冻结 {item.nodeReserved}</small></td>
                  <td><span>每日 {item.dailyPanelLimit || '不限'} / {item.dailyNodeLimit || '不限'}</span><small className="admin-cell-sub">并发 {item.concurrencyLimit}</small></td>
                  <td>{formatDate(item.expiresAt)}</td><td><StatusBadge status={entitlementStatus(item)} /></td>
                  <td><div className="admin-row-actions"><button className="admin-link" onClick={() => setEditingEntitlement({ ...item })}>调整额度</button><button className={item.status === 'active' ? 'admin-link danger' : 'admin-link success'} onClick={() => setEntitlementAction(item)}>{item.status === 'active' ? '撤销' : '重新启用'}</button></div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredEntitlements.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'ledger' && <AdminSection title="额度流水" description="每一次发放、冻结、核销、返还和人工调额都会形成不可替代的业务记录。">
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户、权益名称或流水备注" filter={statusFilter} onFilter={setStatusFilter} options={[["all", "全部流水"], ["grant", "发放"], ["reserve", "冻结"], ["consume", "核销"], ["release", "返还"], ["adjust", "调额"], ["panel", "面板额度"], ["node", "节点额度"]]} />
              <AdminTable columns={['用户与权益', '额度类型', '流水动作', '变动数量', '说明', '关联任务', '记录时间']} empty="没有符合条件的额度流水">
                {filteredLedger.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}><td><strong className="admin-primary-text">{item.username}</strong><small className="admin-cell-sub">{item.planName}</small></td><td>{item.capability === 'panel' ? '面板额度' : '节点额度'}</td><td><StatusBadge status={item.action} /></td><td className={item.amount > 0 ? 'admin-number-positive' : item.amount < 0 ? 'admin-number-negative' : ''}>{item.amount > 0 ? `+${item.amount}` : item.amount}</td><td>{item.note || '-'}</td><td className="admin-code">{item.deploymentId ? item.deploymentId.slice(0, 8) : '-'}</td><td>{formatDate(item.createdAt)}</td></tr>)}
              </AdminTable>
              <Pagination total={filteredLedger.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'deployments' && <AdminSection title="交付任务" description="追踪面板安装和节点创建的真实执行记录，人工核对结果不确定的任务。">
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户、请求编号或目标地址" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部任务'], ['uncertain', '待人工核对'], ['running', '执行中'], ['succeeded', '成功'], ['failed', '失败'], ['panel', '面板任务'], ['node', '节点任务']]} />
              <AdminTable columns={['任务信息', '用户', '类型', '目标', '状态', '结果', '时间', '操作']} empty="没有符合条件的交付任务">
                {filteredDeployments.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td><strong className="admin-primary-text admin-code">{item.requestId}</strong><small className="admin-cell-sub">{item.id.slice(0, 8)}</small></td><td>{item.username || '-'}</td><td>{item.capability === 'panel' ? '面板安装' : '节点创建'}</td><td className="admin-code">{item.targetHostMasked || '-'}</td><td><StatusBadge status={item.status} /></td><td><span className="admin-result-text">{item.resultSummary || item.errorMessage || '-'}</span></td><td>{formatDate(item.createdAt)}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看任务详情" onClick={() => setViewDeployment(item)}><Eye /></button>{item.status === 'uncertain' && <><button className="admin-link success" onClick={() => setDeploymentAction({ item, resolution: 'succeeded' })}>按成功核销</button><button className="admin-link danger" onClick={() => setDeploymentAction({ item, resolution: 'failed' })}>按失败返还</button></>}</div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredDeployments.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'audit' && <AdminSection title="操作审计" description="记录管理员对套餐、用户、订单、权益、交付任务和系统设置的真实变更。">
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索管理员、动作或操作内容" filter={statusFilter} onFilter={setStatusFilter} options={[["all", "全部对象"], ["user", "用户"], ["plan", "套餐"], ["order", "订单"], ["entitlement", "权益"], ["deployment", "交付任务"], ["settings", "系统设置"]]} />
              <AdminTable columns={['管理员', '操作动作', '对象类型', '对象编号', '操作内容', '操作时间']} empty="暂无管理操作记录">
                {filteredAudit.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}><td><strong className="admin-primary-text">{item.adminUsername}</strong></td><td>{item.action}</td><td><StatusBadge status={item.targetType} /></td><td className="admin-code">{item.targetId ? item.targetId.slice(0, 12) : '-'}</td><td><span className="admin-result-text" title={item.detail}>{auditDetail(item.detail)}</span></td><td>{formatDate(item.createdAt)}</td></tr>)}
              </AdminTable>
              <Pagination total={filteredAudit.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'settings' && <AdminSection title="系统设置" description="集中管理业务开放状态、邮箱服务与支付渠道，修改后统一保存生效。" action={<button className="admin-button primary" disabled={busy} onClick={() => void saveSettings()}><Save /> 保存全部设置</button>}>
              <div className="admin-settings-shell">
                <aside className="admin-settings-nav" aria-label="设置分类">
                  <button type="button" className={settingsSection === 'general' ? 'active' : ''} onClick={() => setSettingsSection('general')}><Settings /><span><strong>业务设置</strong><small>注册、交付与订单规则</small></span><ChevronRight /></button>
                  <button type="button" className={settingsSection === 'email' ? 'active' : ''} onClick={() => setSettingsSection('email')}><Mail /><span><strong>邮箱服务</strong><small>验证码与系统邮件</small></span><ChevronRight /></button>
                  <button type="button" className={settingsSection === 'payments' ? 'active' : ''} onClick={() => setSettingsSection('payments')}><CreditCard /><span><strong>支付渠道</strong><small>{settingsData.paymentMethods.length} 个已配置方式</small></span><ChevronRight /></button>
                </aside>

                <div className="admin-settings-content">
                  {settingsSection === 'general' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><Settings /></span><div><h2>业务设置</h2><p>控制用户入口和交付接口的开放状态，并设置订单基础规则。</p></div></div></header>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>业务开关</h3><p>保存后立即作用于用户端对应接口。</p></div>
                      <div className="admin-setting-list">
                        <SettingSwitch label="开放用户注册" description="关闭后，新用户注册接口将拒绝请求。" checked={settingsData.registrationEnabled} onChange={value => setSettingsData({ ...settingsData, registrationEnabled: value })} />
                        <SettingSwitch label="允许面板安装" description="关闭后，用户不能提交新的面板安装任务。" checked={settingsData.panelDeployEnabled} onChange={value => setSettingsData({ ...settingsData, panelDeployEnabled: value })} />
                        <SettingSwitch label="允许节点创建" description="关闭后，用户不能提交新的节点创建任务。" checked={settingsData.nodeDeployEnabled} onChange={value => setSettingsData({ ...settingsData, nodeDeployEnabled: value })} />
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>订单规则</h3><p>低频规则收纳在弹窗中，主页面只保留当前生效摘要。</p></div>
                      <div className="admin-setting-summary">
                        <span className="admin-setting-summary-icon amber"><Clock3 /></span>
                        <div><strong>待付款订单保留 {settingsData.orderExpiryMinutes} 分钟</strong><p>{settingsData.paymentInstructions.trim() ? '已配置用户付款与联系说明' : '尚未填写用户付款与联系说明'}</p></div>
                        <button type="button" className="admin-button secondary" onClick={() => setSettingsDialog('order')}><Pencil /> 编辑订单规则</button>
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>卡密购买</h3><p>配置后用户账户页会显示购买卡密入口。</p></div>
                      <div className="admin-settings-form">
                        <label className="admin-field"><span>卡密购买链接</span><input type="url" value={settingsData.redeemCodePurchaseUrl} maxLength={1000} onChange={event => setSettingsData({ ...settingsData, redeemCodePurchaseUrl: event.target.value })} placeholder="https://example.com/buy" /><small>留空则不显示购买按钮，仅支持 HTTP 或 HTTPS。</small></label>
                      </div>
                    </section>
                  </>}

                  {settingsSection === 'email' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><Mail /></span><div><h2>邮箱服务</h2><p>用于注册验证码、密码找回和系统邮件，密码仅加密存储。</p></div></div></header>
                    <section className="admin-settings-section">
                      <div className="admin-setting-list compact">
                        <SettingSwitch label="启用 SMTP 邮件服务" description="启用后才可发送验证码、找回密码邮件和测试邮件。" checked={settingsData.email.emailEnabled} onChange={value => setSettingsData({ ...settingsData, email: { ...settingsData.email, emailEnabled: value } })} />
                        <SettingSwitch label="注册必须验证邮箱" description="关闭时保留当前兼容注册流程。" checked={settingsData.email.emailVerificationRequired} onChange={value => setSettingsData({ ...settingsData, email: { ...settingsData.email, emailVerificationRequired: value } })} />
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>邮件配置</h3><p>按职责分别维护连接、发件身份和验证码策略。</p></div>
                      <div className="admin-config-grid">
                        <button type="button" className="admin-config-card cyan" onClick={() => setSettingsDialog('smtp')}><span><Network /></span><div><strong>SMTP 连接</strong><p>{settingsData.email.smtpHost ? `${settingsData.email.smtpHost}:${settingsData.email.smtpPort}` : '尚未配置邮件服务器'}</p><small>{settingsData.email.smtpPasswordConfigured || settingsData.email.smtpPassword ? '授权凭据已配置' : '需要填写授权凭据'}</small></div><ChevronRight /></button>
                        <button type="button" className="admin-config-card emerald" onClick={() => setSettingsDialog('sender')}><span><Mail /></span><div><strong>发件身份</strong><p>{settingsData.email.smtpFromEmail || '尚未配置发件邮箱'}</p><small>{settingsData.email.smtpFromName || settingsData.email.siteName}</small></div><ChevronRight /></button>
                        <button type="button" className="admin-config-card amber" onClick={() => setSettingsDialog('verification')}><span><Clock3 /></span><div><strong>验证码规则</strong><p>有效 {settingsData.email.verificationCodeTtlMinutes} 分钟，{settingsData.email.verificationResendSeconds} 秒后可重发</p><small>{settingsData.email.emailVerificationRequired ? '注册必须完成邮箱验证' : '注册邮箱验证未强制'}</small></div><ChevronRight /></button>
                        <button type="button" className="admin-config-card violet" onClick={() => setSettingsDialog('test-email')}><span><Send /></span><div><strong>发送测试邮件</strong><p>验证当前已保存的 SMTP 配置</p><small>建议修改设置并保存后再测试</small></div><ChevronRight /></button>
                      </div>
                    </section>
                  </>}

                  {settingsSection === 'payments' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><CreditCard /></span><div><h2>支付渠道</h2><p>启用后的渠道会显示在用户下单流程中，订单会保存用户所选方式。</p></div></div><button type="button" className="admin-button secondary" onClick={openNewPaymentMethod}><PackagePlus /> 新增支付方式</button></header>
                    <section className="admin-settings-section flush">
                      <div className="admin-payment-table-wrap">
                        <table className="admin-payment-table">
                          <thead><tr><th>支付方式</th><th>收款类型</th><th>支付通道</th><th>回调地址</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
                          <tbody>{settingsData.paymentMethods.map((method, index) => <tr key={`${method.id}-${index}`}>
                            <td><div className="admin-payment-name"><span><CreditCard /></span><div><strong>{method.name || '未命名支付方式'}</strong><small>{method.id || '未设置标识'}</small></div></div></td>
                            <td>{paymentProviderText(method)}</td>
                            <td>{paymentChannelText(method)}</td>
                            <td>{method.callbackUrl ? <button type="button" className="admin-callback-copy" title={method.callbackUrl} onClick={() => void copyToClipboard(method.callbackUrl || '').then(success => showToast(success ? '回调地址已复制' : '复制失败', success ? method.callbackUrl : '请手动复制回调地址', success ? 'success' : 'error'))}><ClipboardCopy /><span>复制回调</span></button> : <span className="admin-muted">无需回调</span>}</td>
                            <td>{method.sortOrder}</td>
                            <td><div className="admin-payment-state"><StatusBadge status={method.enabled ? 'active' : 'disabled'} /><button type="button" role="switch" aria-label={`${method.enabled ? '停用' : '启用'} ${method.name}`} aria-checked={method.enabled} className={`admin-switch ${method.enabled ? 'on' : ''}`} onClick={() => updatePaymentMethod(index, { enabled: !method.enabled })}><span /></button></div></td>
                            <td><div className="admin-row-actions"><button type="button" className="admin-icon-button small" title="编辑支付方式" onClick={() => setEditingPaymentMethod({ index, method: { ...method } })}><Pencil /></button><button type="button" className="admin-icon-button small danger" title="删除支付方式" onClick={() => setDeletingPaymentMethod({ index, method })}><X /></button></div></td>
                          </tr>)}</tbody>
                        </table>
                        {!settingsData.paymentMethods.length && <div className="admin-table-empty compact"><CreditCard /><strong>暂无支付方式</strong><span>新增并启用支付方式后，用户才能在下单时选择付款渠道。</span></div>}
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>支付运行记录</h3><p>用于核对下单请求、异步通知验签和自动发放结果，敏感字段已脱敏。</p></div>
                      <div className="admin-payment-runtime-grid">
                        <div className="admin-payment-runtime-panel"><header><div><strong>最近支付请求</strong><small>{paymentAttempts.length} 条记录</small></div><RefreshCw /></header><div className="admin-payment-runtime-list">{paymentAttempts.slice(0, 8).map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{item.orderNo}</strong><small>{paymentChannelName(item.provider, settingsData.paymentMethods)} · {formatDate(item.createdAt)}</small>{item.errorMessage && <p>{item.errorMessage}</p>}</div><StatusBadge status={item.status} /></article>)}{!paymentAttempts.length && <EmptyInline text="暂无支付请求记录" />}</div></div>
                        <div className="admin-payment-runtime-panel"><header><div><strong>最近异步通知</strong><small>{paymentNotifications.length} 条记录</small></div><ShieldCheck /></header><div className="admin-payment-runtime-list">{paymentNotifications.slice(0, 8).map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{item.orderNo || '未识别订单号'}</strong><small>{paymentProviderName(item.provider)} · {formatDate(item.createdAt)}</small>{item.errorMessage && <p>{item.errorMessage}</p>}</div><StatusBadge status={item.status} /></article>)}{!paymentNotifications.length && <EmptyInline text="暂无支付回调记录" />}</div></div>
                      </div>
                    </section>
                  </>}
                </div>
              </div>
            </AdminSection>}

            {tab === 'security' && <AdminSection title="账号安全" description="管理当前管理员身份、后台访问入口和登录密码。">
              <div className="admin-security-grid">
                <section className="admin-security-card">
                  <header><span><Users /></span><div><h2>管理员账号</h2><p>修改当前账号的登录用户名，不会中断当前会话。</p></div></header>
                  <form onSubmit={saveAccountUsername}>
                    <label className="admin-field"><span>登录用户名</span><input value={accountUsername} onChange={event => setAccountUsername(event.target.value)} minLength={3} maxLength={64} autoComplete="username" /><small>支持字母、数字以及 . _ @ -</small></label>
                    <button type="submit" className="admin-button primary" disabled={busy || accountUsername.trim() === currentUser.username}><Save /> 保存用户名</button>
                  </form>
                </section>

                <section className="admin-security-card">
                  <header><span><ExternalLink /></span><div><h2>管理端入口</h2><p>修改浏览器访问管理后台时使用的地址后缀。</p></div></header>
                  <form onSubmit={saveAdminPath}>
                    <label className="admin-field"><span>入口后缀</span><div className="admin-path-input"><b>/</b><input value={adminPathDraft} onChange={event => setAdminPathDraft(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} minLength={3} maxLength={40} autoComplete="off" /></div><small>保存后当前页面会自动跳转，新入口为 /{adminPathDraft || '...'}</small></label>
                    <button type="submit" className="admin-button primary" disabled={busy || adminPathDraft === settingsData.adminPath}><Save /> 保存并跳转</button>
                  </form>
                </section>

                <section className="admin-security-card admin-security-password">
                  <header><span><ShieldCheck /></span><div><h2>登录密码</h2><p>修改密码后所有已登录会话会立即失效，需要重新登录。</p></div></header>
                  <ChangePasswordForm endpoint="/api/admin/auth/change-password" onChanged={onSessionEnded} showToast={showToast} variant="admin" />
                </section>
              </div>
            </AdminSection>}
          </>}
        </main>
      </div>

      <PlanDialog plan={editingPlan} busy={busy} onChange={setEditingPlan} onClose={() => setEditingPlan(null)} onSave={() => void savePlan()} />
      <AdminDialog open={redeemCodeDialogOpen} title="生成卡密" description="每张卡密只能兑换一次，并按当前套餐内容创建权益。" confirmLabel="生成卡密" tone="success" busy={busy} confirmDisabled={!redeemCodeDraft.planId || redeemCodeDraft.quantity < 1 || redeemCodeDraft.quantity > 100} onClose={() => setRedeemCodeDialogOpen(false)} onConfirm={() => void createRedeemCodes()}>
        <div className="admin-form-grid">
          <label className="admin-field span-2"><span>绑定套餐</span><select value={redeemCodeDraft.planId} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, planId: event.target.value })}>{plans.filter(plan => plan.enabled).map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {formatMoney(plan.priceCents)}</option>)}</select><small>仅能为当前已上架套餐生成卡密。</small></label>
          <label className="admin-field"><span>生成数量</span><input type="number" min="1" max="100" value={redeemCodeDraft.quantity} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, quantity: Number(event.target.value) })} /></label>
          <label className="admin-field"><span>有效期</span><input type="datetime-local" value={redeemCodeDraft.expiresAt} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, expiresAt: event.target.value })} /><small>留空表示长期有效。</small></label>
          <label className="admin-field span-2"><span>批次备注</span><input value={redeemCodeDraft.note} maxLength={300} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, note: event.target.value })} placeholder="例如：淘宝 8 月批次" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={createdRedeemCodes.length > 0} title="卡密生成完成" description="明文只在本次显示，关闭后后台只能查看脱敏值。" cancelLabel="关闭" onClose={() => setCreatedRedeemCodes([])}>
        <div className="admin-redeem-result-actions"><button type="button" className="admin-button secondary" onClick={() => void copyCreatedRedeemCodes()}><ClipboardCopy /> 复制全部</button><button type="button" className="admin-button secondary" onClick={downloadCreatedRedeemCodes}><Download /> 下载 TXT</button></div>
        <div className="admin-redeem-result-list">{createdRedeemCodes.map(item => <code key={item.id}>{item.code}</code>)}</div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'order'} title="编辑订单规则" description="设置待付款订单的保留时间和用户付款引导，确认后仍需保存全部设置才会生效。" confirmLabel="完成编辑" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid one">
          <label className="admin-field"><span>订单有效期（分钟）</span><input type="number" min="5" max="1440" value={settingsData.orderExpiryMinutes} onChange={event => setSettingsData({ ...settingsData, orderExpiryMinutes: Number(event.target.value) })} /><small>超过有效期的未支付订单将不能继续付款。</small></label>
          <label className="admin-field"><span>支付与联系说明</span><textarea value={settingsData.paymentInstructions} maxLength={2000} onChange={event => setSettingsData({ ...settingsData, paymentInstructions: event.target.value })} placeholder="填写收款方式、联系渠道和订单备注要求" /><small>{settingsData.paymentInstructions.length} / 2000</small></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'smtp'} title="配置 SMTP 连接" description="填写邮件服务商提供的服务器、账号和授权码，密码保存后不会回传明文。" confirmLabel="完成编辑" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>SMTP 主机</span><input value={settingsData.email.smtpHost} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpHost: event.target.value } })} placeholder="smtp.example.com" /></label>
          <label className="admin-field"><span>SMTP 端口</span><input type="number" min="1" max="65535" value={settingsData.email.smtpPort} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpPort: Number(event.target.value) } })} /></label>
          <label className="admin-field"><span>连接加密</span><select value={settingsData.email.smtpEncryption} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpEncryption: event.target.value as EmailSettings['smtpEncryption'] } })}><option value="ssl">SSL / TLS</option><option value="starttls">STARTTLS</option><option value="none">不加密</option></select></label>
          <label className="admin-field"><span>SMTP 用户名</span><input value={settingsData.email.smtpUsername} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpUsername: event.target.value } })} /></label>
          <label className="admin-field span-2"><span>SMTP 密码或授权码</span><input type="password" value={settingsData.email.smtpPassword || ''} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpPassword: event.target.value } })} placeholder={settingsData.email.smtpPasswordConfigured ? '已配置，留空保持不变' : '填写密码或授权码'} /><small>保存后不会再向前端回传明文。</small></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'sender'} title="配置发件身份" description="这些信息会显示在验证码、密码找回和系统通知邮件中。" confirmLabel="完成编辑" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>发件人名称</span><input value={settingsData.email.smtpFromName} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpFromName: event.target.value } })} /></label>
          <label className="admin-field"><span>发件邮箱</span><input type="email" value={settingsData.email.smtpFromEmail} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpFromEmail: event.target.value } })} /></label>
          <label className="admin-field"><span>回复邮箱</span><input type="email" value={settingsData.email.smtpReplyTo} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpReplyTo: event.target.value } })} /></label>
          <label className="admin-field"><span>站点名称</span><input value={settingsData.email.siteName} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, siteName: event.target.value } })} /></label>
          <label className="admin-field span-2"><span>公网访问地址</span><input type="url" value={settingsData.email.publicBaseUrl} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, publicBaseUrl: event.target.value } })} placeholder="https://your-domain.com，用于邮件链接和支付异步回调" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'verification'} title="配置验证码规则" description="设置邮箱验证码的有效时间与重复发送间隔。" confirmLabel="完成编辑" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>验证码有效期（分钟）</span><input type="number" min="3" max="60" value={settingsData.email.verificationCodeTtlMinutes} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, verificationCodeTtlMinutes: Number(event.target.value) } })} /></label>
          <label className="admin-field"><span>重发间隔（秒）</span><input type="number" min="30" max="600" value={settingsData.email.verificationResendSeconds} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, verificationResendSeconds: Number(event.target.value) } })} /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'test-email'} title="发送测试邮件" description="测试接口使用已经保存到后端的 SMTP 设置，请先保存全部设置。" confirmLabel="发送测试邮件" busy={busy} confirmDisabled={!testEmailRecipient.trim()} onClose={() => setSettingsDialog(null)} onConfirm={() => void testEmail()}>
        <label className="admin-field"><span>测试收件邮箱</span><input type="email" value={testEmailRecipient} onChange={event => setTestEmailRecipient(event.target.value)} placeholder="name@example.com" /></label>
      </AdminDialog>
      <AdminDialog open={Boolean(editingPaymentMethod)} title={editingPaymentMethod?.index === -1 ? '新增支付方式' : '编辑支付方式'} description="支付方式会先保存在当前设置草稿中，点击页面右上角“保存全部设置”后正式生效。" confirmLabel="保存支付方式" busy={busy} confirmDisabled={!editingPaymentMethod?.method.name.trim() || !editingPaymentMethod?.method.id.trim()} onClose={() => setEditingPaymentMethod(null)} onConfirm={savePaymentMethodDraft}>
        {editingPaymentMethod && <PaymentMethodEditor method={editingPaymentMethod.method} onChange={method => setEditingPaymentMethod({ ...editingPaymentMethod, method })} />}
      </AdminDialog>
      <AdminDialog open={Boolean(deletingPaymentMethod)} title="删除支付方式" description={`将从设置草稿中删除“${deletingPaymentMethod?.method.name || '未命名支付方式'}”，保存全部设置后正式生效。`} confirmLabel="确认删除" tone="danger" busy={busy} onClose={() => setDeletingPaymentMethod(null)} onConfirm={() => { if (deletingPaymentMethod) removePaymentMethod(deletingPaymentMethod.index); setDeletingPaymentMethod(null); }} />
      <AdminDialog open={Boolean(paymentOrder)} title="确认人工收款" description="确认后将按照下单时的套餐快照发放权益，此操作会直接改变用户可用次数。" confirmLabel="确认收款并发放权益" tone="success" busy={busy} confirmDisabled={!tradeNo.trim()} onClose={() => { setPaymentOrder(null); setTradeNo(''); }} onConfirm={() => void confirmPayment()}>
        {paymentOrder && <div className="admin-dialog-summary"><div><span>订单号</span><strong>{paymentOrder.orderNo}</strong></div><div><span>用户</span><strong>{paymentOrder.username || '-'}</strong></div><div><span>金额</span><strong>{formatMoney(paymentOrder.amountCents)}</strong></div></div>}
        <label className="admin-field"><span>支付交易号或收款凭证号</span><input value={tradeNo} onChange={event => setTradeNo(event.target.value)} maxLength={128} placeholder="请输入唯一的交易号，便于后续核对" /><small>该编号会写入订单和支付事件记录。</small></label>
      </AdminDialog>
      <AdminDialog open={Boolean(cancelOrder)} title="取消待付款订单" description={`订单 ${cancelOrder?.orderNo || ''} 将变为已取消，之后不能再确认收款。`} confirmLabel="确认取消订单" tone="danger" busy={busy} onClose={() => setCancelOrder(null)} onConfirm={() => cancelOrder && void runAction('订单已取消', `/api/admin/orders/${cancelOrder.id}/cancel`, { method: 'POST' }, () => setCancelOrder(null))} />
      <AdminDialog open={Boolean(refundOrder)} title="登记外部退款并撤销权益" description="请先在对应支付平台完成真实退款，再登记退款凭证。系统只负责标记订单并撤销权益，不会主动向支付平台发起退款。" confirmLabel="确认已退款并撤权" tone="danger" busy={busy} confirmDisabled={!refundTradeNo.trim() || !refundReason.trim()} onClose={() => { setRefundOrder(null); setRefundTradeNo(''); setRefundReason(''); }} onConfirm={() => refundOrder && void runAction('外部退款已登记并撤销权益', `/api/admin/orders/${refundOrder.id}/refund`, { method: 'POST', body: JSON.stringify({ refundTradeNo, reason: refundReason }) }, () => { setRefundOrder(null); setRefundTradeNo(''); setRefundReason(''); })}>
        {refundOrder && <div className="admin-dialog-summary"><div><span>订单号</span><strong>{refundOrder.orderNo}</strong></div><div><span>用户</span><strong>{refundOrder.username || '-'}</strong></div><div><span>退款金额</span><strong>{formatMoney(refundOrder.amountCents)}</strong></div></div>}
        <div className="admin-form-grid one">
          <label className="admin-field"><span>外部退款凭证号</span><input value={refundTradeNo} onChange={event => setRefundTradeNo(event.target.value)} maxLength={128} placeholder="填写 PayPal、支付宝、微信或其他支付平台退款单号" /></label>
          <label className="admin-field"><span>退款原因</span><textarea value={refundReason} onChange={event => setRefundReason(event.target.value)} maxLength={500} placeholder="填写退款原因，便于后续审计核对" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={Boolean(userAction)} title={userActionTitle(userAction)} description={userActionDescription(userAction)} confirmLabel={userAction?.kind === 'password' ? '确认重置密码' : '确认修改'} tone={userAction?.kind === 'status' && userAction.nextValue === 'disabled' ? 'danger' : 'warning'} busy={busy} confirmDisabled={userAction?.kind === 'password' && (nextPassword.length < 8 || nextPassword !== confirmPassword)} onClose={() => { setUserAction(null); setNextPassword(''); setConfirmPassword(''); }} onConfirm={() => void confirmUserAction()}>
        {userAction?.kind === 'password' && <div className="admin-form-grid one"><label className="admin-field"><span>新密码</span><input type="password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" /></label><label className="admin-field"><span>确认新密码</span><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" /><small className={confirmPassword && nextPassword !== confirmPassword ? 'error' : ''}>{confirmPassword && nextPassword !== confirmPassword ? '两次输入不一致' : '密码长度为 8 到 128 位'}</small></label></div>}
      </AdminDialog>
      <GrantDialog open={grantOpen} busy={busy} users={users.filter(user => user.role === 'user')} value={grant} onChange={setGrant} onClose={() => setGrantOpen(false)} onSave={() => void grantEntitlement()} />
      <QuotaDialog value={editingEntitlement} busy={busy} onChange={setEditingEntitlement} onClose={() => setEditingEntitlement(null)} onSave={() => void updateEntitlementQuota()} />
      <AdminDialog open={Boolean(entitlementAction)} title={entitlementAction?.status === 'active' ? '撤销用户权益' : '重新启用权益'} description={entitlementAction?.status === 'active' ? '撤销后用户将不能再使用此权益执行新任务，正在执行或待核对的任务不会被自动修改。' : '重新启用后，未过期且仍有额度的权益可以继续用于执行任务。'} confirmLabel={entitlementAction?.status === 'active' ? '确认撤销' : '确认启用'} tone={entitlementAction?.status === 'active' ? 'danger' : 'success'} busy={busy} onClose={() => setEntitlementAction(null)} onConfirm={() => entitlementAction && void runAction('权益状态已更新', `/api/admin/entitlements/${entitlementAction.id}`, { method: 'PATCH', body: JSON.stringify({ status: entitlementAction.status === 'active' ? 'revoked' : 'active' }) }, () => setEntitlementAction(null))} />
      <AdminDialog open={Boolean(deploymentAction)} title={deploymentAction?.resolution === 'succeeded' ? '按成功结果核销任务' : '按失败结果返还额度'} description={deploymentAction?.resolution === 'succeeded' ? '确认后，冻结额度将转为已使用，任务状态变为成功。' : '确认后，冻结额度将返还给用户，任务状态变为失败。'} confirmLabel={deploymentAction?.resolution === 'succeeded' ? '确认成功并核销' : '确认失败并返还'} tone={deploymentAction?.resolution === 'succeeded' ? 'success' : 'danger'} busy={busy} onClose={() => setDeploymentAction(null)} onConfirm={() => deploymentAction && void runAction('任务核对结果已保存', `/api/admin/deployments/${deploymentAction.item.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: deploymentAction.resolution }) }, () => setDeploymentAction(null))}>
        {deploymentAction && <div className="admin-dialog-summary"><div><span>用户</span><strong>{deploymentAction.item.username || '-'}</strong></div><div><span>任务类型</span><strong>{deploymentAction.item.capability === 'panel' ? '面板安装' : '节点创建'}</strong></div><div><span>目标</span><strong>{deploymentAction.item.targetHostMasked || '-'}</strong></div></div>}
      </AdminDialog>
      <AdminDialog open={Boolean(creatingUser)} title="创建用户账号" description="普通用户建议填写邮箱；管理员可以保留用户名登录。账号创建后会立即写入数据库。" confirmLabel="创建账号" tone="success" busy={busy} confirmDisabled={(!creatingUser?.username.trim() && !creatingUser?.email.trim()) || (creatingUser?.password.length || 0) < 8} onClose={() => setCreatingUser(null)} onConfirm={() => void createUser()}>
        {creatingUser && <div className="admin-form-grid one">
          <label className="admin-field"><span>用户名</span><input value={creatingUser.username} onChange={event => setCreatingUser({ ...creatingUser, username: event.target.value })} minLength={3} maxLength={40} autoComplete="off" placeholder="3 到 40 位用户名" /></label>
          <label className="admin-field"><span>邮箱</span><input type="email" value={creatingUser.email} onChange={event => setCreatingUser({ ...creatingUser, email: event.target.value })} maxLength={254} autoComplete="off" placeholder="普通用户用于注册和登录" /></label>
          <label className="admin-field"><span>初始密码</span><input type="password" value={creatingUser.password} onChange={event => setCreatingUser({ ...creatingUser, password: event.target.value })} minLength={8} maxLength={128} autoComplete="new-password" placeholder="至少 8 位" /><small>用户首次登录后可以在账户安全中修改。</small></label>
          <label className="admin-field"><span>账号角色</span><select value={creatingUser.role} onChange={event => setCreatingUser({ ...creatingUser, role: event.target.value as 'user' | 'admin' })}><option value="user">普通用户</option><option value="admin">管理员</option></select></label>
        </div>}
      </AdminDialog>
      <AdminDialog open={Boolean(viewOrder)} title="订单详情" description="订单金额、支付信息和下单时套餐快照的完整记录。" cancelLabel="关闭" onClose={() => setViewOrder(null)}>
        {viewOrder && <div className="admin-detail-layout">
          <div className="admin-detail-summary"><DetailItem label="订单号" value={viewOrder.orderNo} mono /><DetailItem label="用户" value={viewOrder.username || '-'} /><DetailItem label="订单金额" value={formatMoney(viewOrder.amountCents)} accent /><DetailItem label="订单状态" value={<StatusBadge status={viewOrder.status} />} /></div>
          <DetailBlock title="支付与时间">
            <div className="admin-detail-grid"><DetailItem label="支付渠道" value={paymentProviderName(viewOrder.paymentProvider || 'manual')} /><DetailItem label="交易号" value={viewOrder.paymentTradeNo || '未支付'} mono /><DetailItem label="创建时间" value={formatDate(viewOrder.createdAt)} /><DetailItem label="付款时间" value={viewOrder.paidAt ? formatDate(viewOrder.paidAt) : '未付款'} /></div>
          </DetailBlock>
          <DetailBlock title="套餐快照"><PlanSnapshotDetails order={viewOrder} /></DetailBlock>
        </div>}
      </AdminDialog>
      <AdminDialog open={Boolean(viewDeployment)} title="交付任务详情" description="任务从额度预约到执行完成的真实状态和结果记录。" cancelLabel="关闭" onClose={() => setViewDeployment(null)}>
        {viewDeployment && <div className="admin-detail-layout">
          <div className="admin-detail-summary"><DetailItem label="请求编号" value={viewDeployment.requestId} mono /><DetailItem label="用户" value={viewDeployment.username || '-'} /><DetailItem label="任务类型" value={viewDeployment.capability === 'panel' ? '面板安装' : '节点创建'} /><DetailItem label="任务状态" value={<StatusBadge status={viewDeployment.status} />} /></div>
          <DetailBlock title="执行信息"><div className="admin-detail-grid"><DetailItem label="任务记录 ID" value={viewDeployment.id} mono /><DetailItem label="目标地址" value={viewDeployment.targetHostMasked || '-'} mono /><DetailItem label="额度模式" value={viewDeployment.quotaMode === 'unlimited' ? '不限次数' : '限次权益'} /><DetailItem label="创建时间" value={formatDate(viewDeployment.createdAt)} /><DetailItem label="开始时间" value={viewDeployment.startedAt ? formatDate(viewDeployment.startedAt) : '尚未开始'} /><DetailItem label="结束时间" value={viewDeployment.finishedAt ? formatDate(viewDeployment.finishedAt) : '尚未结束'} /></div></DetailBlock>
          <DetailBlock title="执行结果"><div className={`admin-detail-message ${viewDeployment.errorMessage ? 'danger' : 'success'}`}>{viewDeployment.errorMessage || viewDeployment.resultSummary || '暂无执行结果'}</div></DetailBlock>
        </div>}
      </AdminDialog>
      <AdminDialog open={Boolean(userDetail)} title={`用户详情 · ${userDetail?.user.username || ''}`} description="该账号关联的订单、权益与交付任务均来自当前业务数据库。" cancelLabel="关闭" onClose={() => setUserDetail(null)}>
        {userDetail && <div className="admin-detail-layout">
          <div className="admin-detail-summary"><DetailItem label="登录邮箱" value={userDetail.user.email || '未绑定邮箱'} /><DetailItem label="邮箱状态" value={userDetail.user.email ? (userDetail.user.emailVerified ? '已验证' : '未验证') : '-'} /><DetailItem label="账号角色" value={<StatusBadge status={userDetail.user.role} />} /><DetailItem label="账号状态" value={<StatusBadge status={userDetail.user.status} />} /><DetailItem label="注册时间" value={formatDate(userDetail.user.createdAt)} /><DetailItem label="最后登录" value={userDetail.user.lastLoginAt ? formatDate(userDetail.user.lastLoginAt) : '从未登录'} /></div>
          <div className="admin-detail-counts"><div><strong>{userDetail.orders.length}</strong><span>订单</span></div><div><strong>{userDetail.entitlements.length}</strong><span>权益</span></div><div><strong>{userDetail.deployments.length}</strong><span>交付任务</span></div></div>
          <DetailBlock title="最近订单"><div className="admin-detail-list">{userDetail.orders.slice(0, 4).map(order => <div key={order.id}><div><strong>{order.orderNo}</strong><small>{planSnapshotName(order)} · {formatDate(order.createdAt)}</small></div><div><b>{formatMoney(order.amountCents)}</b><StatusBadge status={order.status} /></div></div>)}{!userDetail.orders.length && <EmptyInline text="该用户暂无订单" />}</div></DetailBlock>
          <DetailBlock title="当前权益"><div className="admin-detail-list">{userDetail.entitlements.slice(0, 4).map(item => <div key={item.id}><div><strong>{item.planName}</strong><small>有效期至 {formatDate(item.expiresAt)}</small></div><div><b>面板 {quotaText(item.panelMode, item.panelRemaining)}</b><b>节点 {quotaText(item.nodeMode, item.nodeRemaining)}</b><StatusBadge status={entitlementStatus(item)} /></div></div>)}{!userDetail.entitlements.length && <EmptyInline text="该用户暂无权益" />}</div></DetailBlock>
          <DetailBlock title="最近交付"><div className="admin-detail-list">{userDetail.deployments.slice(0, 4).map(item => <div key={item.id}><div><strong>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.requestId}</strong><small>{item.targetHostMasked || '-'} · {formatDate(item.createdAt)}</small></div><div><StatusBadge status={item.status} /></div></div>)}{!userDetail.deployments.length && <EmptyInline text="该用户暂无交付任务" />}</div></DetailBlock>
        </div>}
      </AdminDialog>
    </div>
  );
};

const Dashboard: React.FC<{ stats: Stats | null; orders: Order[]; deployments: DeploymentRecord[]; onNavigate: (tab: AdminTab) => void }> = ({ stats, orders, deployments, onNavigate }) => {
  const successRate = stats?.deployments ? Math.round((stats.succeeded / stats.deployments) * 100) : 0;
  const recentOrders = orders.slice(0, 5);
  const recentDeployments = deployments.slice(0, 5);
  return <div className="admin-dashboard">
    <div className="admin-page-heading"><div><h2>运营概览</h2><p>当前业务数据库的实时汇总与待处理事项。</p></div><span className="admin-live"><i /> 实时数据</span></div>
    <div className="admin-stat-grid">
      <Stat icon={Users} label="用户总数" value={stats?.users || 0} detail={`${stats?.activeUsers || 0} 正常 / ${stats?.disabledUsers || 0} 禁用`} tone="cyan" />
      <Stat icon={CircleDollarSign} label="实际收入" value={formatMoney(stats?.revenueCents || 0)} detail={`${stats?.paidOrders || 0} 笔已付款订单`} tone="green" />
      <Stat icon={BadgeCheck} label="有效权益" value={stats?.activeEntitlements || 0} detail={`${stats?.expiredEntitlements || 0} 过期 / ${stats?.revokedEntitlements || 0} 撤销`} tone="indigo" />
      <Stat icon={Network} label="交付成功率" value={`${successRate}%`} detail={`${stats?.succeeded || 0} 成功 / ${stats?.failed || 0} 失败`} tone="amber" />
    </div>
    <div className="admin-attention-grid">
      <button type="button" onClick={() => onNavigate('orders')}><span className="amber"><FileClock /></span><div><strong>{stats?.pendingOrders || 0}</strong><small>待确认付款订单</small></div><ChevronRight /></button>
      <button type="button" onClick={() => onNavigate('deployments')}><span className="rose"><ClipboardCheck /></span><div><strong>{stats?.uncertain || 0}</strong><small>待人工核对任务</small></div><ChevronRight /></button>
      <button type="button" onClick={() => onNavigate('deployments')}><span className="cyan"><Activity /></span><div><strong>{stats?.running || 0}</strong><small>正在执行的任务</small></div><ChevronRight /></button>
    </div>
    <div className="admin-dashboard-columns">
      <section className="admin-dashboard-panel"><header><div><h3>最近订单</h3><p>按创建时间倒序</p></div><button onClick={() => onNavigate('orders')}>查看全部</button></header><div className="admin-activity-list">{recentOrders.map(order => <div key={order.id}><span className="admin-activity-icon"><CreditCard /></span><div><strong>{order.username || '-'}</strong><small>{order.orderNo}</small></div><div className="right"><strong>{formatMoney(order.amountCents)}</strong><StatusBadge status={order.status} /></div></div>)}{!recentOrders.length && <EmptyInline text="暂无订单" />}</div></section>
      <section className="admin-dashboard-panel"><header><div><h3>最近交付任务</h3><p>面板安装与节点创建记录</p></div><button onClick={() => onNavigate('deployments')}>查看全部</button></header><div className="admin-activity-list">{recentDeployments.map(item => <div key={item.id}><span className="admin-activity-icon"><Network /></span><div><strong>{item.username || '-'}</strong><small>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.targetHostMasked || '-'}</small></div><div className="right"><StatusBadge status={item.status} /><small>{formatDate(item.createdAt)}</small></div></div>)}{!recentDeployments.length && <EmptyInline text="暂无交付任务" />}</div></section>
    </div>
  </div>;
};

const AdminSection: React.FC<{ title: string; description: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => <div className="admin-section"><div className="admin-page-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>{children}</div>;
const AdminToolbar: React.FC<{ query: string; onQuery: (value: string) => void; placeholder: string; filter: string; onFilter: (value: string) => void; options: Array<[string, string]> }> = ({ query, onQuery, placeholder, filter, onFilter, options }) => <div className="admin-toolbar"><label className="admin-search"><Search /><input value={query} onChange={event => onQuery(event.target.value)} placeholder={placeholder} /></label><label className="admin-filter"><SlidersHorizontal /><select value={filter} onChange={event => onFilter(event.target.value)}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
const AdminTable: React.FC<{ columns: string[]; empty: string; children: React.ReactNode }> = ({ columns, empty, children }) => <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>{React.Children.count(children) === 0 && <div className="admin-table-empty"><Search /><strong>{empty}</strong><span>调整搜索词或筛选条件后再试。</span></div>}</div>;
const Pagination: React.FC<{ total: number; page: number; pageCount: number; onPage: (page: number) => void }> = ({ total, page, pageCount, onPage }) => <div className="admin-pagination"><span>共 {total} 条记录</span><div><button className="admin-icon-button small" disabled={page <= 1} onClick={() => onPage(page - 1)} title="上一页"><ChevronLeft /></button><span>第 {page} / {pageCount} 页</span><button className="admin-icon-button small" disabled={page >= pageCount} onClick={() => onPage(page + 1)} title="下一页"><ChevronRight /></button></div></div>;
const Stat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; detail: string; tone: string }> = ({ icon: Icon, label, value, detail, tone }) => <div className="admin-stat"><span className={tone}><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>;
const EmptyInline: React.FC<{ text: string }> = ({ text }) => <div className="admin-empty-inline">{text}</div>;
const AdminPageLoading = () => <div className="admin-page-loading"><RefreshCw /><p>正在读取管理数据...</p></div>;
const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="admin-detail-block"><header><FileText /><h3>{title}</h3></header>{children}</section>;
const DetailItem: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => <div className={`admin-detail-item ${mono ? 'mono' : ''} ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
const PlanSnapshotDetails: React.FC<{ order: Order }> = ({ order }) => {
  const snapshot = parsePlanSnapshot(order);
  return <div className="admin-detail-grid"><DetailItem label="套餐名称" value={String(snapshot.name || '套餐快照')} /><DetailItem label="套餐说明" value={String(snapshot.description || '无')} /><DetailItem label="面板额度" value={snapshot.panelMode === 'unlimited' ? '不限次数' : snapshot.panelMode === 'none' ? '不包含' : `${Number(snapshot.panelLimit || 0)} 次`} /><DetailItem label="节点额度" value={snapshot.nodeMode === 'unlimited' ? '不限次数' : snapshot.nodeMode === 'none' ? '不包含' : `${Number(snapshot.nodeLimit || 0)} 次`} /><DetailItem label="每日面板上限" value={Number(snapshot.dailyPanelLimit || 0) || '不限'} /><DetailItem label="每日节点上限" value={Number(snapshot.dailyNodeLimit || 0) || '不限'} /><DetailItem label="并发任务上限" value={Number(snapshot.concurrencyLimit || 1)} /><DetailItem label="有效期" value={snapshot.durationUnit === 'lifetime' ? '永久有效' : `${Number(snapshot.durationValue || 0)} ${snapshot.durationUnit === 'years' ? '年' : snapshot.durationUnit === 'months' ? '个月' : '天'}`} /></div>;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const labels: Record<string, string> = { created: '已创建', pending: '待确认', paid: '已付款', failed: '失败', closed: '已关闭', accepted: '已验收', rejected: '已拒绝', refunded: '已退款', cancelled: '已取消', expired: '已过期', active: '正常', redeemed: '已兑换', disabled: '已禁用', admin: '管理员', user: '普通用户', enabled: '已上架', revoked: '已撤销', reserved: '已预约', running: '执行中', succeeded: '成功', uncertain: '待核对', grant: '发放', reserve: '冻结', consume: '核销', release: '返还', adjust: '调额', panel: '面板', node: '节点', plan: '套餐', order: '订单', entitlement: '权益', deployment: '交付任务', redeem_code: '卡密', settings: '系统设置' };
  return <span className={`admin-status ${status}`}>{labels[status] || status}</span>;
};

const SettingSwitch: React.FC<{ label: string; description: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, description, checked, onChange }) => <div className="admin-setting-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-checked={checked} className={`admin-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>;

const PlanDialog: React.FC<{ plan: (Omit<Plan, 'id'> & { id?: string }) | null; busy: boolean; onChange: (plan: (Omit<Plan, 'id'> & { id?: string }) | null) => void; onClose: () => void; onSave: () => void }> = ({ plan, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(plan)} title={plan?.id ? '编辑套餐' : '新增套餐'} description="套餐会在用户端用于创建订单，已创建订单继续使用下单时保存的套餐快照。" confirmLabel="保存套餐" busy={busy} confirmDisabled={!plan?.name.trim()} onClose={onClose} onConfirm={onSave}>{plan && <div className="admin-form-grid">
  <label className="admin-field"><span>套餐名称</span><input value={plan.name} onChange={event => onChange({ ...plan, name: event.target.value })} maxLength={80} /></label>
  <label className="admin-field"><span>价格（元）</span><input type="number" min="0" step="0.01" value={plan.priceCents / 100} onChange={event => onChange({ ...plan, priceCents: Math.round(Number(event.target.value) * 100) })} /></label>
  <label className="admin-field span-2"><span>套餐说明</span><input value={plan.description} onChange={event => onChange({ ...plan, description: event.target.value })} maxLength={300} /></label>
  <label className="admin-field"><span>有效期单位</span><select value={plan.durationUnit} onChange={event => onChange({ ...plan, durationUnit: event.target.value as Plan['durationUnit'] })}><option value="days">天</option><option value="months">月</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
  <label className="admin-field"><span>有效期数值</span><input type="number" min="0" disabled={plan.durationUnit === 'lifetime'} value={plan.durationValue} onChange={event => onChange({ ...plan, durationValue: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>面板权益</span><select value={plan.panelMode} onChange={event => onChange({ ...plan, panelMode: event.target.value as Plan['panelMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>面板总次数</span><input type="number" min="0" disabled={plan.panelMode !== 'limited'} value={plan.panelLimit} onChange={event => onChange({ ...plan, panelLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={plan.nodeMode} onChange={event => onChange({ ...plan, nodeMode: event.target.value as Plan['nodeMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>节点总次数</span><input type="number" min="0" disabled={plan.nodeMode !== 'limited'} value={plan.nodeLimit} onChange={event => onChange({ ...plan, nodeLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>每日面板上限</span><input type="number" min="0" value={plan.dailyPanelLimit} onChange={event => onChange({ ...plan, dailyPanelLimit: Number(event.target.value) })} /><small>0 表示不限制</small></label>
  <label className="admin-field"><span>每日节点上限</span><input type="number" min="0" value={plan.dailyNodeLimit} onChange={event => onChange({ ...plan, dailyNodeLimit: Number(event.target.value) })} /><small>0 表示不限制</small></label>
  <label className="admin-field"><span>并发任务上限</span><input type="number" min="1" value={plan.concurrencyLimit} onChange={event => onChange({ ...plan, concurrencyLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>显示排序</span><input type="number" value={plan.sortOrder} onChange={event => onChange({ ...plan, sortOrder: Number(event.target.value) })} /></label>
  <label className="admin-checkbox span-2"><input type="checkbox" checked={plan.enabled} onChange={event => onChange({ ...plan, enabled: event.target.checked })} /><span><strong>在用户端上架此套餐</strong><small>下架后不能新建订单，已有订单和权益不受影响。</small></span></label>
</div>}</AdminDialog>;

const GrantDialog: React.FC<{ open: boolean; busy: boolean; users: AdminUser[]; value: typeof emptyGrant; onChange: (value: typeof emptyGrant) => void; onClose: () => void; onSave: () => void }> = ({ open, busy, users, value, onChange, onClose, onSave }) => <AdminDialog open={open} title="手工发放权益" description="直接为指定用户创建一条真实权益记录，不会创建订单或收入记录。" confirmLabel="确认发放权益" tone="success" busy={busy} confirmDisabled={!value.userId || !value.name.trim()} onClose={onClose} onConfirm={onSave}><div className="admin-form-grid">
  <label className="admin-field"><span>用户</span><select value={value.userId} onChange={event => onChange({ ...value, userId: event.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
  <label className="admin-field"><span>权益名称</span><input value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} maxLength={80} /></label>
  <label className="admin-field"><span>有效期单位</span><select value={value.durationUnit} onChange={event => onChange({ ...value, durationUnit: event.target.value })}><option value="days">天</option><option value="months">月</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
  <label className="admin-field"><span>有效期数值</span><input type="number" min="0" disabled={value.durationUnit === 'lifetime'} value={value.durationValue} onChange={event => onChange({ ...value, durationValue: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>面板权益</span><select value={value.panelMode} onChange={event => onChange({ ...value, panelMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>面板次数</span><input type="number" min="0" disabled={value.panelMode !== 'limited'} value={value.panelLimit} onChange={event => onChange({ ...value, panelLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={value.nodeMode} onChange={event => onChange({ ...value, nodeMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>节点次数</span><input type="number" min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeLimit} onChange={event => onChange({ ...value, nodeLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>每日面板上限</span><input type="number" min="0" value={value.dailyPanelLimit} onChange={event => onChange({ ...value, dailyPanelLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>每日节点上限</span><input type="number" min="0" value={value.dailyNodeLimit} onChange={event => onChange({ ...value, dailyNodeLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>并发任务上限</span><input type="number" min="1" value={value.concurrencyLimit} onChange={event => onChange({ ...value, concurrencyLimit: Number(event.target.value) })} /></label>
</div></AdminDialog>;

const QuotaDialog: React.FC<{ value: Entitlement | null; busy: boolean; onChange: (value: Entitlement | null) => void; onClose: () => void; onSave: () => void }> = ({ value, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(value)} title="调整权益额度" description="修改剩余额度时，系统会保留已使用和已冻结数量，并重新计算总额度。" confirmLabel="保存额度调整" busy={busy} onClose={onClose} onConfirm={onSave}>{value && <div className="admin-form-grid">
  <div className="admin-form-context span-2"><strong>{value.username}</strong><span>{value.planName}</span></div>
  <label className="admin-field"><span>面板剩余次数</span><input type="number" min="0" disabled={value.panelMode !== 'limited'} value={value.panelRemaining} onChange={event => onChange({ ...value, panelRemaining: Number(event.target.value) })} /><small>{value.panelMode === 'limited' ? `已用 ${value.panelUsed}，冻结 ${value.panelReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>节点剩余次数</span><input type="number" min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeRemaining} onChange={event => onChange({ ...value, nodeRemaining: Number(event.target.value) })} /><small>{value.nodeMode === 'limited' ? `已用 ${value.nodeUsed}，冻结 ${value.nodeReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>每日面板上限</span><input type="number" min="0" value={value.dailyPanelLimit} onChange={event => onChange({ ...value, dailyPanelLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>每日节点上限</span><input type="number" min="0" value={value.dailyNodeLimit} onChange={event => onChange({ ...value, dailyNodeLimit: Number(event.target.value) })} /></label>
  <label className="admin-field"><span>并发任务上限</span><input type="number" min="1" value={value.concurrencyLimit} onChange={event => onChange({ ...value, concurrencyLimit: Number(event.target.value) })} /></label>
</div>}</AdminDialog>;

const PaymentMethodEditor: React.FC<{ method: PaymentMethod; onChange: (method: PaymentMethod) => void }> = ({ method, onChange }) => {
  const provider = paymentProvider(method);
  const patch = (value: Partial<PaymentMethod>) => onChange({ ...method, ...value });
  const secretPlaceholder = method.merchantSecretConfigured ? '已配置，留空保持不变' : '请输入密钥';
  const privateKeyPlaceholder = method.privateKeyConfigured ? '已配置，留空保持不变' : '粘贴完整私钥内容';
  const apiV3Placeholder = method.apiV3KeyConfigured ? '已配置，留空保持不变' : '输入 32 位 API v3 密钥';
  return <div className="admin-form-grid">
    <label className="admin-field"><span>显示名称</span><input value={method.name} maxLength={40} onChange={event => patch({ name: event.target.value })} /></label>
    <label className="admin-field"><span>唯一标识</span><input value={method.id} maxLength={32} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>订单创建后不建议修改已有标识。</small></label>
    <label className="admin-field"><span>支付驱动</span><select value={provider} onChange={event => { const next = event.target.value as PaymentProvider; patch({ provider: next, type: legacyPaymentType(next), channel: next === 'epay' ? method.channel || 'alipay' : method.channel, enabledChannels: next === 'epay' ? method.enabledChannels || [method.channel || 'alipay'] : method.enabledChannels, currency: defaultPaymentCurrency(next, method) }); }}>
      {provider === 'manual' && <option value="manual">人工收款（历史配置）</option>}
      {provider === 'mgate' && <option value="mgate">MGate（历史配置）</option>}
      <option value="epay">易支付聚合</option>
      <option value="tokenpay">USDT - TokenPay</option>
      <option value="epusdt">USDT - Epusdt</option>
      <option value="paypal">PayPal 官方</option>
      <option value="alipay_official">支付宝官方</option>
      <option value="wechat_official">微信支付官方</option>
    </select></label>
    <label className="admin-field"><span>显示排序</span><input type="number" value={method.sortOrder} onChange={event => patch({ sortOrder: Number(event.target.value) })} /></label>

    {provider === 'manual' && <>
      <label className="admin-field span-2"><span>付款地址</span><input type="url" value={method.paymentUrl} maxLength={1000} placeholder="可选，例如付款码页面或联系客服页面" onChange={event => patch({ paymentUrl: event.target.value })} /></label>
      <label className="admin-field span-2"><span>人工付款说明</span><textarea value={method.instructions} maxLength={1000} placeholder="填写收款账号、付款备注和联系管理员方式" onChange={event => patch({ instructions: event.target.value })} /></label>
    </>}

    {provider !== 'manual' && <>
      <label className="admin-field span-2"><span>前台付款说明</span><input value={method.instructions} maxLength={1000} placeholder="例如：支付完成后系统自动到账" onChange={event => patch({ instructions: event.target.value })} /></label>
      <label className="admin-field span-2"><span>自定义回调域名</span><input type="url" value={method.callbackBaseUrl || ''} onChange={event => patch({ callbackBaseUrl: event.target.value })} placeholder="可选，留空使用系统公网访问地址" /><small>必须是支付平台能够通过公网访问的 HTTP 或 HTTPS 地址。</small></label>
    </>}

    {provider === 'epay' && <>
      <label className="admin-field span-2"><span>支付平台网关地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://pay.example.com/submit.php" /></label>
      <label className="admin-field"><span>商户 PID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <div className="admin-field span-2"><span>用户可选支付方式</span><div className="admin-payment-channel-options">
        {EPAY_CHANNEL_OPTIONS.map(option => <label key={option.value} className="admin-checkbox"><input type="checkbox" checked={(method.enabledChannels || [method.channel || 'alipay']).includes(option.value)} onChange={event => {
          const current = method.enabledChannels || [method.channel || 'alipay'];
          const next = event.target.checked ? [...new Set([...current, option.value])] : current.filter(item => item !== option.value);
          patch({ enabledChannels: next, channel: next[0] || method.channel || 'alipay' });
        }} /><span><strong>{option.label}</strong><small>允许用户在下单时选择</small></span></label>)}
      </div><small>可同时启用多种方式。至少保留一种，实际下单类型会按用户选择传给支付平台。</small></div>
      <SecretField label="商户密钥" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
      <div className="admin-form-context span-2"><strong>异步通知地址</strong><span>保存后在支付列表中复制，填写到支付平台后台的异步通知地址。同步返回地址由系统按当前站点自动生成。</span></div>
    </>}

    {provider === 'mgate' && <>
      <label className="admin-field span-2"><span>MGate API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://gateway.example.com" /></label>
      <label className="admin-field"><span>APP ID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field"><span>源货币</span><select value={method.currency || 'CNY'} onChange={event => patch({ currency: event.target.value })}>{MGATE_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      <SecretField label="App Secret" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'tokenpay' && <>
      <label className="admin-field span-2"><span>TokenPay API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://tokenpay.example.com" /></label>
      <label className="admin-field span-2"><span>USDT 网络</span><select value={tokenPayCurrency(method)} onChange={event => patch({ currency: event.target.value })}>{isLegacyTokenPayCurrency(method) && <option value={tokenPayCurrency(method)}>{tokenPayCurrency(method).replaceAll('_', '-')}（历史配置）</option>}{TOKENPAY_CURRENCIES.map(currency => <option key={currency.value} value={currency.value}>{currency.label}</option>)}</select><small>新通道仅提供 USDT 网络；历史 TRX、ETH、USDC 配置仍可读取并迁移。</small></label>
      <SecretField label="API 密钥" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'epusdt' && <>
      <label className="admin-field span-2"><span>Epusdt API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://epusdt.example.com/api/v1/order/create-transaction" /></label>
      <label className="admin-field span-2"><span>币种</span><select value="USDT-TRC20" onChange={() => patch({ currency: 'USDT-TRC20' })}><option value="USDT-TRC20">USDT-TRC20</option></select><small>Epusdt 当前驱动固定使用 USDT-TRC20。</small></label>
      <SecretField label="签名 Token" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'paypal' && <>
      <label className="admin-field span-2"><span>PayPal API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 PayPal 官方 API 地址" /><small>正式环境默认使用 api-m.paypal.com，沙箱环境默认使用 api-m.sandbox.paypal.com。</small></label>
      <label className="admin-field span-2"><span>Client ID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} autoComplete="off" /></label>
      <SecretField label="Client Secret" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
      <label className="admin-field span-2"><span>Webhook ID</span><input value={method.appId || ''} onChange={event => patch({ appId: event.target.value })} /><small>在 PayPal 开发者后台创建 Webhook 后填写其 ID，用于校验异步通知。</small></label>
      <label className="admin-field span-2"><span>订单币种</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select><small>当前套餐金额按人民币分存储，固定使用 CNY 可避免未换汇直接扣款。</small></label>
      <label className="admin-checkbox span-2"><input type="checkbox" checked={method.sandbox === true} onChange={event => patch({ sandbox: event.target.checked })} /><span><strong>使用 PayPal 沙箱</strong><small>测试时启用并填写沙箱应用的 Client ID、Client Secret 与 Webhook ID。</small></span></label>
    </>}

    {provider === 'alipay_official' && <>
      <label className="admin-field span-2"><span>支付宝网关</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 https://openapi.alipay.com/gateway.do" /></label>
      <label className="admin-field span-2"><span>应用 APPID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field span-2"><span>订单币种</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select></label>
      <label className="admin-field span-2"><span>应用私钥</span><textarea value={method.privateKey || ''} onChange={event => patch({ privateKey: event.target.value })} placeholder={privateKeyPlaceholder} /><small>支持 PEM 或未带头尾的 PKCS8 私钥，保存后不回传明文。</small></label>
      <label className="admin-field span-2"><span>支付宝公钥</span><textarea value={method.publicKey || ''} onChange={event => patch({ publicKey: event.target.value })} placeholder="粘贴支付宝开放平台提供的支付宝公钥" /></label>
      <label className="admin-checkbox span-2"><input type="checkbox" checked={method.sandbox === true} onChange={event => patch({ sandbox: event.target.checked })} /><span><strong>标记为沙箱通道</strong><small>启用后请同时填写支付宝沙箱网关地址与沙箱应用资料。</small></span></label>
    </>}

    {provider === 'wechat_official' && <>
      <label className="admin-field span-2"><span>微信支付 API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 https://api.mch.weixin.qq.com" /></label>
      <label className="admin-field"><span>应用 AppID</span><input value={method.appId || ''} onChange={event => patch({ appId: event.target.value })} /></label>
      <label className="admin-field"><span>商户号</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field"><span>商户证书序列号</span><input value={method.certificateSerial || ''} onChange={event => patch({ certificateSerial: event.target.value })} /></label>
      <label className="admin-field"><span>结算货币</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select></label>
      <label className="admin-field span-2"><span>商户 API 私钥</span><textarea value={method.privateKey || ''} onChange={event => patch({ privateKey: event.target.value })} placeholder={privateKeyPlaceholder} /><small>填写商户 API 证书对应私钥，保存后不回传明文。</small></label>
      <label className="admin-field span-2"><span>微信支付平台证书或公钥</span><textarea value={method.publicKey || ''} onChange={event => patch({ publicKey: event.target.value })} placeholder="粘贴平台证书 PEM 或平台公钥" /></label>
      <SecretField label="API v3 密钥" value={method.apiV3Key || ''} placeholder={apiV3Placeholder} onChange={apiV3Key => patch({ apiV3Key })} help="必须为 32 字节，用于解密支付通知。" />
    </>}

    <label className="admin-checkbox span-2"><input type="checkbox" checked={method.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此支付方式</strong><small>启用前必须填写该驱动要求的全部资料。</small></span></label>
  </div>;
};

const SecretField: React.FC<{ label: string; value: string; placeholder: string; help?: string; onChange: (value: string) => void }> = ({ label, value, placeholder, help, onChange }) => <label className="admin-field span-2"><span>{label}</span><input type="password" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" /><small>{help || '保存后不会再向前端回传明文。'}</small></label>;

function entitlementStatus(item: Entitlement) {
  if (item.status === 'revoked') return 'revoked';
  if (!item.lifetime && item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function durationText(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', years: '年' };
  return `${plan.durationValue} ${units[plan.durationUnit]}`;
}

function paymentProviderText(method: PaymentMethod) {
  return paymentProviderName(paymentProvider(method));
}

function paymentChannelText(method: PaymentMethod) {
  const provider = paymentProvider(method);
  if (provider === 'manual') return '线下确认';
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

function tokenPayCurrency(method: PaymentMethod) {
  const values = [...TOKENPAY_CURRENCIES.map(item => item.value), ...LEGACY_TOKENPAY_CURRENCIES] as readonly string[];
  const configured = String(method.currency || '').toUpperCase().replace(/-/g, '_');
  if (values.includes(configured)) return configured;
  const legacy = String(method.merchantId || '').toUpperCase().replace(/-/g, '_');
  return values.includes(legacy) ? legacy : 'USDT_TRC20';
}

function isLegacyTokenPayCurrency(method: PaymentMethod) {
  return (LEGACY_TOKENPAY_CURRENCIES as readonly string[]).includes(tokenPayCurrency(method));
}

function defaultPaymentCurrency(provider: PaymentProvider, method: PaymentMethod) {
  if (provider === 'tokenpay') return tokenPayCurrency(method);
  if (provider === 'epusdt') return 'USDT-TRC20';
  if (provider === 'paypal') return 'CNY';
  return 'CNY';
}

function paymentProvider(method: PaymentMethod): PaymentProvider {
  if (method.provider) return method.provider;
  if (method.type === 'alipay') return 'alipay_official';
  if (method.type === 'wechat') return 'wechat_official';
  if (method.type === 'epay' || method.type === 'mgate' || method.type === 'tokenpay' || method.type === 'epusdt' || method.type === 'paypal') return method.type;
  return 'manual';
}

function legacyPaymentType(provider: PaymentProvider): PaymentMethod['type'] {
  if (provider === 'alipay_official') return 'alipay';
  if (provider === 'wechat_official') return 'wechat';
  return provider;
}

const EPAY_CHANNEL_OPTIONS = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wxpay', label: '微信支付' },
  { value: 'qqpay', label: 'QQ 钱包' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'usdt.trc20', label: 'USDT' },
] as const;

function paymentProviderName(provider: string) {
  const labels: Record<string, string> = { manual: '人工收款', redeem_code: '卡密兑换', epay: '易支付聚合', mgate: 'MGate', tokenpay: 'USDT / TokenPay', epusdt: 'USDT / Epusdt', paypal: 'PayPal 官方', alipay_official: '支付宝官方', wechat_official: '微信支付官方' };
  return labels[provider] || provider;
}

function paymentChannelName(channelId: string, methods: PaymentMethod[]) {
  return methods.find(method => method.id === channelId)?.name || channelId;
}

function planSnapshotName(order: Order) {
  return String(parsePlanSnapshot(order).name || '套餐快照');
}

function parsePlanSnapshot(order: Order): Record<string, unknown> {
  try {
    const value = JSON.parse(order.planSnapshot);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function auditDetail(value: string) {
  if (!value) return '-';
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item ?? '-')}`).join('，');
  } catch {
    return value;
  }
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
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

function userActionTitle(action: typeof undefined | { user: AdminUser; kind: 'status' | 'role' | 'password'; nextValue?: string } | null) {
  if (!action) return '';
  if (action.kind === 'password') return `重置 ${action.user.username} 的密码`;
  if (action.kind === 'status') return action.nextValue === 'disabled' ? `禁用用户 ${action.user.username}` : `启用用户 ${action.user.username}`;
  return action.nextValue === 'admin' ? `授予 ${action.user.username} 管理员权限` : `移除 ${action.user.username} 的管理员权限`;
}

function userActionDescription(action: typeof undefined | { user: AdminUser; kind: 'status' | 'role' | 'password'; nextValue?: string } | null) {
  if (!action) return '';
  if (action.kind === 'password') return '重置后，该用户的所有现有登录会话会立即失效。';
  if (action.kind === 'status' && action.nextValue === 'disabled') return '禁用后该用户会立即退出登录，且不能继续使用用户端接口。';
  if (action.kind === 'status') return '启用后该用户可以重新登录并使用其有效权益。';
  if (action.nextValue === 'admin') return '管理员账号可以登录管理后台并执行收款、退款、调额等高权限操作。';
  return '移除后该账号只能作为普通用户登录，不能再访问管理后台。';
}
