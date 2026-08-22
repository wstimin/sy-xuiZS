import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BadgeCheck,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardCheck,
  ClipboardCopy,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileClock,
  FileText,
  Headphones,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Network,
  PackagePlus,
  Pencil,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  api,
  AdminExceptions,
  ContactMethod,
  ContactSettings,
  CurrentUser,
  DatabaseBackupValidation,
  DeploymentRecord,
  Entitlement,
  formatDate,
  formatMoney,
  Order,
  OrderDetail,
  PaymentAttempt,
  PaymentCheckResult,
  PaymentMethod,
  PaymentNotification,
  PaymentProvider,
  EmailSettings,
  Plan,
  RedeemCode,
  ResourceRecommendation,
  ResourceRecommendationSettings,
  quotaText,
} from '../commercial';
import { copyToClipboard } from '../utils/clipboard';
import { ChangePasswordForm } from './ChangePasswordForm';
import { NumberInput } from './NumberInput';
import { AdminDialog } from './admin/AdminDialog';

type AdminTab = 'dashboard' | 'orders' | 'plans' | 'redeem-codes' | 'users' | 'entitlements' | 'ledger' | 'deployments' | 'audit' | 'settings' | 'security';
type SettingsSection = 'general' | 'recommendations' | 'email' | 'payments';
type SettingsDialog = 'order' | 'redeem' | 'contact' | 'smtp' | 'sender' | 'verification' | 'test-email' | null;
type AdminUser = { id: string; username: string; email: string | null; emailVerified: boolean; role: 'user' | 'admin'; status: 'active' | 'disabled'; createdAt: string; lastLoginAt?: string };
type UsageLedgerEntry = { id: string; userId: string; username: string; entitlementId: string; planName: string; deploymentId?: string; capability: 'panel' | 'node'; action: 'grant' | 'reserve' | 'consume' | 'release' | 'adjust'; amount: number; note: string; createdAt: string };
type AuditLog = { id: string; adminUserId: string; adminUsername: string; action: string; targetType: string; targetId: string; detail: string; createdAt: string };
type UserDetail = { user: AdminUser; orders: Order[]; entitlements: Entitlement[]; deployments: DeploymentRecord[] };
type UserProfileTab = 'overview' | 'entitlements' | 'orders' | 'deployments' | 'ledger';
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
type SystemSettings = { registrationEnabled: boolean; panelDeployEnabled: boolean; nodeDeployEnabled: boolean; paymentInstructions: string; paymentMethods: PaymentMethod[]; email: EmailSettings; orderExpiryMinutes: number; adminPath: string; redeemCodePurchaseUrl: string; contact: ContactSettings; recommendations: ResourceRecommendationSettings };
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
  homepageVisible: false,
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
const emptyContactSettings: ContactSettings = { enabled: false, buttonLabel: '立即咨询', title: '联系站长', description: '', methods: [] };
const contactTypeLabels: Record<ContactMethod['type'], string> = {
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
const emptyContactMethod = (): ContactMethod => ({
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
const emptyRecommendationSettings: ResourceRecommendationSettings = { serverEnabled: true, residentialIpEnabled: true, items: [] };
const emptyRecommendation = (): ResourceRecommendation => ({
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
const TOKENPAY_CURRENCIES = [
  { value: 'USDT_TRC20', label: 'USDT-TRC20' },
  { value: 'USDT_ERC20', label: 'USDT-ERC20' },
] as const;
const LEGACY_TOKENPAY_CURRENCIES = ['TRX', 'ETH', 'USDC_ERC20'] as const;
const MGATE_CURRENCIES = ['CNY', 'USD', 'EUR', 'HKD', 'TWD', 'JPY', 'KRW', 'SGD'] as const;
const emptyAdminExceptions: AdminExceptions = { summary: { total: 0, critical: 0, warning: 0 }, items: [] };
const DATABASE_CONTENT_TYPE = 'application/vnd.sqlite3';

const navigationGroups: Array<{ label: string; items: Array<{ id: AdminTab; label: string; icon: React.ElementType; tone: string }> }> = [
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
const navigation = navigationGroups.flatMap(group => group.items);

const adminTabMeta: Record<AdminTab, { area: string; description: string }> = {
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
  const [exceptions, setExceptions] = useState<AdminExceptions>(emptyAdminExceptions);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<UsageLedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [paymentAttempts, setPaymentAttempts] = useState<PaymentAttempt[]>([]);
  const [paymentNotifications, setPaymentNotifications] = useState<PaymentNotification[]>([]);
  const [paymentRuntimeOpen, setPaymentRuntimeOpen] = useState(false);
  const [redeemCodes, setRedeemCodes] = useState<RedeemCode[]>([]);
  const [settingsData, setSettingsData] = useState<SystemSettings>({ registrationEnabled: true, panelDeployEnabled: true, nodeDeployEnabled: true, paymentInstructions: '', paymentMethods: [], email: emptyEmailSettings, orderExpiryMinutes: 30, adminPath: 'admin', redeemCodePurchaseUrl: '', contact: emptyContactSettings, recommendations: emptyRecommendationSettings });
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState('');
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false);
  const [savedPaymentMethodIds, setSavedPaymentMethodIds] = useState<string[]>([]);
  const [savedRecommendationIds, setSavedRecommendationIds] = useState<string[]>([]);
  const [paymentChecks, setPaymentChecks] = useState<Record<string, PaymentCheckResult>>({});
  const [paymentCheckBusy, setPaymentCheckBusy] = useState('');
  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [databaseValidation, setDatabaseValidation] = useState<DatabaseBackupValidation | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [savedContactMethodIds, setSavedContactMethodIds] = useState<string[]>([]);
  const [accountUsername, setAccountUsername] = useState(currentUser.username);
  const [adminPathDraft, setAdminPathDraft] = useState('admin');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsDialog, setSettingsDialog] = useState<SettingsDialog>(null);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<{ index: number; method: PaymentMethod } | null>(null);
  const [deletingPaymentMethod, setDeletingPaymentMethod] = useState<{ index: number; method: PaymentMethod } | null>(null);
  const [editingRecommendation, setEditingRecommendation] = useState<{ index: number; item: ResourceRecommendation } | null>(null);
  const [deletingRecommendation, setDeletingRecommendation] = useState<{ index: number; item: ResourceRecommendation } | null>(null);
  const [editingContactMethod, setEditingContactMethod] = useState<{ index: number; method: ContactMethod } | null>(null);
  const [deletingContactMethod, setDeletingContactMethod] = useState<{ index: number; method: ContactMethod } | null>(null);
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
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState(emptyGrant);
  const [editingEntitlement, setEditingEntitlement] = useState<Entitlement | null>(null);
  const [entitlementAction, setEntitlementAction] = useState<Entitlement | null>(null);
  const [deploymentAction, setDeploymentAction] = useState<{ item: DeploymentRecord; resolution: 'succeeded' | 'failed' } | null>(null);
  const [creatingUser, setCreatingUser] = useState<null | typeof emptyUser>(null);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [repairOrder, setRepairOrder] = useState<Order | null>(null);
  const [viewDeployment, setViewDeployment] = useState<DeploymentRecord | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userProfileTab, setUserProfileTab] = useState<UserProfileTab>('overview');
  const [detailLoading, setDetailLoading] = useState(false);
  const [redeemCodeDraft, setRedeemCodeDraft] = useState({ planId: '', quantity: 10, note: '', expiresAt: '' });
  const [redeemCodeDialogOpen, setRedeemCodeDialogOpen] = useState(false);
  const [createdRedeemCodes, setCreatedRedeemCodes] = useState<CreatedRedeemCode[]>([]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [statsResult, exceptionResult, plansResult, ordersResult, usersResult, entitlementResult, deploymentResult, ledgerResult, auditResult, settingsResult, attemptResult, notificationResult, redeemCodeResult] = await Promise.all([
        api<{ stats: Stats }>('/api/admin/stats'),
        api<AdminExceptions>('/api/admin/exceptions'),
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
      setExceptions(exceptionResult);
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
      setSavedSettingsSnapshot(JSON.stringify(settingsResult.settings));
      setSavedPaymentMethodIds(settingsResult.settings.paymentMethods.map(method => method.id));
      setSavedRecommendationIds(settingsResult.settings.recommendations.items.map(item => item.id));
      setPaymentChecks(current => Object.fromEntries(Object.entries(current).filter(([id]) => settingsResult.settings.paymentMethods.some(method => method.id === id))));
      setSavedContactMethodIds(settingsResult.settings.contact.methods.map(method => method.id));
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
  useEffect(() => {
    setQuery('');
    setStatusFilter('all');
    setPage(1);
    setMobileNavOpen(false);
  }, [tab]);
  useEffect(() => { setPage(1); }, [query, statusFilter]);

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
    const diagnosis = order.diagnosis;
    const matchesQuery = !normalizedQuery || `${order.orderNo} ${order.username || ''} ${order.paymentTradeNo || ''} ${diagnosis?.processingLabel || ''}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === 'all' || diagnosis?.processingStatus === statusFilter || order.status === statusFilter);
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

  const openUserDetail = async (user: AdminUser, profileTab: UserProfileTab = 'overview') => {
    setUserProfileTab(profileTab);
    setDetailLoading(true);
    try {
      setUserDetail(await api<UserDetail>(`/api/admin/users/${user.id}/detail`));
    } catch (error) {
      showToast('客户档案加载失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const openUserById = (userId?: string, profileTab: UserProfileTab = 'overview') => {
    const user = users.find(item => item.id === userId);
    if (user) void openUserDetail(user, profileTab);
  };
  const userProfileLedger = useMemo(() => userDetail ? ledgerEntries.filter(item => item.userId === userDetail.user.id) : [], [ledgerEntries, userDetail]);

  const activeList = tab === 'orders' ? filteredOrders : tab === 'plans' ? filteredPlans : tab === 'redeem-codes' ? filteredRedeemCodes : tab === 'users' ? filteredUsers : tab === 'entitlements' ? filteredEntitlements : tab === 'ledger' ? filteredLedger : tab === 'deployments' ? filteredDeployments : tab === 'audit' ? filteredAudit : [];
  const pageCount = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const currentTitle = navigation.find(item => item.id === tab)?.label || '管理后台';
  const currentMeta = adminTabMeta[tab];
  const settingsDirty = Boolean(savedSettingsSnapshot) && JSON.stringify(settingsData) !== savedSettingsSnapshot;
  const currentContext = tab === 'dashboard'
    ? `${exceptions.summary.total} 项业务异常`
    : activeList.length > 0
      ? `${activeList.length} 条当前结果`
      : tab === 'settings'
        ? `${settingsData.paymentMethods.filter(method => method.enabled).length} 个支付渠道启用`
        : tab === 'security'
          ? `管理员 ${currentUser.username}`
          : '当前无匹配记录';

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
    setSettingsSaveBusy(true);
    try {
      await runAction('系统设置已保存', '/api/admin/settings', { method: 'PUT', body: JSON.stringify(settingsData) });
    } finally {
      setSettingsSaveBusy(false);
    }
  };

  const settingsSaveAction = (
    <button type="button" className={`admin-button primary ${settingsDirty ? '' : 'quiet'}`} disabled={busy || !settingsDirty} onClick={() => void saveSettings()}>
      <Save /> {settingsSaveBusy ? '正在保存' : settingsDirty ? '保存更改' : '已保存'}
    </button>
  );

  const updateContactMethod = (index: number, patch: Partial<ContactMethod>) => {
    setSettingsData(value => ({
      ...value,
      contact: {
        ...value.contact,
        methods: value.contact.methods.map((method, methodIndex) => methodIndex === index ? { ...method, ...patch } : method),
      },
    }));
  };

  const openNewContactMethod = () => {
    if (settingsData.contact.methods.length >= 10) return showToast('已达到联系方式上限', '最多可以配置 10 种联系方式', 'warning');
    setSettingsDialog(null);
    setEditingContactMethod({ index: -1, method: emptyContactMethod() });
  };

  const openContactMethodEditor = (index: number, method: ContactMethod) => {
    setSettingsDialog(null);
    setEditingContactMethod({ index, method: { ...method } });
  };

  const openContactMethodDelete = (index: number, method: ContactMethod) => {
    setSettingsDialog(null);
    setDeletingContactMethod({ index, method });
  };

  const returnToContactSettings = () => {
    setEditingContactMethod(null);
    setDeletingContactMethod(null);
    setSettingsDialog('contact');
  };

  const saveContactMethodDraft = () => {
    if (!editingContactMethod) return;
    const normalized = {
      ...editingContactMethod.method,
      id: editingContactMethod.method.id.trim().toLowerCase(),
      name: editingContactMethod.method.name.trim(),
      value: editingContactMethod.method.value.trim(),
      contactUrl: editingContactMethod.method.contactUrl.trim(),
      qrCodeUrl: editingContactMethod.method.qrCodeUrl.trim(),
    };
    const duplicate = settingsData.contact.methods.some((method, index) => method.id === normalized.id && index !== editingContactMethod.index);
    if (duplicate) return showToast('联系方式标识重复', '请为每种联系方式填写不同的唯一标识', 'warning');
    setSettingsData(value => ({
      ...value,
      contact: {
        ...value.contact,
        methods: editingContactMethod.index < 0
          ? [...value.contact.methods, normalized]
          : value.contact.methods.map((method, index) => index === editingContactMethod.index ? normalized : method),
      },
    }));
    setEditingContactMethod(null);
    setSettingsDialog('contact');
  };

  const removeContactMethod = (index: number) => {
    setSettingsData(value => ({ ...value, contact: { ...value.contact, methods: value.contact.methods.filter((_method, methodIndex) => methodIndex !== index) } }));
  };

  const uploadContactQr = async (index: number, method: ContactMethod, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('图片格式不支持', '请选择 PNG、JPEG 或 WebP 图片', 'warning');
    if (file.size > 1024 * 1024) return showToast('图片过大', '咨询二维码不能超过 1MB', 'warning');
    if (!savedContactMethodIds.includes(method.id)) return showToast('请先保存联系方式', '点击右上角“保存更改”后再上传二维码', 'warning');
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      await api(`/api/admin/contact-methods/${encodeURIComponent(method.id)}/qr`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
      updateContactMethod(index, { qrCodeUploaded: true });
      setEditingContactMethod(current => current && current.index === index
        ? { ...current, method: { ...current.method, qrCodeUploaded: true } }
        : current);
      showToast(`${method.name}二维码已上传`, '前台会优先显示上传的图片', 'success');
    } catch (error) {
      showToast('二维码上传失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteContactQr = async (index: number, method: ContactMethod) => {
    setBusy(true);
    try {
      await api(`/api/admin/contact-methods/${encodeURIComponent(method.id)}/qr`, { method: 'DELETE' });
      updateContactMethod(index, { qrCodeUploaded: false });
      setEditingContactMethod(current => current && current.index === index
        ? { ...current, method: { ...current.method, qrCodeUploaded: false } }
        : current);
      showToast('已删除上传的二维码', method.qrCodeUrl ? '前台将改用填写的二维码图片地址' : '该联系方式将不再显示二维码', 'success');
    } catch (error) {
      showToast('二维码删除失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    try {
      await api('/api/admin/settings/test-email', { method: 'POST', body: JSON.stringify({ recipient: testEmailRecipient }) });
      setSettingsDialog(null);
      showToast('测试邮件已发送', '请检查收件箱和垃圾邮件目录', 'success');
    } catch (error) {
      showToast('测试邮件发送失败', error instanceof Error ? error.message : '请检查已保存的 SMTP 配置', 'error');
    } finally {
      setBusy(false);
    }
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

  const deleteUser = async () => {
    if (!deletingUser) return;
    await runAction('客户及关联数据已永久删除', `/api/admin/users/${deletingUser.id}`, {
      method: 'DELETE',
    }, () => {
      setDeletingUser(null);
      setUserDetail(null);
    });
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

  const disableAllPaymentMethods = () => {
    setSettingsData(value => ({
      ...value,
      paymentMethods: value.paymentMethods.map(method => ({ ...method, enabled: false })),
    }));
    showToast('已切换为仅卡密模式', '所有在线支付渠道已在草稿中停用，请点击“保存更改”生效', 'success');
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

  const checkPaymentMethod = async (method: PaymentMethod) => {
    if (!savedPaymentMethodIds.includes(method.id)) return showToast('请先保存支付方式', '检测只读取数据库中已保存的配置', 'warning');
    setPaymentCheckBusy(method.id);
    try {
      const response = await api<{ result: PaymentCheckResult }>(`/api/admin/payment-methods/${encodeURIComponent(method.id)}/check`, { method: 'POST' });
      setPaymentChecks(current => ({ ...current, [method.id]: response.result }));
      const toastType = response.result.status === 'ready' ? 'success' : response.result.status === 'disabled' ? 'info' : 'warning';
      showToast('支付渠道检测完成', response.result.message, toastType);
    } catch (error) {
      showToast('支付渠道检测失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setPaymentCheckBusy('');
    }
  };

  const downloadDatabaseBackup = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/database/backup');
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `备份下载失败（HTTP ${response.status}）`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || `xui-backup-${new Date().toISOString().slice(0, 10)}.db`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast('数据库备份已下载', `${Math.max(1, Math.round(blob.size / 1024))} KB`, 'success');
    } catch (error) {
      showToast('数据库备份失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectDatabaseFile = (file?: File) => {
    setDatabaseValidation(null);
    setRestoreConfirmation('');
    if (!file) return setDatabaseFile(null);
    if (!file.name.toLowerCase().endsWith('.db')) {
      setDatabaseFile(null);
      return showToast('备份文件格式不正确', '请选择扩展名为 .db 的 SQLite 数据库备份', 'warning');
    }
    if (file.size > 64 * 1024 * 1024) {
      setDatabaseFile(null);
      return showToast('备份文件过大', '数据库备份不能超过 64MB', 'warning');
    }
    setDatabaseFile(file);
  };

  const validateDatabaseFile = async () => {
    if (!databaseFile) return showToast('请选择数据库备份', '上传 .db 文件后再进行校验', 'warning');
    setBusy(true);
    setDatabaseValidation(null);
    try {
      const response = await fetch('/api/admin/database/validate', {
        method: 'POST',
        headers: { 'Content-Type': DATABASE_CONTENT_TYPE },
        body: databaseFile,
      });
      const data = await response.json().catch(() => ({})) as { validation?: DatabaseBackupValidation; error?: string };
      if (!response.ok || !data.validation) throw new Error(data.error || `备份校验失败（HTTP ${response.status}）`);
      setDatabaseValidation(data.validation);
      showToast('数据库备份校验通过', '可以进入恢复确认步骤', 'success');
    } catch (error) {
      showToast('数据库备份不可用', error instanceof Error ? error.message : '请选择其他备份文件', 'error');
    } finally {
      setBusy(false);
    }
  };

  const restoreDatabase = async () => {
    if (!databaseFile || !databaseValidation || restoreConfirmation !== 'RESTORE') return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': DATABASE_CONTENT_TYPE, 'x-restore-confirmation': restoreConfirmation },
        body: databaseFile,
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || `数据库恢复失败（HTTP ${response.status}）`);
      setRestoreDialogOpen(false);
      showToast('数据库已恢复', '全部登录会话已失效，请重新登录', 'success');
      window.setTimeout(onSessionEnded, 300);
    } catch (error) {
      showToast('数据库恢复失败', error instanceof Error ? error.message : '当前数据库未被替换', 'error');
      setBusy(false);
    }
  };

  const updateRecommendation = (index: number, patch: Partial<ResourceRecommendation>) => {
    setSettingsData(value => ({
      ...value,
      recommendations: {
        ...value.recommendations,
        items: value.recommendations.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      },
    }));
  };

  const openNewRecommendation = () => {
    if (settingsData.recommendations.items.length >= 20) return showToast('已达到推荐数量上限', '服务器与住宅 IP 推荐合计最多 20 项', 'warning');
    setEditingRecommendation({ index: -1, item: emptyRecommendation() });
  };

  const saveRecommendationDraft = () => {
    if (!editingRecommendation) return;
    const normalized = {
      ...editingRecommendation.item,
      id: editingRecommendation.item.id.trim().toLowerCase(),
      name: editingRecommendation.item.name.trim(),
      purchaseUrl: editingRecommendation.item.purchaseUrl.trim(),
      buttonLabel: editingRecommendation.item.buttonLabel.trim() || '了解详情',
    };
    const duplicate = settingsData.recommendations.items.some((item, index) => item.id === normalized.id && index !== editingRecommendation.index);
    if (duplicate) return showToast('推荐项标识重复', '请为每个推荐项填写不同的唯一标识', 'warning');
    setSettingsData(value => ({
      ...value,
      recommendations: {
        ...value.recommendations,
        items: editingRecommendation.index < 0
          ? [...value.recommendations.items, normalized]
          : value.recommendations.items.map((item, index) => index === editingRecommendation.index ? normalized : item),
      },
    }));
    setEditingRecommendation(null);
  };

  const removeRecommendation = (index: number) => {
    setSettingsData(value => ({ ...value, recommendations: { ...value.recommendations, items: value.recommendations.items.filter((_item, itemIndex) => itemIndex !== index) } }));
  };

  const uploadRecommendationLogo = async (index: number, item: ResourceRecommendation, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('图片格式不支持', '请选择 PNG、JPEG 或 WebP 图片', 'warning');
    if (file.size > 1024 * 1024) return showToast('图片过大', '推荐 Logo 不能超过 1MB', 'warning');
    if (!savedRecommendationIds.includes(item.id)) return showToast('请先保存推荐项', '点击右上角“保存更改”后再上传 Logo', 'warning');
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      await api(`/api/admin/resource-recommendations/${encodeURIComponent(item.id)}/logo`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
      updateRecommendation(index, { logoUploaded: true });
      setEditingRecommendation(current => current && current.index === index ? { ...current, item: { ...current.item, logoUploaded: true } } : current);
      showToast('推荐 Logo 已上传', '前台会优先显示上传的图片', 'success');
    } catch (error) {
      showToast('Logo 上传失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteRecommendationLogo = async (index: number, item: ResourceRecommendation) => {
    setBusy(true);
    try {
      await api(`/api/admin/resource-recommendations/${encodeURIComponent(item.id)}/logo`, { method: 'DELETE' });
      updateRecommendation(index, { logoUploaded: false });
      setEditingRecommendation(current => current && current.index === index ? { ...current, item: { ...current.item, logoUploaded: false } } : current);
      showToast('推荐 Logo 已删除', item.logoUrl ? '前台将改用填写的 Logo 图片地址' : '前台将显示默认图标', 'success');
    } catch (error) {
      showToast('Logo 删除失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const fetchRecommendationLogo = async (index: number, item: ResourceRecommendation) => {
    if (!item.purchaseUrl.trim()) return showToast('请先填写跳转链接', '系统会从厂商网站查找站点图标', 'warning');
    if (!savedRecommendationIds.includes(item.id)) return showToast('请先保存推荐项', '点击右上角“保存更改”后再自动获取 Logo', 'warning');
    setBusy(true);
    try {
      await api(`/api/admin/resource-recommendations/${encodeURIComponent(item.id)}/logo/fetch`, { method: 'POST', body: JSON.stringify({ websiteUrl: item.purchaseUrl }) });
      updateRecommendation(index, { logoUploaded: true });
      setEditingRecommendation(current => current && current.index === index ? { ...current, item: { ...current.item, logoUploaded: true } } : current);
      showToast('Logo 获取成功', '已从厂商网站获取并保存到本站', 'success');
    } catch (error) {
      showToast('自动获取失败', error instanceof Error ? error.message : '可改用手动上传或填写 Logo 地址', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openOrderDetail = async (order: Order) => {
    setViewOrder(order);
    setOrderDetail(null);
    setOrderDetailLoading(true);
    try {
      setOrderDetail(await api<OrderDetail>(`/api/admin/orders/${order.id}/detail`));
    } catch (error) {
      setViewOrder(null);
      showToast('订单详情加载失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setOrderDetailLoading(false);
    }
  };

  const confirmRepairEntitlement = async () => {
    if (!repairOrder) return;
    setBusy(true);
    try {
      const result = await api<{ detail: OrderDetail }>(`/api/admin/orders/${repairOrder.id}/repair-entitlement`, { method: 'POST' });
      await load(true);
      setRepairOrder(null);
      setViewOrder(result.detail.order);
      setOrderDetail(result.detail);
      showToast('订单权益已补发', '异常订单已恢复为付款与权益均完成', 'success');
    } catch (error) {
      showToast('补发权益失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
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
      <aside id="admin-navigation" className={`admin-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-brand">
          <span className="admin-brand-mark"><Terminal /></span>
          <div><strong>X-UI CONTROL</strong><small>运营管理系统</small></div>
        </div>
        <nav className="admin-navigation">
          {navigationGroups.map(group => <section className="admin-nav-group" key={group.label}>
            <div className="admin-nav-section">{group.label}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              return <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setMobileNavOpen(false); }}><span className={`admin-nav-icon ${item.tone}`}><Icon /></span><span>{item.label}</span>{item.id === 'orders' && Boolean(stats?.pendingOrders) && <b>{stats?.pendingOrders}</b>}{item.id === 'deployments' && Boolean(stats?.uncertain) && <b className="warning">{stats?.uncertain}</b>}</button>;
            })}
          </section>)}
        </nav>
        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-account"><div className="admin-avatar">{currentUser.username.slice(0, 1).toUpperCase()}</div><div><strong>{currentUser.username}</strong><small>系统管理员</small></div><button type="button" className="admin-sidebar-logout" title="退出管理端" onClick={onLogout}><LogOut /><span>退出</span></button></div>
        </div>
      </aside>
      {mobileNavOpen && <button type="button" className="admin-sidebar-overlay" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" />}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title"><button type="button" className="admin-mobile-menu" onClick={() => setMobileNavOpen(value => !value)} title={mobileNavOpen ? '关闭导航' : '打开导航'} aria-label={mobileNavOpen ? '关闭导航' : '打开导航'} aria-controls="admin-navigation" aria-expanded={mobileNavOpen}>{mobileNavOpen ? <X /> : <Menu />}</button><div className="admin-breadcrumb"><span>管理后台</span><ChevronRight /><strong>{currentMeta.area}</strong><ChevronRight /><b>{currentTitle}</b></div></div>
          <div className="admin-topbar-actions">
            <span className="admin-topbar-context"><i />{currentContext}</span>
            {activeList.length > 0 && <button type="button" className="admin-button secondary admin-export-button" onClick={exportCurrent}><Download /> 导出当前列表</button>}
            <a href="/" target="_blank" rel="noreferrer">打开用户端 <ExternalLink /></a>
            <button type="button" className="admin-icon-button" onClick={() => void load()} disabled={loading} title="刷新全部数据"><RefreshCw className={loading ? 'spinning' : ''} /></button>
          </div>
        </header>

        <main className="admin-content">
          {loading ? <AdminPageLoading /> : <>
            {tab === 'dashboard' && <Dashboard stats={stats} exceptions={exceptions} orders={orders} deployments={deployments} onNavigate={setTab} onOpenOrder={order => void openOrderDetail(order)} onOpenDeployment={setViewDeployment} />}

            {tab === 'orders' && <AdminSection title="订单管理" description="核对用户订单、人工收款、取消待付订单与退款撤权。" action={<button type="button" className="admin-button secondary" onClick={() => setPaymentRuntimeOpen(true)}><Activity /> 支付记录</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索订单号、用户、交易号或处理状态" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部处理状态'], ['paid_missing_entitlement', '已付款但缺少权益'], ['payment_attention', '支付链路需核对'], ['completed', '付款与权益完成'], ['paid_entitlement_inactive', '已付款但权益不可用'], ['pending_payment', '等待用户付款'], ['expired', '订单已过期'], ['cancelled', '订单已取消'], ['refunded', '订单已退款']]} />
              <AdminTable columns={['订单信息', '用户', '金额', '订单状态', '处理状态', '支付信息', '创建时间', '操作']} empty="没有符合条件的订单">
                {filteredOrders.slice(pageStart, pageStart + PAGE_SIZE).map(order => <tr key={order.id}>
                  <td><strong className="admin-primary-text">{order.orderNo}</strong><small className="admin-cell-sub">{planSnapshotName(order)}</small></td>
                  <td>{order.username ? <button type="button" className="admin-record-link" onClick={() => openUserById(order.userId, 'orders')}>{order.username}</button> : '-'}</td><td className="admin-money">{formatMoney(order.amountCents)}</td><td><StatusBadge status={order.status} /></td><td>{order.diagnosis ? <DiagnosisBadge diagnosis={order.diagnosis} /> : <span className="admin-muted">-</span>}</td>
                  <td>{order.paymentTradeNo ? <><span>{paymentProviderName(order.paymentProvider || 'manual')}</span><small className="admin-cell-sub">{order.paymentTradeNo}</small></> : <span className="admin-muted">未支付</span>}</td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看订单详情" disabled={orderDetailLoading} onClick={() => void openOrderDetail(order)}><Eye /></button>{order.status === 'pending' && <><button className="admin-link success" onClick={() => { setPaymentOrder(order); setTradeNo(''); }}>确认收款</button><button className="admin-link danger" onClick={() => setCancelOrder(order)}>取消</button></>}{order.status === 'paid' && order.paymentProvider !== 'redeem_code' && <button className="admin-link warning" onClick={() => { setRefundOrder(order); setRefundTradeNo(''); setRefundReason(''); }}>登记外部退款</button>}</div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredOrders.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'plans' && <AdminSection title="套餐管理" description="配置一次性服务、周期会员与对应的面板和节点使用额度。" action={<button className="admin-button primary" onClick={() => setEditingPlan({ ...emptyPlan })}><PackagePlus /> 新增套餐</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索套餐名称或说明" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['enabled', '已上架'], ['disabled', '已下架']]} />
              <AdminTable columns={['套餐', '价格与有效期', '面板额度', '节点额度', '每日/并发限制', '官网首页', '状态', '操作']} empty="没有符合条件的套餐">
                {filteredPlans.slice(pageStart, pageStart + PAGE_SIZE).map(plan => <tr key={plan.id}>
                  <td><strong className="admin-primary-text">{plan.name}</strong><small className="admin-cell-sub admin-truncate">{plan.description || '暂无说明'}</small></td>
                  <td><strong>{formatMoney(plan.priceCents)}</strong><small className="admin-cell-sub">{durationText(plan)}</small></td>
                  <td>{quotaText(plan.panelMode, plan.panelLimit)}</td><td>{quotaText(plan.nodeMode, plan.nodeLimit)}</td>
                  <td><span>每日 {plan.dailyPanelLimit || '不限'} / {plan.dailyNodeLimit || '不限'}</span><small className="admin-cell-sub">并发 {plan.concurrencyLimit}</small></td>
                  <td>{plan.homepageVisible ? <span className="admin-link success">展示</span> : <span className="admin-muted">隐藏</span>}</td>
                  <td><StatusBadge status={plan.enabled ? 'enabled' : 'disabled'} /></td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="编辑套餐" onClick={() => setEditingPlan({ ...plan })}><Pencil /></button><button className="admin-icon-button small" title="复制套餐" onClick={() => setEditingPlan({ ...plan, id: undefined, name: `${plan.name} 副本`, enabled: false, homepageVisible: false })}><ClipboardCopy /></button><button className={plan.homepageVisible ? 'admin-link warning' : 'admin-link success'} onClick={() => void runAction(plan.homepageVisible ? '已从官网首页隐藏' : '已在官网首页展示', `/api/admin/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ ...plan, homepageVisible: !plan.homepageVisible }) })}>{plan.homepageVisible ? '首页隐藏' : '首页展示'}</button><button className={plan.enabled ? 'admin-link danger' : 'admin-link success'} onClick={() => void runAction(plan.enabled ? '套餐已下架' : '套餐已上架', `/api/admin/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ ...plan, enabled: !plan.enabled }) })}>{plan.enabled ? '下架' : '上架'}</button></div></td>
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

            {tab === 'users' && <AdminSection title="客户列表" description="按客户查找账号，并集中进入其权益、订单、搭建任务和额度记录。" action={<button className="admin-button primary" onClick={() => setCreatingUser({ ...emptyUser })}><UserPlus /> 创建客户</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户名或邮箱" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部用户'], ['active', '正常'], ['disabled', '已禁用'], ['user', '普通用户'], ['admin', '管理员']]} />
              <AdminTable columns={['用户', '角色', '状态', '注册时间', '最后登录', '操作']} empty="没有符合条件的用户">
                {filteredUsers.slice(pageStart, pageStart + PAGE_SIZE).map(user => <tr key={user.id}>
                  <td><button type="button" className="admin-user-cell admin-user-cell-button" disabled={detailLoading} onClick={() => void openUserDetail(user)}><span>{user.username.slice(0, 1).toUpperCase()}</span><div><strong>{user.username}</strong><small>{user.email || (user.id === currentUser.id ? '当前账号' : '未绑定邮箱')}</small></div></button></td>
                  <td><StatusBadge status={user.role} /></td><td><StatusBadge status={user.status} /></td><td>{formatDate(user.createdAt)}</td><td>{user.lastLoginAt ? formatDate(user.lastLoginAt) : <span className="admin-muted">从未登录</span>}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看用户详情" disabled={detailLoading} onClick={() => void openUserDetail(user)}><Eye /></button><button className="admin-link" disabled={user.id === currentUser.id} onClick={() => setUserAction({ user, kind: 'role', nextValue: user.role === 'admin' ? 'user' : 'admin' })}>{user.role === 'admin' ? '移除管理员' : '设为管理员'}</button><button className={user.status === 'active' ? 'admin-link danger' : 'admin-link success'} disabled={user.id === currentUser.id} onClick={() => setUserAction({ user, kind: 'status', nextValue: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? '禁用' : '启用'}</button><button className="admin-icon-button small" disabled={user.id === currentUser.id} title="重置密码" onClick={() => { setUserAction({ user, kind: 'password' }); setNextPassword(''); setConfirmPassword(''); }}><KeyRound /></button><button className="admin-icon-button small danger" disabled={user.id === currentUser.id} title="永久删除客户" onClick={() => setDeletingUser(user)}><Trash2 /></button></div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredUsers.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'entitlements' && <AdminSection title="权益管理" description="查看和调整用户实际可用的面板、节点次数与执行限制。" action={<button className="admin-button primary" onClick={() => setGrantOpen(true)}><BadgeCheck /> 发放权益</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户或权益名称" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['active', '有效'], ['expired', '已过期'], ['revoked', '已撤销']]} />
              <AdminTable columns={['用户与权益', '面板额度', '节点额度', '每日/并发限制', '有效期', '状态', '操作']} empty="没有符合条件的权益">
                {filteredEntitlements.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td>{item.username ? <button type="button" className="admin-record-link stacked" onClick={() => openUserById(item.userId, 'entitlements')}><strong>{item.username}</strong><small>{item.planName}</small></button> : <><strong className="admin-primary-text">-</strong><small className="admin-cell-sub">{item.planName}</small></>}</td>
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
                {filteredLedger.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}><td><button type="button" className="admin-record-link stacked" onClick={() => openUserById(item.userId, 'ledger')}><strong>{item.username}</strong><small>{item.planName}</small></button></td><td>{item.capability === 'panel' ? '面板额度' : '节点额度'}</td><td><StatusBadge status={item.action} /></td><td className={item.amount > 0 ? 'admin-number-positive' : item.amount < 0 ? 'admin-number-negative' : ''}>{item.amount > 0 ? `+${item.amount}` : item.amount}</td><td>{item.note || '-'}</td><td className="admin-code">{item.deploymentId ? item.deploymentId.slice(0, 8) : '-'}</td><td>{formatDate(item.createdAt)}</td></tr>)}
              </AdminTable>
              <Pagination total={filteredLedger.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'deployments' && <AdminSection title="搭建任务" description="追踪面板安装和节点创建的真实执行记录，人工核对结果不确定的任务。">
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索用户、请求编号或目标地址" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部任务'], ['uncertain', '待人工核对'], ['running', '执行中'], ['succeeded', '成功'], ['failed', '失败'], ['panel', '面板任务'], ['node', '节点任务']]} />
              <AdminTable columns={['任务信息', '用户', '类型', '目标', '状态', '结果', '时间', '操作']} empty="没有符合条件的交付任务">
                {filteredDeployments.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td><strong className="admin-primary-text admin-code">{item.requestId}</strong><small className="admin-cell-sub">{item.id.slice(0, 8)}</small></td><td>{item.username ? <button type="button" className="admin-record-link" onClick={() => openUserById(item.userId, 'deployments')}>{item.username}</button> : '-'}</td><td>{item.capability === 'panel' ? '面板安装' : '节点创建'}</td><td className="admin-code">{item.targetHostMasked || '-'}</td><td><StatusBadge status={item.status} /></td><td><span className="admin-result-text">{item.resultSummary || item.errorMessage || '-'}</span></td><td>{formatDate(item.createdAt)}</td>
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

            {tab === 'settings' && <AdminSection title="系统设置" description="集中管理业务开放状态、邮箱服务与支付渠道，修改后统一保存生效。">
              <div className="admin-settings-shell">
                <aside className="admin-settings-nav" aria-label="设置分类">
                  <button type="button" className={settingsSection === 'general' ? 'active' : ''} onClick={() => setSettingsSection('general')}><Settings /><span><strong>业务设置</strong><small>注册、交付与订单规则</small></span><ChevronRight /></button>
                  <button type="button" className={settingsSection === 'recommendations' ? 'active' : ''} onClick={() => setSettingsSection('recommendations')}><Building2 /><span><strong>资源推荐</strong><small>{settingsData.recommendations.items.length} / 20 项已配置</small></span><ChevronRight /></button>
                  <button type="button" className={settingsSection === 'email' ? 'active' : ''} onClick={() => setSettingsSection('email')}><Mail /><span><strong>邮箱服务</strong><small>验证码与系统邮件</small></span><ChevronRight /></button>
                  <button type="button" className={settingsSection === 'payments' ? 'active' : ''} onClick={() => setSettingsSection('payments')}><CreditCard /><span><strong>支付渠道</strong><small>{settingsData.paymentMethods.length} 个已配置方式</small></span><ChevronRight /></button>
                </aside>

                <div className="admin-settings-content">
                  {settingsSection === 'general' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><Settings /></span><div><h2>业务设置</h2><p>控制用户入口和交付接口，复杂参数通过弹窗集中编辑。</p></div></div><div className="admin-settings-head-actions">{settingsSaveAction}</div></header>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>业务开关</h3><p>保存后立即作用于用户端对应接口。</p></div>
                      <div className="admin-setting-list">
                        <SettingSwitch label="开放用户注册" description="关闭后，新用户注册接口将拒绝请求。" checked={settingsData.registrationEnabled} onChange={value => setSettingsData({ ...settingsData, registrationEnabled: value })} />
                        <SettingSwitch label="允许面板安装" description="关闭后，用户不能提交新的面板安装任务。" checked={settingsData.panelDeployEnabled} onChange={value => setSettingsData({ ...settingsData, panelDeployEnabled: value })} />
                        <SettingSwitch label="允许节点创建" description="关闭后，用户不能提交新的节点创建任务。" checked={settingsData.nodeDeployEnabled} onChange={value => setSettingsData({ ...settingsData, nodeDeployEnabled: value })} />
                        <SettingSwitch label="显示悬浮咨询按钮" description="至少配置一种启用的联系方式后，用户端才会显示咨询入口。" checked={settingsData.contact.enabled} onChange={enabled => setSettingsData({ ...settingsData, contact: { ...settingsData.contact, enabled } })} />
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>配置摘要</h3><p>点击设置后在弹窗中维护详细内容。</p></div>
                      <div className="admin-settings-summary-list">
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('order')}><span className="admin-setting-summary-icon"><Clock3 /></span><span><strong>订单规则</strong><small>待付款订单保留 {settingsData.orderExpiryMinutes} 分钟 · {settingsData.paymentInstructions.trim() ? '已配置付款说明' : '未配置付款说明'}</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('redeem')}><span className="admin-setting-summary-icon"><KeyRound /></span><span><strong>卡密购买</strong><small>{settingsData.redeemCodePurchaseUrl.trim() ? '已配置购买链接' : '未配置购买链接'}</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('contact')}><span className="admin-setting-summary-icon"><Headphones /></span><span><strong>咨询窗口</strong><small>{settingsData.contact.methods.length} 种联系方式 · 按钮名称“{settingsData.contact.buttonLabel || '立即咨询'}”</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                      </div>
                    </section>
                  </>}

                  {settingsSection === 'recommendations' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><Building2 /></span><div><h2>资源推荐</h2><p>管理服务器与住宅 IP 厂商入口，详细资料在编辑弹窗中维护。</p></div></div><div className="admin-settings-head-actions"><span className="admin-resource-count">{settingsData.recommendations.items.length} / 20</span><button type="button" className="admin-button secondary" disabled={settingsData.recommendations.items.length >= 20} onClick={openNewRecommendation}><PackagePlus /> 新增推荐</button>{settingsSaveAction}</div></header>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>分类展示</h3><p>关闭分类后，该分类的全部推荐会从用户端隐藏，数据仍然保留。</p></div>
                      <div className="admin-setting-list compact">
                        <SettingSwitch label="显示服务器厂商推荐" description="为需要搭建面板或节点的用户提供服务器厂商入口。" checked={settingsData.recommendations.serverEnabled} onChange={serverEnabled => setSettingsData({ ...settingsData, recommendations: { ...settingsData.recommendations, serverEnabled } })} />
                        <SettingSwitch label="显示住宅 IP 厂商推荐" description="用于住宅网络出口、地区覆盖和 SOCKS 链式转发。" checked={settingsData.recommendations.residentialIpEnabled} onChange={residentialIpEnabled => setSettingsData({ ...settingsData, recommendations: { ...settingsData.recommendations, residentialIpEnabled } })} />
                      </div>
                    </section>
                    <section className="admin-settings-section flush">
                      <div className="admin-resource-table-wrap">
                        <table className="admin-payment-table admin-resource-table">
                          <thead><tr><th>厂商</th><th>分类</th><th>状态</th><th>排序</th><th>操作</th></tr></thead>
                          <tbody>{settingsData.recommendations.items.map((item, index) => <tr key={`${item.id}-${index}`}>
                            <td><div className="admin-payment-name"><span>{item.logoUploaded ? <img src={`/api/admin/resource-recommendations/${encodeURIComponent(item.id)}/logo`} alt="" /> : item.logoUrl ? <img src={item.logoUrl} alt="" /> : <Building2 />}</span><div><strong>{item.name || '未命名厂商'}</strong><small>{item.id}</small></div></div></td>
                            <td>{item.category === 'server' ? '服务器' : '住宅 IP'}</td>
                            <td><div className="admin-payment-state"><StatusBadge status={item.enabled ? 'active' : 'disabled'} /><button type="button" role="switch" aria-checked={item.enabled} className={`admin-switch ${item.enabled ? 'on' : ''}`} onClick={() => updateRecommendation(index, { enabled: !item.enabled })}><span /></button></div></td>
                            <td>{item.sortOrder}</td>
                            <td><div className="admin-row-actions"><button type="button" className="admin-icon-button small" title="编辑推荐" onClick={() => setEditingRecommendation({ index, item: { ...item } })}><Pencil /></button><button type="button" className="admin-icon-button small danger" title="删除推荐" onClick={() => setDeletingRecommendation({ index, item })}><X /></button></div></td>
                          </tr>)}</tbody>
                        </table>
                        {!settingsData.recommendations.items.length && <div className="admin-table-empty compact"><Building2 /><strong>暂无资源推荐</strong><span>添加服务器或住宅 IP 厂商后，用户端才会显示“资源推荐”入口。</span></div>}
                      </div>
                    </section>
                  </>}

                  {settingsSection === 'email' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><Mail /></span><div><h2>邮箱服务</h2><p>查看当前邮件配置状态，需要修改时进入对应弹窗。</p></div></div><div className="admin-settings-head-actions">{settingsSaveAction}</div></header>
                    <section className="admin-settings-section">
                      <div className="admin-setting-list compact">
                        <SettingSwitch label="启用 SMTP 邮件服务" description="启用后才可发送验证码、找回密码邮件和测试邮件。" checked={settingsData.email.emailEnabled} onChange={value => setSettingsData({ ...settingsData, email: { ...settingsData.email, emailEnabled: value } })} />
                        <SettingSwitch label="注册必须验证邮箱" description="关闭时保留当前兼容注册流程。" checked={settingsData.email.emailVerificationRequired} onChange={value => setSettingsData({ ...settingsData, email: { ...settingsData.email, emailVerificationRequired: value } })} />
                      </div>
                    </section>
                    <section className="admin-settings-section">
                      <div className="admin-settings-section-title"><h3>配置状态</h3><p>配置项按职责拆分，避免在主页面铺开表单。</p></div>
                      <div className="admin-settings-summary-list">
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('smtp')}><span className="admin-setting-summary-icon"><Network /></span><span><strong>SMTP 连接</strong><small>{settingsData.email.smtpHost ? `${settingsData.email.smtpHost}:${settingsData.email.smtpPort}` : '尚未配置邮件服务器'} · {settingsData.email.smtpPasswordConfigured || settingsData.email.smtpPassword ? '凭据已配置' : '缺少凭据'}</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('sender')}><span className="admin-setting-summary-icon"><Mail /></span><span><strong>发件身份</strong><small>{settingsData.email.smtpFromEmail || '尚未配置发件邮箱'} · {settingsData.email.smtpFromName || settingsData.email.siteName}</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('verification')}><span className="admin-setting-summary-icon"><Clock3 /></span><span><strong>验证码规则</strong><small>有效 {settingsData.email.verificationCodeTtlMinutes} 分钟 · {settingsData.email.verificationResendSeconds} 秒后可重发</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('test-email')}><span className="admin-setting-summary-icon"><Send /></span><span><strong>邮件检测</strong><small>使用当前已保存的 SMTP 配置发送测试邮件</small></span><span className="admin-settings-row-action">发送测试 <ChevronRight /></span></button>
                      </div>
                    </section>
                  </>}

                  {settingsSection === 'payments' && <>
                    <header className="admin-settings-content-head"><div><span className="admin-settings-icon"><CreditCard /></span><div><h2>支付渠道</h2><p>{settingsData.paymentMethods.some(method => method.enabled) ? '已启用的渠道会显示在用户下单流程中。' : '当前为仅卡密模式，用户端不会显示在线支付渠道。'}</p></div></div><div className="admin-settings-head-actions"><button type="button" className="admin-button secondary" disabled={!settingsData.paymentMethods.some(method => method.enabled)} onClick={disableAllPaymentMethods}><PowerOff /> 仅使用卡密</button><button type="button" className="admin-button secondary" onClick={openNewPaymentMethod}><PackagePlus /> 新增支付方式</button>{settingsSaveAction}</div></header>
                    <section className="admin-settings-section flush">
                      <div className="admin-payment-table-wrap">
                        <table className="admin-payment-table">
                          <thead><tr><th>支付方式</th><th>收款类型</th><th>支付通道</th><th>回调地址</th><th>配置检测</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
                          <tbody>{settingsData.paymentMethods.map((method, index) => <tr key={`${method.id}-${index}`}>
                            <td><div className="admin-payment-name"><span><CreditCard /></span><div><strong>{method.name || '未命名支付方式'}</strong><small>{method.id || '未设置标识'}</small></div></div></td>
                            <td>{paymentProviderText(method)}</td>
                            <td>{paymentChannelText(method)}</td>
                            <td>{method.callbackUrl ? <button type="button" className="admin-callback-copy" title={method.callbackUrl} onClick={() => void copyToClipboard(method.callbackUrl || '').then(success => showToast(success ? '回调地址已复制' : '复制失败', success ? method.callbackUrl : '请手动复制回调地址', success ? 'success' : 'error'))}><ClipboardCopy /><span>复制回调</span></button> : <span className="admin-muted">无需回调</span>}</td>
                            <td><div className="admin-payment-check"><button type="button" className="admin-button secondary compact" disabled={paymentCheckBusy === method.id || !savedPaymentMethodIds.includes(method.id)} title={savedPaymentMethodIds.includes(method.id) ? '检测已保存的支付配置' : '请先保存更改'} onClick={() => void checkPaymentMethod(method)}><RefreshCw className={paymentCheckBusy === method.id ? 'spinning' : ''} /> 检测</button>{paymentChecks[method.id] && <div className={`admin-payment-check-result ${paymentChecks[method.id].status}`}><strong>{paymentCheckLabel(paymentChecks[method.id].status)}</strong><span>{paymentChecks[method.id].message}</span></div>}{!savedPaymentMethodIds.includes(method.id) && <small>保存后可检测</small>}</div></td>
                            <td>{method.sortOrder}</td>
                            <td><div className="admin-payment-state"><StatusBadge status={method.enabled ? 'active' : 'disabled'} /><button type="button" role="switch" aria-label={`${method.enabled ? '停用' : '启用'} ${method.name}`} aria-checked={method.enabled} className={`admin-switch ${method.enabled ? 'on' : ''}`} onClick={() => updatePaymentMethod(index, { enabled: !method.enabled })}><span /></button></div></td>
                            <td><div className="admin-row-actions"><button type="button" className="admin-icon-button small" title="编辑支付方式" onClick={() => setEditingPaymentMethod({ index, method: { ...method } })}><Pencil /></button><button type="button" className="admin-icon-button small danger" title="删除支付方式" onClick={() => setDeletingPaymentMethod({ index, method })}><X /></button></div></td>
                          </tr>)}</tbody>
                        </table>
                        {!settingsData.paymentMethods.length && <div className="admin-table-empty compact"><CreditCard /><strong>暂无支付方式</strong><span>新增并启用支付方式后，用户才能在下单时选择付款渠道。</span></div>}
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

                <section className="admin-security-card admin-database-maintenance">
                  <header><span><Database /></span><div><h2>数据库备份与恢复</h2><p>下载完整业务数据库，或校验并恢复同一系统生成的 SQLite 备份。</p></div></header>
                  <div className="admin-database-actions">
                    <button type="button" className="admin-button secondary" disabled={busy} onClick={() => void downloadDatabaseBackup()}><Download /> 下载当前备份</button>
                    <label className="admin-database-file"><Upload /><span><strong>{databaseFile?.name || '选择 .db 备份文件'}</strong><small>{databaseFile ? `${Math.max(1, Math.round(databaseFile.size / 1024))} KB` : '最大 64MB，选择后需要先校验'}</small></span><input type="file" accept=".db,application/vnd.sqlite3,application/x-sqlite3" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; selectDatabaseFile(file); }} /></label>
                    <button type="button" className="admin-button secondary" disabled={busy || !databaseFile} onClick={() => void validateDatabaseFile()}><ShieldCheck /> 校验备份</button>
                  </div>
                  {databaseValidation && <div className="admin-database-validation"><CheckCircle2 /><div><strong>备份校验通过</strong><span>文件大小 {Math.max(1, Math.round(databaseValidation.sizeBytes / 1024))} KB · 管理员 {databaseValidation.counts.users || 0} · 订单 {databaseValidation.counts.orders || 0} · 权益 {databaseValidation.counts.entitlements || 0}</span></div><button type="button" className="admin-button danger" disabled={busy} onClick={() => { setRestoreConfirmation(''); setRestoreDialogOpen(true); }}><ArchiveRestore /> 恢复此备份</button></div>}
                  <p className="admin-database-note"><AlertTriangle /> 恢复前系统会自动备份当前数据库；恢复完成后所有账号都需要重新登录。支付密钥必须使用相同的 `.key` 文件或 `COMMERCIAL_SECRET_KEY`。</p>
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
          <label className="admin-field"><span>生成数量</span><NumberInput min="1" max="100" value={redeemCodeDraft.quantity} onValueChange={quantity => setRedeemCodeDraft({ ...redeemCodeDraft, quantity })} /></label>
          <label className="admin-field"><span>有效期</span><input type="datetime-local" value={redeemCodeDraft.expiresAt} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, expiresAt: event.target.value })} /><small>留空表示长期有效。</small></label>
          <label className="admin-field span-2"><span>批次备注</span><input value={redeemCodeDraft.note} maxLength={300} onChange={event => setRedeemCodeDraft({ ...redeemCodeDraft, note: event.target.value })} placeholder="例如：淘宝 8 月批次" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={createdRedeemCodes.length > 0} title="卡密生成完成" description="明文只在本次显示，关闭后后台只能查看脱敏值。" cancelLabel="关闭" onClose={() => setCreatedRedeemCodes([])}>
        <div className="admin-redeem-result-actions"><button type="button" className="admin-button secondary" onClick={() => void copyCreatedRedeemCodes()}><ClipboardCopy /> 复制全部</button><button type="button" className="admin-button secondary" onClick={downloadCreatedRedeemCodes}><Download /> 下载 TXT</button></div>
        <div className="admin-redeem-result-list">{createdRedeemCodes.map(item => <code key={item.id}>{item.code}</code>)}</div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'order'} title="编辑订单规则" description="设置待付款订单的保留时间和用户付款引导，确认后仍需保存更改才会生效。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid one">
          <label className="admin-field"><span>订单有效期（分钟）</span><NumberInput min="5" max="1440" value={settingsData.orderExpiryMinutes} onValueChange={orderExpiryMinutes => setSettingsData({ ...settingsData, orderExpiryMinutes })} /><small>超过有效期的未支付订单将不能继续付款。</small></label>
          <label className="admin-field"><span>支付与联系说明</span><textarea value={settingsData.paymentInstructions} maxLength={2000} onChange={event => setSettingsData({ ...settingsData, paymentInstructions: event.target.value })} placeholder="填写收款方式、联系渠道和订单备注要求" /><small>{settingsData.paymentInstructions.length} / 2000</small></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'redeem'} title="设置卡密购买入口" description="配置后，用户可以从订单和账户相关页面前往指定链接购买卡密。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <label className="admin-field"><span>卡密购买链接</span><input type="url" value={settingsData.redeemCodePurchaseUrl} maxLength={1000} onChange={event => setSettingsData({ ...settingsData, redeemCodePurchaseUrl: event.target.value })} placeholder="https://example.com/buy" /><small>留空则不显示购买按钮，仅支持 HTTP 或 HTTPS。</small></label>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'contact'} size="wide" title="设置咨询窗口" description="统一管理悬浮按钮文案、咨询说明和各联系方式对应的账号、链接与二维码。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid contact-settings-form">
          <label className="admin-field"><span>悬浮按钮名称</span><input value={settingsData.contact.buttonLabel} maxLength={40} onChange={event => setSettingsData({ ...settingsData, contact: { ...settingsData.contact, buttonLabel: event.target.value } })} placeholder="立即咨询" /></label>
          <label className="admin-field"><span>咨询弹窗标题</span><input value={settingsData.contact.title} maxLength={100} onChange={event => setSettingsData({ ...settingsData, contact: { ...settingsData.contact, title: event.target.value } })} placeholder="联系站长" /></label>
          <label className="admin-field span-2"><span>咨询说明</span><textarea value={settingsData.contact.description} maxLength={1000} onChange={event => setSettingsData({ ...settingsData, contact: { ...settingsData.contact, description: event.target.value } })} placeholder="例如：遇到搭建、支付或使用问题，可以联系站长处理。" /><small>{settingsData.contact.description.length} / 1000</small></label>
        </div>
        <div className="admin-dialog-subsection-head"><div><strong>联系方式</strong><small>每条联系方式独立绑定账号、链接和二维码，最多 10 种。</small></div><button type="button" className="admin-button secondary" disabled={settingsData.contact.methods.length >= 10} onClick={openNewContactMethod}><PackagePlus /> 新增联系方式</button></div>
        <div className="admin-resource-table-wrap">
          <table className="admin-payment-table admin-contact-method-table compact-columns">
            <thead><tr><th>名称</th><th>类型</th><th>账号或说明</th><th>状态</th><th>二维码</th><th>操作</th></tr></thead>
            <tbody>{settingsData.contact.methods.map((method, index) => <tr key={`${method.id}-${index}`}>
              <td><div className="admin-payment-name"><span><Headphones /></span><div><strong>{method.name || '未命名联系方式'}</strong><small>{method.id}</small></div></div></td>
              <td>{contactTypeLabels[method.type]}</td>
              <td><span className="admin-result-text">{method.value || '-'}</span></td>
              <td><div className="admin-payment-state"><StatusBadge status={method.enabled ? 'active' : 'disabled'} /><button type="button" role="switch" aria-checked={method.enabled} className={`admin-switch ${method.enabled ? 'on' : ''}`} onClick={() => updateContactMethod(index, { enabled: !method.enabled })}><span /></button></div></td>
              <td><div className="admin-contact-qr-actions"><span className={`admin-contact-qr-preview ${method.qrCodeUploaded || method.qrCodeUrl ? 'has-image' : ''}`}>{method.qrCodeUploaded ? <img src={`/api/admin/contact-methods/${encodeURIComponent(method.id)}/qr`} alt="" /> : method.qrCodeUrl ? <img src={method.qrCodeUrl} alt="" /> : <QrCode />}</span><label className={`admin-button secondary compact ${busy ? 'disabled' : ''}`} title="上传二维码"><Upload /> 上传<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadContactQr(index, method, file); }} /></label>{method.qrCodeUploaded && <button type="button" className="admin-icon-button small danger" title="删除已上传二维码" disabled={busy} onClick={() => void deleteContactQr(index, method)}><Trash2 /></button>}</div></td>
              <td><div className="admin-row-actions"><button type="button" className="admin-icon-button small" title="编辑联系方式" onClick={() => openContactMethodEditor(index, method)}><Pencil /></button><button type="button" className="admin-icon-button small danger" title="删除联系方式" onClick={() => openContactMethodDelete(index, method)}><X /></button></div></td>
            </tr>)}</tbody>
          </table>
          {!settingsData.contact.methods.length && <div className="admin-table-empty compact"><Headphones /><strong>暂无联系方式</strong><span>新增至少一种联系方式后，悬浮咨询按钮才会在前台显示。</span></div>}
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'smtp'} title="配置 SMTP 连接" description="填写邮件服务商提供的服务器、账号和授权码，密码保存后不会回传明文。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>SMTP 主机</span><input value={settingsData.email.smtpHost} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpHost: event.target.value } })} placeholder="smtp.example.com" /></label>
          <label className="admin-field"><span>SMTP 端口</span><NumberInput min="1" max="65535" value={settingsData.email.smtpPort} onValueChange={smtpPort => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpPort } })} /></label>
          <label className="admin-field"><span>连接加密</span><select value={settingsData.email.smtpEncryption} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpEncryption: event.target.value as EmailSettings['smtpEncryption'] } })}><option value="ssl">SSL / TLS</option><option value="starttls">STARTTLS</option><option value="none">不加密</option></select></label>
          <label className="admin-field"><span>SMTP 用户名</span><input value={settingsData.email.smtpUsername} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpUsername: event.target.value } })} /></label>
          <label className="admin-field span-2"><span>SMTP 密码或授权码</span><input type="password" value={settingsData.email.smtpPassword || ''} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpPassword: event.target.value } })} placeholder={settingsData.email.smtpPasswordConfigured ? '已配置，留空保持不变' : '填写密码或授权码'} /><small>保存后不会再向前端回传明文。</small></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'sender'} title="配置发件身份" description="这些信息会显示在验证码、密码找回和系统通知邮件中。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>发件人名称</span><input value={settingsData.email.smtpFromName} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpFromName: event.target.value } })} /></label>
          <label className="admin-field"><span>发件邮箱</span><input type="email" value={settingsData.email.smtpFromEmail} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpFromEmail: event.target.value } })} /></label>
          <label className="admin-field"><span>回复邮箱</span><input type="email" value={settingsData.email.smtpReplyTo} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, smtpReplyTo: event.target.value } })} /></label>
          <label className="admin-field"><span>站点名称</span><input value={settingsData.email.siteName} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, siteName: event.target.value } })} /></label>
          <label className="admin-field span-2"><span>公网访问地址</span><input type="url" value={settingsData.email.publicBaseUrl} onChange={event => setSettingsData({ ...settingsData, email: { ...settingsData.email, publicBaseUrl: event.target.value } })} placeholder="https://your-domain.com，用于邮件链接和支付异步回调" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'verification'} title="配置验证码规则" description="设置邮箱验证码的有效时间与重复发送间隔。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>验证码有效期（分钟）</span><NumberInput min="3" max="60" value={settingsData.email.verificationCodeTtlMinutes} onValueChange={verificationCodeTtlMinutes => setSettingsData({ ...settingsData, email: { ...settingsData.email, verificationCodeTtlMinutes } })} /></label>
          <label className="admin-field"><span>重发间隔（秒）</span><NumberInput min="30" max="600" value={settingsData.email.verificationResendSeconds} onValueChange={verificationResendSeconds => setSettingsData({ ...settingsData, email: { ...settingsData.email, verificationResendSeconds } })} /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'test-email'} title="发送测试邮件" description="测试接口使用已经保存到后端的 SMTP 设置，请先保存更改。" confirmLabel="发送测试邮件" busy={busy} confirmDisabled={!testEmailRecipient.trim()} onClose={() => setSettingsDialog(null)} onConfirm={() => void testEmail()}>
        <label className="admin-field"><span>测试收件邮箱</span><input type="email" value={testEmailRecipient} onChange={event => setTestEmailRecipient(event.target.value)} placeholder="name@example.com" /></label>
      </AdminDialog>
      <AdminDialog open={paymentRuntimeOpen} size="wide" title="支付运行记录" description="核对最近的支付请求、异步通知验签与自动发放结果，敏感字段已脱敏。" cancelLabel="关闭" onClose={() => setPaymentRuntimeOpen(false)}>
        <div className="admin-payment-runtime-grid">
          <div className="admin-payment-runtime-panel"><header><div><strong>最近支付请求</strong><small>{paymentAttempts.length} 条记录</small></div><RefreshCw /></header><div className="admin-payment-runtime-list">{paymentAttempts.slice(0, 20).map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{item.orderNo}</strong><small>{paymentChannelName(item.provider, settingsData.paymentMethods)} · {formatDate(item.createdAt)}</small>{item.errorMessage && <p>{item.errorMessage}</p>}</div><StatusBadge status={item.status} /></article>)}{!paymentAttempts.length && <EmptyInline text="暂无支付请求记录" />}</div></div>
          <div className="admin-payment-runtime-panel"><header><div><strong>最近异步通知</strong><small>{paymentNotifications.length} 条记录</small></div><ShieldCheck /></header><div className="admin-payment-runtime-list">{paymentNotifications.slice(0, 20).map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{item.orderNo || '未识别订单号'}</strong><small>{paymentProviderName(item.provider)} · {formatDate(item.createdAt)}</small>{item.errorMessage && <p>{item.errorMessage}</p>}</div><StatusBadge status={item.status} /></article>)}{!paymentNotifications.length && <EmptyInline text="暂无支付回调记录" />}</div></div>
        </div>
      </AdminDialog>
      <AdminDialog open={Boolean(editingPaymentMethod)} title={editingPaymentMethod?.index === -1 ? '新增支付方式' : '编辑支付方式'} description="支付方式会先保存在当前设置草稿中，点击页面右上角“保存更改”后正式生效。" confirmLabel="保存支付方式" busy={busy} confirmDisabled={!editingPaymentMethod?.method.name.trim() || !editingPaymentMethod?.method.id.trim()} onClose={() => setEditingPaymentMethod(null)} onConfirm={savePaymentMethodDraft}>
        {editingPaymentMethod && <PaymentMethodEditor method={editingPaymentMethod.method} idLocked={editingPaymentMethod.index >= 0} onChange={method => setEditingPaymentMethod({ ...editingPaymentMethod, method })} />}
      </AdminDialog>
      <AdminDialog open={Boolean(deletingPaymentMethod)} title="删除支付方式" description={`将从设置草稿中删除“${deletingPaymentMethod?.method.name || '未命名支付方式'}”，保存更改后正式生效。`} confirmLabel="确认删除" tone="danger" busy={busy} onClose={() => setDeletingPaymentMethod(null)} onConfirm={() => { if (deletingPaymentMethod) removePaymentMethod(deletingPaymentMethod.index); setDeletingPaymentMethod(null); }} />
      <AdminDialog open={Boolean(editingRecommendation)} size="wide" title={editingRecommendation?.index === -1 ? '新增资源推荐' : '编辑资源推荐'} description="推荐项先保存在当前设置草稿中，点击页面右上角“保存更改”后正式生效。" confirmLabel="保存推荐项" busy={busy} confirmDisabled={!editingRecommendation?.item.name.trim() || !editingRecommendation?.item.id.trim() || !editingRecommendation?.item.purchaseUrl.trim()} onClose={() => setEditingRecommendation(null)} onConfirm={saveRecommendationDraft}>
        {editingRecommendation && <>
          <ResourceRecommendationEditor item={editingRecommendation.item} idLocked={editingRecommendation.index >= 0} onChange={item => setEditingRecommendation({ ...editingRecommendation, item })} />
          {editingRecommendation.index >= 0 && <div className="admin-dialog-subsection-head"><div><strong>Logo 管理</strong><small>可以从厂商链接自动获取，也可以上传不超过 1MB 的本地图片。</small></div><div className="admin-resource-logo-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => void fetchRecommendationLogo(editingRecommendation.index, editingRecommendation.item)}><RefreshCw /> 自动获取</button><label className={`admin-button secondary ${busy ? 'disabled' : ''}`}><Upload /> 上传 Logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadRecommendationLogo(editingRecommendation.index, editingRecommendation.item, file); }} /></label>{editingRecommendation.item.logoUploaded && <button type="button" className="admin-button danger" disabled={busy} onClick={() => void deleteRecommendationLogo(editingRecommendation.index, editingRecommendation.item)}><Trash2 /> 删除 Logo</button>}</div></div>}
        </>}
      </AdminDialog>
      <AdminDialog open={Boolean(deletingRecommendation)} title="删除资源推荐" description={`将从设置草稿中删除“${deletingRecommendation?.item.name || '未命名厂商'}”。已上传的 Logo 可继续保留，使用相同标识重新添加后仍可显示。`} confirmLabel="确认删除" tone="danger" busy={busy} onClose={() => setDeletingRecommendation(null)} onConfirm={() => { if (deletingRecommendation) removeRecommendation(deletingRecommendation.index); setDeletingRecommendation(null); }} />
      <AdminDialog open={Boolean(editingContactMethod)} size="wide" title={editingContactMethod?.index === -1 ? '新增联系方式' : '编辑联系方式'} description="账号、链接和二维码会绑定在同一条联系方式中；完成编辑后仍需保存更改才会生效。" confirmLabel="保存联系方式" busy={busy} confirmDisabled={!editingContactMethod?.method.name.trim() || !editingContactMethod?.method.id.trim()} onClose={returnToContactSettings} onConfirm={saveContactMethodDraft}>
        {editingContactMethod && <>
          <ContactMethodEditor method={editingContactMethod.method} idLocked={editingContactMethod.index >= 0} onChange={method => setEditingContactMethod({ ...editingContactMethod, method })} />
          <div className="admin-contact-qr-manager">
            <div className="admin-contact-qr-manager-info">
              <span className={`admin-contact-qr-manager-preview ${editingContactMethod.method.qrCodeUploaded || editingContactMethod.method.qrCodeUrl ? 'has-image' : ''}`}>
                {editingContactMethod.method.qrCodeUploaded
                  ? <img src={`/api/admin/contact-methods/${encodeURIComponent(editingContactMethod.method.id)}/qr`} alt={`${editingContactMethod.method.name || '联系方式'}二维码`} />
                  : editingContactMethod.method.qrCodeUrl
                    ? <img src={editingContactMethod.method.qrCodeUrl} alt={`${editingContactMethod.method.name || '联系方式'}二维码`} />
                    : <QrCode />}
              </span>
              <div><strong>二维码图片</strong><small>{editingContactMethod.index >= 0 && savedContactMethodIds.includes(editingContactMethod.method.id) ? '支持 PNG、JPEG 或 WebP，图片不能超过 1MB；本地上传优先于图片地址。' : '新增联系方式需先保存联系方式并点击页面右上角“保存更改”，之后重新编辑即可上传。'}</small></div>
            </div>
            <div className="admin-resource-logo-actions">
              <label className={`admin-button secondary ${busy || editingContactMethod.index < 0 || !savedContactMethodIds.includes(editingContactMethod.method.id) ? 'disabled' : ''}`}>
                <Upload /> 上传二维码
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || editingContactMethod.index < 0 || !savedContactMethodIds.includes(editingContactMethod.method.id)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadContactQr(editingContactMethod.index, editingContactMethod.method, file); }} />
              </label>
              {editingContactMethod.method.qrCodeUploaded && <button type="button" className="admin-button danger" disabled={busy} onClick={() => void deleteContactQr(editingContactMethod.index, editingContactMethod.method)}><Trash2 /> 删除二维码</button>}
            </div>
          </div>
        </>}
      </AdminDialog>
      <AdminDialog open={Boolean(deletingContactMethod)} title="删除联系方式" description={`将从设置草稿中删除“${deletingContactMethod?.method.name || '未命名联系方式'}”。已上传的二维码会保留，使用相同标识重新添加后仍可显示。`} confirmLabel="确认删除" tone="danger" busy={busy} onClose={returnToContactSettings} onConfirm={() => { if (deletingContactMethod) removeContactMethod(deletingContactMethod.index); returnToContactSettings(); }} />
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
      <AdminDialog open={Boolean(deletingUser)} title={`永久删除客户 ${deletingUser?.username || ''}`} description="删除后无法恢复，客户账号及其订单、支付记录、权益、搭建任务、额度流水和卡密兑换关联都会一并清除。" confirmLabel="确认永久删除" tone="danger" busy={busy} onClose={() => setDeletingUser(null)} onConfirm={() => void deleteUser()}>
        {deletingUser && <div className="admin-dialog-summary"><div><span>客户账号</span><strong>{deletingUser.username}</strong></div><div><span>账号状态</span><strong>{deletingUser.status === 'active' ? '正常' : '已禁用'}</strong></div><div><span>影响范围</span><strong>账号与全部关联业务数据</strong></div></div>}
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
      <AdminDialog open={Boolean(viewOrder)} size="wide" title="订单详情" description="集中核对订单、支付链路、卡密来源和权益发放结果。" cancelLabel="关闭" onClose={() => { setViewOrder(null); setOrderDetail(null); }}>
        {viewOrder && orderDetailLoading && <div className="admin-order-detail-loading"><RefreshCw className="spinning" /><span>正在汇总订单处理记录...</span></div>}
        {orderDetail && <div className="admin-detail-layout">
          <div className={`admin-order-diagnosis ${orderDetail.diagnosis.severity}`}>
            <span>{orderDetail.diagnosis.severity === 'success' ? <CheckCircle2 /> : <AlertTriangle />}</span>
            <div><strong>{orderDetail.diagnosis.processingLabel}</strong><p>{orderDetail.diagnosis.recommendedAction}</p></div>
            {(orderDetail.diagnosis.failedAttemptCount > 0 || orderDetail.diagnosis.rejectedNotificationCount > 0) && <small>{orderDetail.diagnosis.failedAttemptCount} 次支付请求失败 · {orderDetail.diagnosis.rejectedNotificationCount} 次回调被拒绝</small>}
          </div>
          <div className="admin-detail-summary"><DetailItem label="订单号" value={orderDetail.order.orderNo} mono /><DetailItem label="用户" value={<>{orderDetail.order.username || '-'}{orderDetail.order.email && <small className="admin-detail-subvalue">{orderDetail.order.email}</small>}</>} /><DetailItem label="订单金额" value={formatMoney(orderDetail.order.amountCents)} accent /><DetailItem label="订单状态" value={<StatusBadge status={orderDetail.order.status} />} /></div>
          <div className="admin-order-detail-actions">
            {orderDetail.order.status === 'pending' && <><button className="admin-button success" onClick={() => { setViewOrder(null); setOrderDetail(null); setPaymentOrder(orderDetail.order); setTradeNo(''); }}><CheckCircle2 /> 确认人工收款</button><button className="admin-button danger" onClick={() => { setViewOrder(null); setOrderDetail(null); setCancelOrder(orderDetail.order); }}>取消订单</button></>}
            {orderDetail.order.status === 'paid' && orderDetail.order.paymentProvider !== 'redeem_code' && <button className="admin-button warning" onClick={() => { setViewOrder(null); setOrderDetail(null); setRefundOrder(orderDetail.order); setRefundTradeNo(''); setRefundReason(''); }}>登记外部退款</button>}
            {orderDetail.diagnosis.canRepairEntitlement && <button className="admin-button danger" onClick={() => { setViewOrder(null); setOrderDetail(null); setRepairOrder(orderDetail.order); }}><Wrench /> 补发缺失权益</button>}
          </div>
          <DetailBlock title="支付与时间">
            <div className="admin-detail-grid"><DetailItem label="支付渠道" value={paymentProviderName(orderDetail.order.paymentProvider || 'manual')} /><DetailItem label="支付子渠道" value={orderDetail.order.paymentChannel || '-'} /><DetailItem label="交易号" value={orderDetail.order.paymentTradeNo || '未支付'} mono /><DetailItem label="创建时间" value={formatDate(orderDetail.order.createdAt)} /><DetailItem label="到期时间" value={orderDetail.order.expiresAt ? formatDate(orderDetail.order.expiresAt) : '-'} /><DetailItem label="付款时间" value={orderDetail.order.paidAt ? formatDate(orderDetail.order.paidAt) : '未付款'} />{orderDetail.order.cancelledAt && <DetailItem label="取消时间" value={formatDate(orderDetail.order.cancelledAt)} />}{orderDetail.order.refundedAt && <DetailItem label="退款时间" value={formatDate(orderDetail.order.refundedAt)} />}{orderDetail.order.refundTradeNo && <DetailItem label="退款凭证" value={orderDetail.order.refundTradeNo} mono />}{(orderDetail.order.cancelReason || orderDetail.order.refundReason) && <DetailItem label="处理原因" value={orderDetail.order.refundReason || orderDetail.order.cancelReason || '-'} />}</div>
          </DetailBlock>
          {orderDetail.redeemCode && <DetailBlock title="卡密兑换来源"><div className="admin-detail-grid"><DetailItem label="卡密" value={orderDetail.redeemCode.codeMasked} mono /><DetailItem label="兑换时间" value={formatDate(orderDetail.redeemCode.redeemedAt)} /><DetailItem label="卡密备注" value={orderDetail.redeemCode.note || '-'} /></div></DetailBlock>}
          <DetailBlock title={`关联权益 · ${orderDetail.entitlements.length}`}>
            <div className="admin-order-record-list">{orderDetail.entitlements.map(item => <article key={item.id}><div><strong>{item.planName}</strong><small>{item.lifetime ? '永久有效' : `有效期至 ${formatDate(item.expiresAt)}`} · 创建于 {formatDate(item.createdAt)}</small><p>面板 {quotaText(item.panelMode, item.panelRemaining)} · 节点 {quotaText(item.nodeMode, item.nodeRemaining)} · 并发 {item.concurrencyLimit}</p></div><StatusBadge status={entitlementStatus(item)} /></article>)}{!orderDetail.entitlements.length && <EmptyInline text="该订单尚未生成关联权益" />}</div>
          </DetailBlock>
          <DetailBlock title={`支付请求 · ${orderDetail.attempts.length}`}>
            <div className="admin-order-record-list">{orderDetail.attempts.map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{paymentProviderName(item.provider)} · {item.providerOrderId || item.id.slice(0, 12)}</strong><small>创建 {formatDate(item.createdAt)}{item.updatedAt ? ` · 更新 ${formatDate(item.updatedAt)}` : ''}</small>{item.providerTradeNo && <p>交易号：{item.providerTradeNo}</p>}{item.errorMessage && <p className="danger">{item.errorMessage}</p>}{item.checkoutUrl && <a href={item.checkoutUrl} target="_blank" rel="noreferrer">查看支付地址 <ExternalLink /></a>}</div><StatusBadge status={item.status} /></article>)}{!orderDetail.attempts.length && <EmptyInline text="该订单没有在线支付请求记录" />}</div>
          </DetailBlock>
          <DetailBlock title={`异步回调 · ${orderDetail.notifications.length}`}>
            <div className="admin-order-record-list">{orderDetail.notifications.map(item => <article key={item.id}><span className={`admin-payment-dot ${item.status}`} /><div><strong>{paymentProviderName(item.provider)} · {item.channelId || '未知渠道'}</strong><small>{formatDate(item.createdAt)}</small>{item.errorMessage && <p className="danger">{item.errorMessage}</p>}<PayloadDetails payload={item.payload} label="查看已脱敏回调数据" /></div><StatusBadge status={item.status} /></article>)}{!orderDetail.notifications.length && <EmptyInline text="该订单没有异步回调记录" />}</div>
          </DetailBlock>
          <DetailBlock title={`支付事件 · ${orderDetail.paymentEvents.length}`}>
            <div className="admin-order-record-list">{orderDetail.paymentEvents.map(item => <article key={item.id}><div><strong>{paymentProviderName(item.provider)}</strong><small>{item.eventKey} · {formatDate(item.createdAt)}</small><PayloadDetails payload={item.payload} label="查看事件数据" /></div></article>)}{!orderDetail.paymentEvents.length && <EmptyInline text="该订单没有支付完成事件" />}</div>
          </DetailBlock>
          <DetailBlock title="套餐快照"><PlanSnapshotDetails order={orderDetail.order} /></DetailBlock>
        </div>}
      </AdminDialog>
      <AdminDialog open={Boolean(repairOrder)} title="补发订单权益" description="仅用于已确认付款但没有任何关联权益的异常订单。系统会严格按照下单时的套餐快照补发，并记录管理员审计日志。" confirmLabel="确认补发权益" tone="danger" busy={busy} onClose={() => setRepairOrder(null)} onConfirm={() => void confirmRepairEntitlement()}>
        {repairOrder && <div className="admin-dialog-summary"><div><span>订单号</span><strong>{repairOrder.orderNo}</strong></div><div><span>用户</span><strong>{repairOrder.username || '-'}</strong></div><div><span>补发套餐</span><strong>{planSnapshotName(repairOrder)}</strong></div></div>}
      </AdminDialog>
      <AdminDialog open={restoreDialogOpen} title="恢复数据库备份" description="此操作会用已校验的备份替换当前业务数据，并立即清除全部登录会话。" confirmLabel="确认恢复数据库" tone="danger" busy={busy} confirmDisabled={!databaseValidation || restoreConfirmation !== 'RESTORE'} onClose={() => { setRestoreDialogOpen(false); setRestoreConfirmation(''); }} onConfirm={() => void restoreDatabase()}>
        <div className="admin-restore-confirmation">
          <div><AlertTriangle /><p><strong>恢复后当前页面会退出登录。</strong><span>系统会先在数据目录的 backups 文件夹保存恢复前数据库，随后导入所选备份。</span></p></div>
          <label className="admin-field"><span>输入 RESTORE 确认</span><input value={restoreConfirmation} onChange={event => setRestoreConfirmation(event.target.value.toUpperCase())} autoComplete="off" placeholder="RESTORE" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={Boolean(viewDeployment)} title="交付任务详情" description="任务从额度预约到执行完成的真实状态和结果记录。" cancelLabel="关闭" onClose={() => setViewDeployment(null)}>
        {viewDeployment && <div className="admin-detail-layout">
          <div className="admin-detail-summary"><DetailItem label="请求编号" value={viewDeployment.requestId} mono /><DetailItem label="用户" value={viewDeployment.username || '-'} /><DetailItem label="任务类型" value={viewDeployment.capability === 'panel' ? '面板安装' : '节点创建'} /><DetailItem label="任务状态" value={<StatusBadge status={viewDeployment.status} />} /></div>
          <DetailBlock title="执行信息"><div className="admin-detail-grid"><DetailItem label="任务记录 ID" value={viewDeployment.id} mono /><DetailItem label="目标地址" value={viewDeployment.targetHostMasked || '-'} mono /><DetailItem label="额度模式" value={viewDeployment.quotaMode === 'unlimited' ? '不限次数' : '限次权益'} /><DetailItem label="创建时间" value={formatDate(viewDeployment.createdAt)} /><DetailItem label="开始时间" value={viewDeployment.startedAt ? formatDate(viewDeployment.startedAt) : '尚未开始'} /><DetailItem label="结束时间" value={viewDeployment.finishedAt ? formatDate(viewDeployment.finishedAt) : '尚未结束'} /></div></DetailBlock>
          <DetailBlock title="执行结果"><div className={`admin-detail-message ${viewDeployment.errorMessage ? 'danger' : 'success'}`}>{viewDeployment.errorMessage || viewDeployment.resultSummary || '暂无执行结果'}</div></DetailBlock>
        </div>}
      </AdminDialog>
      <AdminDialog open={Boolean(userDetail)} size="wide" title={`客户档案 · ${userDetail?.user.username || ''}`} description="围绕客户集中查看账号、权益、交易、搭建任务和额度变动。" cancelLabel="关闭" onClose={() => setUserDetail(null)}>
        {userDetail && <div className="admin-customer-profile">
          <div className="admin-customer-head">
            <div className="admin-customer-identity"><span>{userDetail.user.username.slice(0, 1).toUpperCase()}</span><div><h3>{userDetail.user.username}</h3><p>{userDetail.user.email || '未绑定邮箱'} · 注册于 {formatDate(userDetail.user.createdAt)}</p><div><StatusBadge status={userDetail.user.status} /><StatusBadge status={userDetail.user.role} />{userDetail.user.email && <span className={`admin-verify-label ${userDetail.user.emailVerified ? 'verified' : ''}`}>{userDetail.user.emailVerified ? '邮箱已验证' : '邮箱未验证'}</span>}</div></div></div>
            <div className="admin-customer-actions">
              {userDetail.user.role === 'user' && <button type="button" className="admin-button primary" onClick={() => { setGrant(value => ({ ...value, userId: userDetail.user.id })); setUserDetail(null); setGrantOpen(true); }}><BadgeCheck /> 发放权益</button>}
              <button type="button" className="admin-button secondary" disabled={userDetail.user.id === currentUser.id} onClick={() => { const user = userDetail.user; setUserDetail(null); setUserAction({ user, kind: 'password' }); setNextPassword(''); setConfirmPassword(''); }}><KeyRound /> 重置密码</button>
              <button type="button" className={`admin-button ${userDetail.user.status === 'active' ? 'danger' : 'success'}`} disabled={userDetail.user.id === currentUser.id} onClick={() => { const user = userDetail.user; setUserDetail(null); setUserAction({ user, kind: 'status', nextValue: user.status === 'active' ? 'disabled' : 'active' }); }}>{userDetail.user.status === 'active' ? <PowerOff /> : <CheckCircle2 />}{userDetail.user.status === 'active' ? '禁用客户' : '启用客户'}</button>
              <button type="button" className="admin-button danger" disabled={userDetail.user.id === currentUser.id} onClick={() => { const user = userDetail.user; setUserDetail(null); setDeletingUser(user); }}><Trash2 /> 永久删除</button>
            </div>
          </div>
          <nav className="admin-profile-tabs" aria-label="客户档案分类">
            {([['overview', '概览'], ['entitlements', `权益 ${userDetail.entitlements.length}`], ['orders', `订单 ${userDetail.orders.length}`], ['deployments', `搭建任务 ${userDetail.deployments.length}`], ['ledger', `额度流水 ${userProfileLedger.length}`]] as Array<[UserProfileTab, string]>).map(([id, label]) => <button type="button" key={id} className={userProfileTab === id ? 'active' : ''} onClick={() => setUserProfileTab(id)}>{label}</button>)}
          </nav>

          {userProfileTab === 'overview' && <div className="admin-profile-content">
            <div className="admin-detail-counts four"><div><strong>{userDetail.entitlements.filter(item => entitlementStatus(item) === 'active').length}</strong><span>有效权益</span></div><div><strong>{userDetail.orders.length}</strong><span>全部订单</span></div><div><strong>{userDetail.deployments.length}</strong><span>搭建任务</span></div><div><strong>{userProfileLedger.length}</strong><span>额度流水</span></div></div>
            <div className="admin-detail-summary"><DetailItem label="登录邮箱" value={userDetail.user.email || '未绑定邮箱'} /><DetailItem label="邮箱状态" value={userDetail.user.email ? (userDetail.user.emailVerified ? '已验证' : '未验证') : '-'} /><DetailItem label="注册时间" value={formatDate(userDetail.user.createdAt)} /><DetailItem label="最后登录" value={userDetail.user.lastLoginAt ? formatDate(userDetail.user.lastLoginAt) : '从未登录'} /></div>
            <DetailBlock title="当前可用权益"><div className="admin-detail-list interactive">{userDetail.entitlements.filter(item => entitlementStatus(item) === 'active').slice(0, 4).map(item => <button type="button" key={item.id} onClick={() => setUserProfileTab('entitlements')}><div><strong>{item.planName}</strong><small>{item.lifetime ? '永久有效' : `有效期至 ${formatDate(item.expiresAt)}`}</small></div><div><b>面板 {quotaText(item.panelMode, item.panelRemaining)}</b><b>节点 {quotaText(item.nodeMode, item.nodeRemaining)}</b><ChevronRight /></div></button>)}{!userDetail.entitlements.some(item => entitlementStatus(item) === 'active') && <EmptyInline text="该客户当前没有可用权益" />}</div></DetailBlock>
            <DetailBlock title="最近业务记录"><div className="admin-profile-timeline">{[...userDetail.orders.map(item => ({ id: `order-${item.id}`, title: `订单 ${item.orderNo}`, subtitle: `${planSnapshotName(item)} · ${formatMoney(item.amountCents)}`, createdAt: item.createdAt, status: item.status, action: () => { setUserDetail(null); void openOrderDetail(item); } })), ...userDetail.deployments.map(item => ({ id: `deployment-${item.id}`, title: `${item.capability === 'panel' ? '面板安装' : '节点创建'} ${item.requestId}`, subtitle: item.targetHostMasked || '未记录目标', createdAt: item.createdAt, status: item.status, action: () => { setUserDetail(null); setViewDeployment(item); } }))].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6).map(item => <button type="button" key={item.id} onClick={item.action}><span><Activity /></span><div><strong>{item.title}</strong><small>{item.subtitle} · {formatDate(item.createdAt)}</small></div><StatusBadge status={item.status} /><ChevronRight /></button>)}{!userDetail.orders.length && !userDetail.deployments.length && <EmptyInline text="该客户暂无业务记录" />}</div></DetailBlock>
          </div>}

          {userProfileTab === 'entitlements' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>客户权益</h3><p>查看有效期、剩余额度和使用限制。</p></div><button type="button" className="admin-button primary" onClick={() => { setGrant(value => ({ ...value, userId: userDetail.user.id })); setUserDetail(null); setGrantOpen(true); }}><BadgeCheck /> 发放权益</button></div><div className="admin-profile-records">{userDetail.entitlements.map(item => <article key={item.id}><div><strong>{item.planName}</strong><small>{item.lifetime ? '永久有效' : `有效期至 ${formatDate(item.expiresAt)}`} · 创建于 {formatDate(item.createdAt)}</small><p>面板 {quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}，已用 {item.panelUsed}，冻结 {item.panelReserved} · 节点 {quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}，已用 {item.nodeUsed}，冻结 {item.nodeReserved}</p></div><div><StatusBadge status={entitlementStatus(item)} /><button type="button" className="admin-link" onClick={() => { setUserDetail(null); setEditingEntitlement({ ...item }); }}>调整额度</button></div></article>)}{!userDetail.entitlements.length && <EmptyInline text="该客户暂无权益" />}</div></div>}

          {userProfileTab === 'orders' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>客户订单</h3><p>订单、金额和处理状态集中展示。</p></div></div><div className="admin-profile-records">{userDetail.orders.map(order => <button type="button" key={order.id} onClick={() => { setUserDetail(null); void openOrderDetail(order); }}><div><strong>{order.orderNo}</strong><small>{planSnapshotName(order)} · {formatDate(order.createdAt)}</small><p>{order.paymentTradeNo ? `交易号 ${order.paymentTradeNo}` : '尚未记录支付交易号'}</p></div><div><b>{formatMoney(order.amountCents)}</b><StatusBadge status={order.status} /><ChevronRight /></div></button>)}{!userDetail.orders.length && <EmptyInline text="该客户暂无订单" />}</div></div>}

          {userProfileTab === 'deployments' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>搭建任务</h3><p>查看面板安装与节点创建的执行结果。</p></div></div><div className="admin-profile-records">{userDetail.deployments.map(item => <button type="button" key={item.id} onClick={() => { setUserDetail(null); setViewDeployment(item); }}><div><strong>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.requestId}</strong><small>{item.targetHostMasked || '未记录目标'} · {formatDate(item.createdAt)}</small><p>{item.resultSummary || item.errorMessage || '暂无执行结果'}</p></div><div><StatusBadge status={item.status} /><ChevronRight /></div></button>)}{!userDetail.deployments.length && <EmptyInline text="该客户暂无搭建任务" />}</div></div>}

          {userProfileTab === 'ledger' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>额度流水</h3><p>发放、冻结、核销、返还和人工调整记录。</p></div></div><div className="admin-profile-records">{userProfileLedger.map(item => <article key={item.id}><div><strong>{item.planName}</strong><small>{item.capability === 'panel' ? '面板额度' : '节点额度'} · {formatDate(item.createdAt)}</small><p>{item.note || '无备注'}{item.deploymentId ? ` · 关联任务 ${item.deploymentId.slice(0, 8)}` : ''}</p></div><div><StatusBadge status={item.action} /><b className={item.amount > 0 ? 'admin-number-positive' : item.amount < 0 ? 'admin-number-negative' : ''}>{item.amount > 0 ? `+${item.amount}` : item.amount}</b></div></article>)}{!userProfileLedger.length && <EmptyInline text="该客户暂无额度流水" />}</div></div>}
        </div>}
      </AdminDialog>
    </div>
  );
};

const Dashboard: React.FC<{
  stats: Stats | null;
  exceptions: AdminExceptions;
  orders: Order[];
  deployments: DeploymentRecord[];
  onNavigate: (tab: AdminTab) => void;
  onOpenOrder: (order: Order) => void;
  onOpenDeployment: (deployment: DeploymentRecord) => void;
}> = ({ stats, exceptions, orders, deployments, onNavigate, onOpenOrder, onOpenDeployment }) => {
  const successRate = stats?.deployments ? Math.round((stats.succeeded / stats.deployments) * 100) : 0;
  const recentOrders = orders.slice(0, 5);
  const recentDeployments = deployments.slice(0, 5);
  return <div className="admin-dashboard">
    <header className="admin-page-heading admin-dashboard-heading"><div><h2>运营概览与待处理</h2><p>优先查看需要处理的支付、权益和搭建异常，再浏览核心业务指标。</p></div><span className="admin-live"><i /> 数据已同步</span></header>
    <div className="admin-dashboard-strip"><div><strong>业务健康度</strong><p>支付、权益与交付链路的当前运行摘要</p></div><small>数据来自当前业务数据库</small></div>
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
    <section className={`admin-exception-center ${exceptions.summary.total ? 'has-exceptions' : 'clear'}`}>
      <header><div><span><AlertTriangle /></span><div><h3>待处理事项</h3><p>自动汇总支付、权益发放和搭建任务中需要人工处理的问题。</p></div></div><div className="admin-exception-summary"><b>{exceptions.summary.total}</b><span><strong>{exceptions.summary.critical}</strong> 紧急 · <strong>{exceptions.summary.warning}</strong> 提醒</span></div></header>
      <div className="admin-exception-list">
        {exceptions.items.slice(0, 8).map(item => <button type="button" key={item.id} className={item.severity} onClick={() => item.order ? onOpenOrder(item.order) : item.deployment ? onOpenDeployment(item.deployment) : onNavigate(item.targetType === 'order' ? 'orders' : 'deployments')}>
          <span>{item.severity === 'danger' ? <AlertTriangle /> : <Clock3 />}</span><div><strong>{item.title}</strong><p>{item.description}</p><small>{formatDate(item.createdAt)}</small></div><ChevronRight />
        </button>)}
        {!exceptions.items.length && <div className="admin-exception-empty"><CheckCircle2 /><div><strong>当前没有业务异常</strong><span>支付、权益和交付任务状态均未发现需要人工处理的问题。</span></div></div>}
      </div>
    </section>
    <div className="admin-dashboard-columns">
      <section className="admin-dashboard-panel"><header><div><h3>最近订单</h3><p>按创建时间倒序</p></div><button onClick={() => onNavigate('orders')}>查看全部</button></header><div className="admin-activity-list">{recentOrders.map(order => <div key={order.id}><span className="admin-activity-icon"><CreditCard /></span><div><strong>{order.username || '-'}</strong><small>{order.orderNo}</small></div><div className="right"><strong>{formatMoney(order.amountCents)}</strong><StatusBadge status={order.status} /></div></div>)}{!recentOrders.length && <EmptyInline text="暂无订单" />}</div></section>
      <section className="admin-dashboard-panel"><header><div><h3>最近交付任务</h3><p>面板安装与节点创建记录</p></div><button onClick={() => onNavigate('deployments')}>查看全部</button></header><div className="admin-activity-list">{recentDeployments.map(item => <div key={item.id}><span className="admin-activity-icon"><Network /></span><div><strong>{item.username || '-'}</strong><small>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.targetHostMasked || '-'}</small></div><div className="right"><StatusBadge status={item.status} /><small>{formatDate(item.createdAt)}</small></div></div>)}{!recentDeployments.length && <EmptyInline text="暂无交付任务" />}</div></section>
    </div>
  </div>;
};

const DiagnosisBadge: React.FC<{ diagnosis: OrderDetail['diagnosis'] }> = ({ diagnosis }) => <span className={`admin-diagnosis-badge ${diagnosis.severity}`} title={diagnosis.recommendedAction}><i />{diagnosis.processingLabel}</span>;

type AdminToolbarProps = { query: string; onQuery: (value: string) => void; placeholder: string; filter: string; onFilter: (value: string) => void; options: Array<[string, string]>; action?: React.ReactNode };

const AdminSection: React.FC<{ title: string; description: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => {
  return <div className="admin-section">
    <header className="admin-page-heading"><div><h2>{title}</h2><p>{description}</p></div>{action && <div className="admin-page-actions">{action}</div>}</header>
    <div className="admin-section-body">{children}</div>
  </div>;
};
const AdminToolbar: React.FC<AdminToolbarProps> = ({ query, onQuery, placeholder, filter, onFilter, options, action }) => <div className="admin-toolbar"><label className="admin-search"><Search /><input value={query} onChange={event => onQuery(event.target.value)} placeholder={placeholder} />{query && <button type="button" title="清除搜索" onClick={() => onQuery('')}><X /></button>}</label><div className="admin-toolbar-right"><div className="admin-filter-buttons" aria-label="状态筛选">{options.map(([value, label]) => <button type="button" key={value} className={`admin-filter-button ${filter === value ? 'active' : ''}`} aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}</button>)}</div>{(query || filter !== 'all') && <button type="button" className="admin-toolbar-clear" onClick={() => { onQuery(''); onFilter('all'); }}><X /> 清理</button>}{action && <div className="admin-toolbar-actions">{action}</div>}</div></div>;
const AdminTable: React.FC<{ columns: string[]; empty: string; children: React.ReactNode }> = ({ columns, empty, children }) => <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>{React.Children.count(children) === 0 && <div className="admin-table-empty"><Search /><strong>{empty}</strong><span>调整搜索词或筛选条件后再试。</span></div>}</div>;
const Pagination: React.FC<{ total: number; page: number; pageCount: number; onPage: (page: number) => void }> = ({ total, page, pageCount, onPage }) => {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(item => item === 1 || item === pageCount || Math.abs(item - page) <= 1);
  return <div className="admin-pagination"><span>共 <strong>{total}</strong> 条记录</span><div className="admin-page-buttons"><button className="admin-icon-button small" disabled={page <= 1} onClick={() => onPage(page - 1)} title="上一页"><ChevronLeft /></button>{pages.map((item, index) => <React.Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span className="admin-page-gap">...</span>}<button type="button" className={`admin-page-number ${item === page ? 'active' : ''}`} aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>{item}</button></React.Fragment>)}<button className="admin-icon-button small" disabled={page >= pageCount} onClick={() => onPage(page + 1)} title="下一页"><ChevronRight /></button></div></div>;
};
const Stat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; detail: string; tone: string }> = ({ icon: Icon, label, value, detail, tone }) => <div className={`admin-stat ${tone}`}><div className="admin-stat-head"><span className="admin-stat-icon"><Icon /></span><span className="admin-stat-signal"><i /> 实时</span></div><strong>{value}</strong><small>{label}</small><p>{detail}</p></div>;
const EmptyInline: React.FC<{ text: string }> = ({ text }) => <div className="admin-empty-inline">{text}</div>;
const AdminPageLoading = () => <div className="admin-page-loading"><RefreshCw /><p>正在读取管理数据...</p></div>;
const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="admin-detail-block"><header><FileText /><h3>{title}</h3></header>{children}</section>;
const DetailItem: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => <div className={`admin-detail-item ${mono ? 'mono' : ''} ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
const PayloadDetails: React.FC<{ payload: string; label: string }> = ({ payload, label }) => {
  let formatted = payload || '{}';
  try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch { /* Preserve non-JSON gateway responses. */ }
  return <details className="admin-payload-details"><summary>{label}</summary><pre>{formatted}</pre></details>;
};
const PlanSnapshotDetails: React.FC<{ order: Order }> = ({ order }) => {
  const snapshot = parsePlanSnapshot(order);
  return <div className="admin-detail-grid"><DetailItem label="套餐名称" value={String(snapshot.name || '套餐快照')} /><DetailItem label="套餐说明" value={String(snapshot.description || '无')} /><DetailItem label="面板额度" value={snapshot.panelMode === 'unlimited' ? '不限次数' : snapshot.panelMode === 'none' ? '不包含' : `${Number(snapshot.panelLimit || 0)} 次`} /><DetailItem label="节点额度" value={snapshot.nodeMode === 'unlimited' ? '不限次数' : snapshot.nodeMode === 'none' ? '不包含' : `${Number(snapshot.nodeLimit || 0)} 次`} /><DetailItem label="每日面板上限" value={Number(snapshot.dailyPanelLimit || 0) || '不限'} /><DetailItem label="每日节点上限" value={Number(snapshot.dailyNodeLimit || 0) || '不限'} /><DetailItem label="并发任务上限" value={Number(snapshot.concurrencyLimit || 1)} /><DetailItem label="有效期" value={snapshot.durationUnit === 'lifetime' ? '永久有效' : `${Number(snapshot.durationValue || 0)} ${snapshot.durationUnit === 'years' ? '年' : snapshot.durationUnit === 'quarters' ? '个季度' : snapshot.durationUnit === 'months' ? '个月' : '天'}`} /></div>;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const labels: Record<string, string> = { created: '已创建', pending: '待确认', paid: '已付款', failed: '失败', closed: '已关闭', accepted: '已验收', rejected: '已拒绝', refunded: '已退款', cancelled: '已取消', expired: '已过期', active: '正常', redeemed: '已兑换', disabled: '已禁用', admin: '管理员', user: '普通用户', enabled: '已上架', revoked: '已撤销', reserved: '已预约', running: '执行中', succeeded: '成功', uncertain: '待核对', grant: '发放', reserve: '冻结', consume: '核销', release: '返还', adjust: '调额', panel: '面板', node: '节点', plan: '套餐', order: '订单', entitlement: '权益', deployment: '交付任务', redeem_code: '卡密', settings: '系统设置' };
  return <span className={`admin-status ${status}`}>{labels[status] || status}</span>;
};

const SettingSwitch: React.FC<{ label: string; description: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, description, checked, onChange }) => <div className="admin-setting-row"><div><strong>{label}</strong><p>{description}</p></div><button type="button" role="switch" aria-checked={checked} className={`admin-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>;

const PlanDialog: React.FC<{ plan: (Omit<Plan, 'id'> & { id?: string }) | null; busy: boolean; onChange: (plan: (Omit<Plan, 'id'> & { id?: string }) | null) => void; onClose: () => void; onSave: () => void }> = ({ plan, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(plan)} title={plan?.id ? '编辑套餐' : '新增套餐'} description="套餐会在用户端用于创建订单，已创建订单继续使用下单时保存的套餐快照。" confirmLabel="保存套餐" busy={busy} confirmDisabled={!plan?.name.trim()} onClose={onClose} onConfirm={onSave}>{plan && <div className="admin-form-grid">
  <label className="admin-field"><span>套餐名称</span><input value={plan.name} onChange={event => onChange({ ...plan, name: event.target.value })} maxLength={80} /></label>
  <label className="admin-field"><span>价格（元）</span><NumberInput min="0" step="0.01" value={plan.priceCents / 100} onValueChange={price => onChange({ ...plan, priceCents: Math.round(price * 100) })} /></label>
  <label className="admin-field span-2"><span>套餐说明</span><input value={plan.description} onChange={event => onChange({ ...plan, description: event.target.value })} maxLength={300} /></label>
  <label className="admin-field"><span>有效期单位</span><select value={plan.durationUnit} onChange={event => onChange({ ...plan, durationUnit: event.target.value as Plan['durationUnit'] })}><option value="days">天</option><option value="months">月</option><option value="quarters">季度</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
  <label className="admin-field"><span>有效期数值</span><NumberInput min="0" disabled={plan.durationUnit === 'lifetime'} value={plan.durationValue} onValueChange={durationValue => onChange({ ...plan, durationValue })} /></label>
  <label className="admin-field"><span>面板权益</span><select value={plan.panelMode} onChange={event => onChange({ ...plan, panelMode: event.target.value as Plan['panelMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>面板总次数</span><NumberInput min="0" disabled={plan.panelMode !== 'limited'} value={plan.panelLimit} onValueChange={panelLimit => onChange({ ...plan, panelLimit })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={plan.nodeMode} onChange={event => onChange({ ...plan, nodeMode: event.target.value as Plan['nodeMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>节点总次数</span><NumberInput min="0" disabled={plan.nodeMode !== 'limited'} value={plan.nodeLimit} onValueChange={nodeLimit => onChange({ ...plan, nodeLimit })} /></label>
  <label className="admin-field"><span>每日面板上限</span><NumberInput min="0" value={plan.dailyPanelLimit} onValueChange={dailyPanelLimit => onChange({ ...plan, dailyPanelLimit })} /><small>0 表示不限制</small></label>
  <label className="admin-field"><span>每日节点上限</span><NumberInput min="0" value={plan.dailyNodeLimit} onValueChange={dailyNodeLimit => onChange({ ...plan, dailyNodeLimit })} /><small>0 表示不限制</small></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={plan.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...plan, concurrencyLimit })} /></label>
  <label className="admin-field"><span>显示排序</span><NumberInput value={plan.sortOrder} onValueChange={sortOrder => onChange({ ...plan, sortOrder })} /></label>
  <label className="admin-checkbox span-2"><input type="checkbox" checked={plan.homepageVisible} onChange={event => onChange({ ...plan, homepageVisible: event.target.checked })} /><span><strong>在官网首页展示此套餐</strong><small>此开关只控制官网套餐区域；套餐仍需上架后才会显示并可购买。</small></span></label>
  <label className="admin-checkbox span-2"><input type="checkbox" checked={plan.enabled} onChange={event => onChange({ ...plan, enabled: event.target.checked })} /><span><strong>在用户端上架此套餐</strong><small>下架后不能新建订单，已有订单和权益不受影响。</small></span></label>
</div>}</AdminDialog>;

const GrantDialog: React.FC<{ open: boolean; busy: boolean; users: AdminUser[]; value: typeof emptyGrant; onChange: (value: typeof emptyGrant) => void; onClose: () => void; onSave: () => void }> = ({ open, busy, users, value, onChange, onClose, onSave }) => <AdminDialog open={open} title="手工发放权益" description="直接为指定用户创建一条真实权益记录，不会创建订单或收入记录。" confirmLabel="确认发放权益" tone="success" busy={busy} confirmDisabled={!value.userId || !value.name.trim()} onClose={onClose} onConfirm={onSave}><div className="admin-form-grid">
  <label className="admin-field"><span>用户</span><select value={value.userId} onChange={event => onChange({ ...value, userId: event.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
  <label className="admin-field"><span>权益名称</span><input value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} maxLength={80} /></label>
  <label className="admin-field"><span>有效期单位</span><select value={value.durationUnit} onChange={event => onChange({ ...value, durationUnit: event.target.value })}><option value="days">天</option><option value="months">月</option><option value="quarters">季度</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
  <label className="admin-field"><span>有效期数值</span><NumberInput min="0" disabled={value.durationUnit === 'lifetime'} value={value.durationValue} onValueChange={durationValue => onChange({ ...value, durationValue })} /></label>
  <label className="admin-field"><span>面板权益</span><select value={value.panelMode} onChange={event => onChange({ ...value, panelMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>面板次数</span><NumberInput min="0" disabled={value.panelMode !== 'limited'} value={value.panelLimit} onValueChange={panelLimit => onChange({ ...value, panelLimit })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={value.nodeMode} onChange={event => onChange({ ...value, nodeMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
  <label className="admin-field"><span>节点次数</span><NumberInput min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeLimit} onValueChange={nodeLimit => onChange({ ...value, nodeLimit })} /></label>
  <label className="admin-field"><span>每日面板上限</span><NumberInput min="0" value={value.dailyPanelLimit} onValueChange={dailyPanelLimit => onChange({ ...value, dailyPanelLimit })} /></label>
  <label className="admin-field"><span>每日节点上限</span><NumberInput min="0" value={value.dailyNodeLimit} onValueChange={dailyNodeLimit => onChange({ ...value, dailyNodeLimit })} /></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={value.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...value, concurrencyLimit })} /></label>
</div></AdminDialog>;

const QuotaDialog: React.FC<{ value: Entitlement | null; busy: boolean; onChange: (value: Entitlement | null) => void; onClose: () => void; onSave: () => void }> = ({ value, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(value)} title="调整权益额度" description="修改剩余额度时，系统会保留已使用和已冻结数量，并重新计算总额度。" confirmLabel="保存额度调整" busy={busy} onClose={onClose} onConfirm={onSave}>{value && <div className="admin-form-grid">
  <div className="admin-form-context span-2"><strong>{value.username}</strong><span>{value.planName}</span></div>
  <label className="admin-field"><span>面板剩余次数</span><NumberInput min="0" disabled={value.panelMode !== 'limited'} value={value.panelRemaining} onValueChange={panelRemaining => onChange({ ...value, panelRemaining })} /><small>{value.panelMode === 'limited' ? `已用 ${value.panelUsed}，冻结 ${value.panelReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>节点剩余次数</span><NumberInput min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeRemaining} onValueChange={nodeRemaining => onChange({ ...value, nodeRemaining })} /><small>{value.nodeMode === 'limited' ? `已用 ${value.nodeUsed}，冻结 ${value.nodeReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>每日面板上限</span><NumberInput min="0" value={value.dailyPanelLimit} onValueChange={dailyPanelLimit => onChange({ ...value, dailyPanelLimit })} /></label>
  <label className="admin-field"><span>每日节点上限</span><NumberInput min="0" value={value.dailyNodeLimit} onValueChange={dailyNodeLimit => onChange({ ...value, dailyNodeLimit })} /></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={value.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...value, concurrencyLimit })} /></label>
</div>}</AdminDialog>;

const ContactMethodEditor: React.FC<{ method: ContactMethod; idLocked: boolean; onChange: (method: ContactMethod) => void }> = ({ method, idLocked, onChange }) => {
  const patch = (value: Partial<ContactMethod>) => onChange({ ...method, ...value });
  return <div className="admin-form-grid">
    <label className="admin-field"><span>联系方式类型</span><select value={method.type} onChange={event => { const type = event.target.value as ContactMethod['type']; patch({ type, name: method.name === contactTypeLabels[method.type] ? contactTypeLabels[type] : method.name }); }}>{Object.entries(contactTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="admin-field"><span>唯一标识</span><input value={method.id} maxLength={40} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于绑定二维码，创建后不可修改。' : '用于独立保存二维码，创建后不可修改。'}</small></label>
    <label className="admin-field"><span>显示名称</span><input value={method.name} maxLength={80} onChange={event => patch({ name: event.target.value })} placeholder={contactTypeLabels[method.type]} /></label>
    <label className="admin-field"><span>显示排序</span><NumberInput min="-9999" max="9999" value={method.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>
    <label className="admin-field span-2"><span>账号或联系信息</span><textarea value={method.value} maxLength={1000} onChange={event => patch({ value: event.target.value })} placeholder="例如：example、@example、support@example.com" /><small>这里填写的内容会和本条二维码一起显示。</small></label>
    <label className="admin-field span-2"><span>联系链接</span><input value={method.contactUrl} maxLength={1000} onChange={event => patch({ contactUrl: event.target.value })} placeholder="https://t.me/example、mailto:support@example.com 或 tel:+8613800000000" /><small>可选，支持 HTTP、HTTPS、mailto 和 tel。</small></label>
    <label className="admin-field span-2"><span>二维码图片地址</span><input type="url" value={method.qrCodeUrl} maxLength={1000} onChange={event => patch({ qrCodeUrl: event.target.value })} placeholder="https://example.com/contact.png" /><small>可选。保存更改后也可在列表中上传图片，上传图片优先显示。</small></label>
    <label className="admin-checkbox span-2"><input type="checkbox" checked={method.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此联系方式</strong><small>关闭后该方式从用户咨询弹窗隐藏，配置和二维码仍然保留。</small></span></label>
  </div>;
};

const ResourceRecommendationEditor: React.FC<{ item: ResourceRecommendation; idLocked: boolean; onChange: (item: ResourceRecommendation) => void }> = ({ item, idLocked, onChange }) => {
  const patch = (value: Partial<ResourceRecommendation>) => onChange({ ...item, ...value });
  return <div className="admin-form-grid">
    <label className="admin-field"><span>推荐分类</span><select value={item.category} onChange={event => patch({ category: event.target.value as ResourceRecommendation['category'] })}><option value="server">服务器厂商</option><option value="residential_ip">住宅 IP 厂商</option></select></label>
    <label className="admin-field"><span>唯一标识</span><input value={item.id} maxLength={40} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于绑定 Logo，创建后不可修改。' : '用于 Logo 存储，创建后不可修改。'}</small></label>
    <label className="admin-field"><span>厂商名称</span><input value={item.name} maxLength={80} onChange={event => patch({ name: event.target.value })} /></label>
    <label className="admin-field"><span>推荐标签</span><input value={item.badge} maxLength={30} onChange={event => patch({ badge: event.target.value })} placeholder="例如：新手推荐" /></label>
    <label className="admin-field span-2"><span>简短介绍</span><textarea value={item.description} maxLength={500} onChange={event => patch({ description: event.target.value })} placeholder="简要说明厂商特点和适用场景" /><small>{item.description.length} / 500</small></label>
    <label className="admin-field span-2"><span>跳转链接</span><input type="url" value={item.purchaseUrl} maxLength={1000} onChange={event => patch({ purchaseUrl: event.target.value })} placeholder="https://example.com" /><small>保存后可在推荐列表中点击自动获取 Logo。</small></label>
    <label className="admin-field"><span>按钮名称</span><input value={item.buttonLabel} maxLength={30} onChange={event => patch({ buttonLabel: event.target.value })} placeholder="了解详情" /></label>
    <label className="admin-field"><span>显示排序</span><NumberInput min="-9999" max="9999" value={item.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>
    <label className="admin-field span-2"><span>Logo 图片地址</span><input type="url" value={item.logoUrl} maxLength={1000} onChange={event => patch({ logoUrl: event.target.value })} placeholder="https://example.com/logo.png" /><small>可选。也可保存推荐项后自动获取或上传图片，本站保存的图片优先显示。</small></label>
    <label className="admin-checkbox"><input type="checkbox" checked={item.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此推荐项</strong><small>还需开启对应分类才会在用户端显示。</small></span></label>
    <label className="admin-checkbox"><input type="checkbox" checked={item.openInNewTab} onChange={event => patch({ openInNewTab: event.target.checked })} /><span><strong>在新窗口打开跳转链接</strong><small>建议外部厂商页面保持开启。</small></span></label>
  </div>;
};

const PaymentMethodEditor: React.FC<{ method: PaymentMethod; idLocked: boolean; onChange: (method: PaymentMethod) => void }> = ({ method, idLocked, onChange }) => {
  const provider = paymentProvider(method);
  const patch = (value: Partial<PaymentMethod>) => onChange({ ...method, ...value });
  const secretPlaceholder = method.merchantSecretConfigured ? '已配置，留空保持不变' : '请输入密钥';
  const privateKeyPlaceholder = method.privateKeyConfigured ? '已配置，留空保持不变' : '粘贴完整私钥内容';
  const apiV3Placeholder = method.apiV3KeyConfigured ? '已配置，留空保持不变' : '输入 32 位 API v3 密钥';
  return <div className="admin-form-grid">
    <label className="admin-field"><span>显示名称</span><input value={method.name} maxLength={40} onChange={event => patch({ name: event.target.value })} /></label>
    <label className="admin-field"><span>唯一标识</span><input value={method.id} maxLength={32} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于订单和回调匹配，创建后不可修改。' : '用于订单和回调匹配，创建后不可修改。'}</small></label>
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
    <label className="admin-field"><span>显示排序</span><NumberInput value={method.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>

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
      </div><small>可同时启用多种方式。启用此易支付渠道时至少选择一种；如果只使用卡密，可停用整个支付渠道。</small></div>
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

function paymentCheckLabel(status: PaymentCheckResult['status']) {
  return {
    ready: '检测通过',
    disabled: '渠道已停用',
    incomplete: '配置不完整',
    unreachable: '网关不可达',
    invalid: '配置无效',
  }[status];
}

function durationText(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', quarters: '个季度', years: '年' };
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
