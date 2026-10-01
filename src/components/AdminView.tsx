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
  PortableBackupValidation,
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
import { adminThemeStorageKey, ThemeToggle } from './ThemeToggle';
import { NumberInput } from './NumberInput';
import { AdminDialog } from './admin/AdminDialog';
import {
  AdminTab,
  AdminUser,
  adminCommands,
  adminTabMeta,
  AuditLog,
  contactTypeLabels,
  CreatedRedeemCode,
  emptyAdminExceptions,
  emptyContactMethod,
  emptyContactSettings,
  emptyEmailSettings,
  emptyExternalRedeemSettings,
  emptyGrant,
  emptyPaymentMethod,
  emptyPlan,
  emptyRecommendation,
  emptyRecommendationSettings,
  emptyUser,
  navigation,
  navigationGroups,
  PAGE_SIZE,
  PORTABLE_BACKUP_CONTENT_TYPE,
  SettingsDialog,
  SettingsSection,
  Stats,
  SystemSettings,
  SystemVersionStatus,
  UsageLedgerEntry,
  UserDetail,
  UserProfileTab,
} from './admin/adminModel';

import {
  AdminPageLoading,
  AdminSection,
  AdminTable,
  AdminToolbar,
  ContactMethodEditor,
  Dashboard,
  DetailBlock,
  DetailItem,
  DiagnosisBadge,
  EmptyInline,
  GrantDialog,
  Pagination,
  PayloadDetails,
  PaymentMethodEditor,
  PlanDialog,
  PlanSnapshotDetails,
  QuotaDialog,
  ResourceRecommendationEditor,
  SettingSwitch,
  StatusBadge,
} from './admin/AdminViewParts';
import {
  auditActionText,
  auditDetail,
  downloadCsv,
  entitlementStatus,
  legacyPaymentType,
  paymentChannelName,
  paymentChannelText,
  paymentCheckLabel,
  paymentProvider,
  paymentProviderName,
  paymentProviderText,
  planSnapshotName,
  userActionDescription,
  userActionTitle,
} from './admin/adminUtils';

const UPDATE_STAGE_LABELS = [
  { key: 'queued', label: '排队' },
  { key: 'downloading', label: '下载' },
  { key: 'verifying', label: '校验' },
  { key: 'dependencies', label: '安装' },
  { key: 'switching', label: '切换' },
  { key: 'health-check', label: '验证' },
];

function updateStageIndex(stage?: string) {
  if (stage === 'completed') return UPDATE_STAGE_LABELS.length;
  if (stage === 'restarting') return 4;
  if (stage === 'failed' || stage === 'interrupted' || stage === 'rolled-back') return UPDATE_STAGE_LABELS.findIndex(item => item.key === 'switching');
  return Math.max(0, UPDATE_STAGE_LABELS.findIndex(item => item.key === stage));
}


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
  const [settingsData, setSettingsData] = useState<SystemSettings>({ registrationEnabled: true, panelDeployEnabled: true, nodeDeployEnabled: true, paymentInstructions: '', paymentMethods: [], email: emptyEmailSettings, orderExpiryMinutes: 30, adminPath: 'admin', redeemCodePurchaseUrl: '', externalRedeem: emptyExternalRedeemSettings, contact: emptyContactSettings, recommendations: emptyRecommendationSettings });
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState('');
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false);
  const [savedPaymentMethodIds, setSavedPaymentMethodIds] = useState<string[]>([]);
  const [savedRecommendationIds, setSavedRecommendationIds] = useState<string[]>([]);
  const [paymentChecks, setPaymentChecks] = useState<Record<string, PaymentCheckResult>>({});
  const [paymentCheckBusy, setPaymentCheckBusy] = useState('');
  const [databaseFile, setDatabaseFile] = useState<File | null>(null);
  const [databaseValidation, setDatabaseValidation] = useState<PortableBackupValidation | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [savedContactMethodIds, setSavedContactMethodIds] = useState<string[]>([]);
  const [accountUsername, setAccountUsername] = useState(currentUser.username);
  const [adminPathDraft, setAdminPathDraft] = useState('admin');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [settingsDialog, setSettingsDialog] = useState<SettingsDialog>(null);
  const [securityDialog, setSecurityDialog] = useState<'username' | 'path' | 'password' | 'update' | 'backup' | null>(null);
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
  const [redeemCodeDraft, setRedeemCodeDraft] = useState({ amountCents: 0, quantity: 10, note: '', expiresAt: '' });
  const [redeemCodeDialogOpen, setRedeemCodeDialogOpen] = useState(false);
  const [createdRedeemCodes, setCreatedRedeemCodes] = useState<CreatedRedeemCode[]>([]);
  const [versionStatus, setVersionStatus] = useState<SystemVersionStatus | null>(null);
  const [updateConfirmation, setUpdateConfirmation] = useState('');
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const updateActive = versionStatus?.state === 'scheduled' || versionStatus?.state === 'running';
  const updateProgress = Math.max(0, Math.min(100, versionStatus?.progress || 0));
  const updateStage = updateStageIndex(versionStatus?.stage);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [statsResult, exceptionResult, plansResult, ordersResult, usersResult, entitlementResult, deploymentResult, ledgerResult, auditResult, settingsResult, attemptResult, notificationResult, redeemCodeResult, versionResult] = await Promise.all([
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
        api<{ status: SystemVersionStatus }>('/api/admin/system/version'),
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
      setVersionStatus(versionResult.status);
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
    if (!updateActive) return;
    let stopped = false;
    const pollUpdateStatus = async () => {
      try {
        const result = await api<{ status: SystemVersionStatus }>('/api/admin/system/version');
        if (stopped) return;
        setVersionStatus(result.status);
        if (result.status.targetVersion && result.status.currentVersion === result.status.targetVersion) {
          window.location.reload();
        }
      } catch {
        // The service can be briefly unavailable while 1Panel restarts it.
      }
    };
    void pollUpdateStatus();
    const timer = window.setInterval(pollUpdateStatus, 3_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [updateActive, versionStatus?.targetVersion]);
  useEffect(() => {
    setQuery('');
    setStatusFilter('all');
    setPage(1);
    setMobileNavOpen(false);
  }, [tab]);
  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandQuery('');
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleNavigationKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleNavigationKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleNavigationKeys);
    };
  }, [mobileNavOpen]);

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
    const matchesQuery = !normalizedQuery || `${item.codeMasked} ${item.amountCents} ${item.note} ${item.redeemedByUsername || ''}`.toLowerCase().includes(normalizedQuery);
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

  const normalizeContactMethod = (method: ContactMethod) => ({
    ...method,
    id: method.id.trim().toLowerCase(),
    name: method.name.trim(),
    value: method.value.trim(),
    contactUrl: method.contactUrl.trim(),
    qrCodeUrl: method.qrCodeUrl.trim(),
  });

  const saveContactMethodDraft = () => {
    if (!editingContactMethod) return;
    const normalized = normalizeContactMethod(editingContactMethod.method);
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
    const normalized = normalizeContactMethod(method);
    if (!normalized.id || !normalized.name) return showToast('请先完善联系方式', '填写显示名称和唯一标识后即可上传', 'warning');
    const duplicate = settingsData.contact.methods.some((item, itemIndex) => item.id === normalized.id && itemIndex !== index);
    if (duplicate) return showToast('联系方式标识重复', '请为每种联系方式填写不同的唯一标识', 'warning');
    setBusy(true);
    try {
      let targetIndex = index;
      if (!savedContactMethodIds.includes(normalized.id)) {
        const methods = index < 0
          ? [...settingsData.contact.methods, normalized]
          : settingsData.contact.methods.map((item, itemIndex) => itemIndex === index ? normalized : item);
        targetIndex = index < 0 ? methods.length - 1 : index;
        const contact = { ...settingsData.contact, methods };
        await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ contact }) });
        setSettingsData(value => ({ ...value, contact }));
        setSavedContactMethodIds(methods.map(item => item.id));
        setSavedSettingsSnapshot(snapshot => {
          try {
            const saved = JSON.parse(snapshot) as SystemSettings;
            return JSON.stringify({ ...saved, contact });
          } catch {
            return snapshot;
          }
        });
        setEditingContactMethod({ index: targetIndex, method: normalized });
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'));
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      await api(`/api/admin/contact-methods/${encodeURIComponent(normalized.id)}/qr`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
      updateContactMethod(targetIndex, { qrCodeUploaded: true });
      setEditingContactMethod(current => current && current.index === targetIndex
        ? { ...current, method: { ...current.method, qrCodeUploaded: true } }
        : current);
      showToast(`${normalized.name}二维码已上传`, index < 0 ? '联系方式已自动保存，前台会优先显示上传的图片' : '前台会优先显示上传的图片', 'success');
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
        dailyPanelLimit: 0,
        dailyNodeLimit: 0,
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
    if (backupPassword.length < 12) return showToast('请设置备份密码', '至少 12 位；迁移恢复时必须使用同一密码', 'warning');
    setBusy(true);
    try {
      const response = await fetch('/api/admin/system-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: backupPassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `备份下载失败（HTTP ${response.status}）`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || `xui-complete-backup-${new Date().toISOString().slice(0, 10)}.xuibak`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupPassword('');
      showToast('完整系统备份已下载', `${Math.max(1, Math.round(blob.size / 1024))} KB · 请妥善保存备份密码`, 'success');
    } catch (error) {
      showToast('完整备份失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectDatabaseFile = (file?: File) => {
    setDatabaseValidation(null);
    setRestoreConfirmation('');
    if (!file) return setDatabaseFile(null);
    if (!file.name.toLowerCase().endsWith('.xuibak')) {
      setDatabaseFile(null);
      return showToast('备份文件格式不正确', '请选择扩展名为 .xuibak 的完整系统备份', 'warning');
    }
    if (file.size > 96 * 1024 * 1024) {
      setDatabaseFile(null);
      return showToast('备份文件过大', '完整系统备份不能超过 96MB', 'warning');
    }
    setDatabaseFile(file);
  };

  const validateDatabaseFile = async () => {
    if (!databaseFile) return showToast('请选择完整备份', '上传 .xuibak 文件后再进行校验', 'warning');
    if (restorePassword.length < 12) return showToast('请输入备份密码', '使用创建此备份时设置的密码', 'warning');
    setBusy(true);
    setDatabaseValidation(null);
    try {
      const response = await fetch('/api/admin/system-backup/validate', {
        method: 'POST',
        headers: { 'Content-Type': PORTABLE_BACKUP_CONTENT_TYPE, 'x-backup-password': restorePassword },
        body: databaseFile,
      });
      const data = await response.json().catch(() => ({})) as { validation?: PortableBackupValidation; error?: string };
      if (!response.ok || !data.validation) throw new Error(data.error || `备份校验失败（HTTP ${response.status}）`);
      setDatabaseValidation(data.validation);
      showToast('完整备份校验通过', '加密配置和业务数据均可恢复', 'success');
    } catch (error) {
      showToast('完整备份不可用', error instanceof Error ? error.message : '请检查文件和密码', 'error');
    } finally {
      setBusy(false);
    }
  };

  const restoreDatabase = async () => {
    if (!databaseFile || !databaseValidation || restoreConfirmation !== 'RESTORE') return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/system-backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': PORTABLE_BACKUP_CONTENT_TYPE, 'x-backup-password': restorePassword, 'x-restore-confirmation': restoreConfirmation },
        body: databaseFile,
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || `数据库恢复失败（HTTP ${response.status}）`);
      setRestoreDialogOpen(false);
      showToast('系统备份已恢复', '数据和加密配置已迁移，全部登录会话已失效', 'success');
      window.setTimeout(onSessionEnded, 300);
    } catch (error) {
      showToast('完整备份恢复失败', error instanceof Error ? error.message : '当前数据未被替换', 'error');
      setBusy(false);
    }
  };

  const checkSystemUpdate = async () => {
    setBusy(true);
    try {
      const result = await api<{ status: SystemVersionStatus }>('/api/admin/system/update/check', { method: 'POST' });
      setVersionStatus(result.status);
      const active = result.status.state === 'scheduled' || result.status.state === 'running';
      showToast(
        active ? '检测到进行中的更新任务' : result.status.updateAvailable ? '发现新版本' : '当前已经是最新版本',
        active ? (result.status.message || `正在更新到 v${result.status.targetVersion || result.status.latestVersion}`) : result.status.updateAvailable ? `v${result.status.currentVersion} → v${result.status.latestVersion}；检查版本不会自动安装` : `当前版本 v${result.status.currentVersion}`,
        active || result.status.updateAvailable ? 'info' : 'success'
      );
    } catch (error) {
      showToast('检查更新失败', error instanceof Error ? error.message : '请检查服务器到 GitHub 的网络', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startSystemUpdate = async () => {
    if (!versionStatus?.latestVersion || updateConfirmation !== 'UPDATE') return;
    setBusy(true);
    try {
      const result = await api<{ status: SystemVersionStatus }>('/api/admin/system/update', {
        method: 'POST',
        body: JSON.stringify({ confirmation: updateConfirmation }),
      });
      setVersionStatus(result.status);
      setUpdateDialogOpen(false);
      setUpdateConfirmation('');
      setSecurityDialog('update');
      showToast('更新任务已手动启动', `目标版本 v${result.status.targetVersion || versionStatus.latestVersion}；可以关闭弹窗，后台进度会持续保存`, 'success');
    } catch (error) {
      showToast('更新启动失败', error instanceof Error ? error.message : '当前版本没有被替换', 'error');
    } finally {
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

  const filteredCommands = adminCommands.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(commandQuery.trim().toLowerCase()));
  const runCommand = (item: typeof adminCommands[number]) => {
    setTab(item.tab);
    if (item.section) setSettingsSection(item.section);
    setCommandOpen(false);
    setCommandQuery('');
  };

  return (
    <div className="pro-admin">
      <aside id="admin-navigation" className={`pro-sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="pro-brand"><span className="pro-brand-mark"><Terminal /></span><span><strong>xui<span>OPS</span></strong><small>商业运营控制台</small></span></div>
        <div className="pro-workspace"><span className="pro-workspace-dot" /> 生产环境 <ChevronRight /></div>
        <nav className="pro-navigation" aria-label="管理导航">
          {navigationGroups.map(group => <div className="pro-nav-group" key={group.label}>
            <div className="pro-nav-label">{group.label}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              return <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setMobileNavOpen(false); }}><Icon /><span>{item.label}</span>{item.id === 'orders' && Boolean(stats?.pendingOrders) && <b>{stats?.pendingOrders}</b>}{item.id === 'deployments' && Boolean(stats?.uncertain) && <b>{stats?.uncertain}</b>}</button>;
            })}
          </div>)}
        </nav>
        <div className="pro-sidebar-bottom"><div className="pro-system-status"><i />系统运行正常<span>v{versionStatus?.currentVersion || 'dev'}</span></div><div className="pro-account"><span className="pro-avatar">{currentUser.username.slice(0, 1).toUpperCase()}</span><div><strong>{currentUser.username}</strong><small>系统管理员</small></div><button type="button" onClick={onLogout} title="退出管理端"><LogOut /></button></div></div>
      </aside>
      {mobileNavOpen && <button type="button" className="pro-overlay" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航" />}
      <div className="pro-shell">
        <header className="pro-header">
          <div className="pro-header-left"><button type="button" className="pro-mobile-menu" onClick={() => setMobileNavOpen(value => !value)} aria-label="打开导航"><Menu /></button><div className="pro-breadcrumb"><span>控制台</span><ChevronRight /><strong>{currentMeta.area}</strong><ChevronRight /><b>{currentTitle}</b></div></div>
          <div className="pro-header-actions"><span className="pro-live"><i />{currentContext}</span><button type="button" className="pro-command" onClick={() => { setCommandQuery(''); setCommandOpen(true); }}><Search /><span>搜索功能</span><kbd>⌘ K</kbd></button><ThemeToggle compact storageKey={adminThemeStorageKey(currentUser.id)} /><a href="/" target="_blank" rel="noreferrer">用户端 <ExternalLink /></a><button type="button" className="pro-refresh" onClick={() => void load()} disabled={loading} title="刷新全部数据"><RefreshCw className={loading ? 'spinning' : ''} /></button></div>
        </header>
        <main className="pro-main">
          <div className="pro-page-heading"><div><div className="pro-eyebrow">{currentMeta.area} / {currentMeta.description}</div><h1>{currentTitle}</h1><p>{currentMeta.description}</p></div>{activeList.length > 0 && <button type="button" className="pro-export" onClick={exportCurrent}><Download /> 导出数据</button>}</div>
          <div className="pro-content">
          {loading ? <AdminPageLoading /> : <>
            {tab === 'dashboard' && <Dashboard stats={stats} exceptions={exceptions} orders={orders} deployments={deployments} onNavigate={setTab} onOpenOrder={order => void openOrderDetail(order)} onOpenDeployment={setViewDeployment} />}

            {tab === 'orders' && <AdminSection title="订单管理" description="核对在线支付订单、取消待付订单与退款撤权。" action={<button type="button" className="admin-button secondary" onClick={() => setPaymentRuntimeOpen(true)}><Activity /> 支付记录</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索订单号、用户、交易号或处理状态" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部处理状态'], ['paid_missing_entitlement', '已付款但缺少权益'], ['payment_attention', '支付链路需核对'], ['completed', '付款与权益完成'], ['paid_entitlement_inactive', '已付款但权益不可用'], ['pending_payment', '等待用户付款'], ['expired', '订单已过期'], ['cancelled', '订单已取消'], ['refunded', '订单已退款']]} />
              <AdminTable columns={['订单信息', '用户', '金额', '订单状态', '处理状态', '支付信息', '创建时间', '操作']} empty="没有符合条件的订单">
                {filteredOrders.slice(pageStart, pageStart + PAGE_SIZE).map(order => <tr key={order.id}>
                  <td><strong className="admin-primary-text">{order.orderNo}</strong><small className="admin-cell-sub">{planSnapshotName(order)}</small></td>
                  <td>{order.username ? <button type="button" className="admin-record-link" onClick={() => openUserById(order.userId, 'orders')}>{order.username}</button> : '-'}</td><td className="admin-money">{formatMoney(order.amountCents)}</td><td><StatusBadge status={order.status} /></td><td>{order.diagnosis ? <DiagnosisBadge diagnosis={order.diagnosis} /> : <span className="admin-muted">-</span>}</td>
                  <td>{order.paymentTradeNo ? <><span>{paymentProviderName(order.paymentProvider || '-')}</span><small className="admin-cell-sub">{order.paymentTradeNo}</small></> : <span className="admin-muted">未支付</span>}</td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="查看订单详情" disabled={orderDetailLoading} onClick={() => void openOrderDetail(order)}><Eye /></button>{order.status === 'pending' && <button className="admin-link danger" onClick={() => setCancelOrder(order)}>取消</button>}{order.status === 'paid' && !['redeem_code', 'external_redeem', 'balance'].includes(order.paymentProvider) && <button className="admin-link warning" onClick={() => { setRefundOrder(order); setRefundTradeNo(''); setRefundReason(''); }}>登记外部退款</button>}</div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredOrders.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'plans' && <AdminSection title="套餐管理" description="手动配置永久次数套餐的价格、面板次数和节点次数。" action={<button className="admin-button primary" onClick={() => setEditingPlan({ ...emptyPlan })}><PackagePlus /> 新增套餐</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索套餐名称或说明" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['enabled', '已上架'], ['disabled', '已下架']]} />
              <AdminTable columns={['套餐', '价格与有效期', '面板额度', '节点额度', '并发限制', '官网首页', '状态', '操作']} empty="没有符合条件的套餐">
                {filteredPlans.slice(pageStart, pageStart + PAGE_SIZE).map(plan => <tr key={plan.id}>
                  <td><strong className="admin-primary-text">{plan.name}</strong><small className="admin-cell-sub admin-truncate">{plan.description || '暂无说明'}</small></td>
                  <td><strong>{formatMoney(plan.priceCents)}</strong><small className="admin-cell-sub">永久有效</small></td>
                  <td>{quotaText(plan.panelMode, plan.panelLimit)}</td><td>{quotaText(plan.nodeMode, plan.nodeLimit)}</td>
                  <td><span>永久有效</span><small className="admin-cell-sub">并发 {plan.concurrencyLimit}</small></td>
                  <td>{plan.homepageVisible ? <span className="admin-link success">展示</span> : <span className="admin-muted">隐藏</span>}</td>
                  <td><StatusBadge status={plan.enabled ? 'enabled' : 'disabled'} /></td>
                  <td><div className="admin-row-actions"><button className="admin-icon-button small" title="编辑套餐" onClick={() => setEditingPlan({ ...plan })}><Pencil /></button><button className="admin-icon-button small" title="复制套餐" onClick={() => setEditingPlan({ ...plan, id: undefined, name: `${plan.name} 副本`, enabled: false, homepageVisible: false })}><ClipboardCopy /></button><button className={plan.homepageVisible ? 'admin-link warning' : 'admin-link success'} onClick={() => void runAction(plan.homepageVisible ? '已从官网首页隐藏' : '已在官网首页展示', `/api/admin/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ ...plan, homepageVisible: !plan.homepageVisible }) })}>{plan.homepageVisible ? '首页隐藏' : '首页展示'}</button><button className={plan.enabled ? 'admin-link danger' : 'admin-link success'} onClick={() => void runAction(plan.enabled ? '套餐已下架' : '套餐已上架', `/api/admin/plans/${plan.id}`, { method: 'PUT', body: JSON.stringify({ ...plan, enabled: !plan.enabled }) })}>{plan.enabled ? '下架' : '上架'}</button></div></td>
                </tr>)}
              </AdminTable>
              <Pagination total={filteredPlans.length} page={safePage} pageCount={pageCount} onPage={setPage} />
            </AdminSection>}

            {tab === 'redeem-codes' && <AdminSection title="卡密管理" description="生成固定金额的一次性卡密，用户可充值余额或直接购买套餐。" action={<button className="admin-button primary" onClick={() => setRedeemCodeDialogOpen(true)}><KeyRound /> 生成卡密</button>}>
              <AdminToolbar query={query} onQuery={setQuery} placeholder="搜索卡密、金额、备注或兑换用户" filter={statusFilter} onFilter={setStatusFilter} options={[['all', '全部状态'], ['active', '未兑换'], ['redeemed', '已兑换'], ['disabled', '已停用'], ['expired', '已过期']]} />
              <AdminTable columns={['卡密', '金额', '状态', '备注', '兑换用户', '有效期', '创建时间', '操作']} empty="没有符合条件的卡密">
                {filteredRedeemCodes.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td><strong className="admin-primary-text admin-code">{item.codeMasked}</strong></td>
                  <td className="admin-money">{formatMoney(item.amountCents)}</td><td><StatusBadge status={item.status} /></td><td>{item.note || <span className="admin-muted">-</span>}</td>
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
              <AdminTable columns={['用户与权益', '面板额度', '节点额度', '并发限制', '有效期', '状态', '操作']} empty="没有符合条件的权益">
                {filteredEntitlements.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}>
                  <td>{item.username ? <button type="button" className="admin-record-link stacked" onClick={() => openUserById(item.userId, 'entitlements')}><strong>{item.username}</strong><small>{item.planName}</small></button> : <><strong className="admin-primary-text">-</strong><small className="admin-cell-sub">{item.planName}</small></>}</td>
                  <td>{quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}<small className="admin-cell-sub">已用 {item.panelUsed} / 冻结 {item.panelReserved}</small></td>
                  <td>{quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}<small className="admin-cell-sub">已用 {item.nodeUsed} / 冻结 {item.nodeReserved}</small></td>
                  <td><span>永久有效</span><small className="admin-cell-sub">并发 {item.concurrencyLimit}</small></td>
                  <td>永久有效</td><td><StatusBadge status={entitlementStatus(item)} /></td>
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
                {filteredAudit.slice(pageStart, pageStart + PAGE_SIZE).map(item => <tr key={item.id}><td><strong className="admin-primary-text">{item.adminUsername}</strong></td><td>{auditActionText(item.action)}</td><td><StatusBadge status={item.targetType} /></td><td className="admin-code">{item.targetId ? item.targetId.slice(0, 12) : '-'}</td><td><span className="admin-result-text" title={auditDetail(item.detail)}>{auditDetail(item.detail)}</span></td><td>{formatDate(item.createdAt)}</td></tr>)}
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
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('redeem')}><span className="admin-setting-summary-icon"><KeyRound /></span><span><strong>卡密与第三方系统</strong><small>{settingsData.externalRedeem.enabled ? `${settingsData.externalRedeem.name} 已启用` : settingsData.redeemCodePurchaseUrl.trim() ? '已配置购买链接，仅使用本地卡密' : '仅使用本地卡密'}</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
                        <button type="button" className="admin-settings-summary-row" onClick={() => setSettingsDialog('contact')}><span className="admin-setting-summary-icon"><Headphones /></span><span><strong>客服与咨询</strong><small>{settingsData.contact.methods.length} 种联系方式 · 按钮名称“{settingsData.contact.buttonLabel || '立即咨询'}”</small></span><span className="admin-settings-row-action">设置 <ChevronRight /></span></button>
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

            {tab === 'security' && <AdminSection title="账号安全" description="先查看状态，再按需打开对应弹窗完成敏感设置，避免长表单占满页面。">
              <div className="admin-security-grid admin-security-summary-grid">
                <section className="admin-security-card admin-security-summary-card"><header><span><Users /></span><div><h2>管理员账号</h2><p>修改当前账号的登录用户名。</p></div></header><strong className="admin-security-summary-value">{accountUsername || '未设置'}</strong><small className="admin-security-summary-meta">当前会话不会被中断</small><button type="button" className="admin-button secondary admin-security-summary-action" onClick={() => setSecurityDialog('username')}><Pencil /> 修改用户名</button></section>
                <section className="admin-security-card admin-security-summary-card"><header><span><ExternalLink /></span><div><h2>管理端入口</h2><p>修改后台访问地址后缀。</p></div></header><strong className="admin-security-summary-value">/{adminPathDraft || settingsData.adminPath}</strong><small className="admin-security-summary-meta">保存后将自动跳转到新入口</small><button type="button" className="admin-button secondary admin-security-summary-action" onClick={() => setSecurityDialog('path')}><Pencil /> 修改入口</button></section>
                <section className="admin-security-card admin-security-summary-card"><header><span><ShieldCheck /></span><div><h2>登录密码</h2><p>修改后所有会话立即失效。</p></div></header><strong className="admin-security-summary-value">已设置</strong><small className="admin-security-summary-meta">敏感操作使用独立弹窗确认</small><button type="button" className="admin-button secondary admin-security-summary-action" onClick={() => setSecurityDialog('password')}><ShieldCheck /> 修改密码</button></section>
                <section className="admin-security-card admin-security-summary-card"><header><span><PackagePlus /></span><div><h2>版本与更新</h2><p>检查版本并执行受控升级。</p></div></header><strong className="admin-security-summary-value">v{versionStatus?.currentVersion || '—'}</strong><small className="admin-security-summary-meta">{versionStatus?.updateAvailable ? `发现 v${versionStatus.latestVersion}` : versionStatus?.checkedAt ? '当前已是最新版本' : '尚未检查版本'}</small><button type="button" className="admin-button secondary admin-security-summary-action" onClick={() => setSecurityDialog('update')}><RefreshCw /> 查看更新</button></section>
                <section className="admin-security-card admin-security-summary-card"><header><span><Database /></span><div><h2>完整系统备份</h2><p>备份、校验和迁移集中处理。</p></div></header><strong className="admin-security-summary-value">{databaseFile ? '已选择备份文件' : '尚未选择文件'}</strong><small className="admin-security-summary-meta">{databaseValidation ? '备份校验已通过，可执行迁移' : '不会在页面上直接展开密码表单'}</small><button type="button" className="admin-button secondary admin-security-summary-action" onClick={() => setSecurityDialog('backup')}><Database /> 打开备份工具</button></section>
              </div>
            </AdminSection>}
          </>}
          </div>
        </main>
      </div>

      <AdminDialog open={securityDialog === 'username'} title="修改管理员用户名" description="修改后不会中断当前会话，下次登录可使用新用户名。" cancelLabel="关闭" onClose={() => setSecurityDialog(null)}>
        <form className="admin-form-grid one" onSubmit={async event => { await saveAccountUsername(event); setSecurityDialog(null); }}>
          <label className="admin-field"><span>登录用户名</span><input value={accountUsername} onChange={event => setAccountUsername(event.target.value)} minLength={3} maxLength={64} autoComplete="username" /><small>支持字母、数字以及 . _ @ -</small></label>
          <button type="submit" className="admin-button primary" disabled={busy || accountUsername.trim() === currentUser.username}><Save /> 保存用户名</button>
        </form>
      </AdminDialog>
      <AdminDialog open={securityDialog === 'path'} title="修改管理端入口" description="保存后当前页面会自动跳转到新的管理地址。" cancelLabel="关闭" onClose={() => setSecurityDialog(null)}>
        <form className="admin-form-grid one" onSubmit={async event => { await saveAdminPath(event); setSecurityDialog(null); }}>
          <label className="admin-field"><span>入口后缀</span><div className="admin-path-input"><b>/</b><input value={adminPathDraft} onChange={event => setAdminPathDraft(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} minLength={3} maxLength={40} autoComplete="off" /></div><small>新入口为 /{adminPathDraft || '...'}</small></label>
          <button type="submit" className="admin-button primary" disabled={busy || adminPathDraft === settingsData.adminPath}><Save /> 保存并跳转</button>
        </form>
      </AdminDialog>
      <AdminDialog open={securityDialog === 'password'} title="修改登录密码" description="修改密码后所有已登录会话会立即失效，需要重新登录。" cancelLabel="关闭" onClose={() => setSecurityDialog(null)}>
        <ChangePasswordForm endpoint="/api/admin/auth/change-password" onChanged={onSessionEnded} showToast={showToast} variant="admin" />
      </AdminDialog>
      <AdminDialog open={securityDialog === 'update'} title="版本与更新" description="先检查官方版本，再从弹窗中确认升级，避免把维护操作长期铺在页面上。" cancelLabel="关闭" onClose={() => setSecurityDialog(null)}>
        <div className="admin-update-content">
          <div className="admin-version-summary"><div><small>当前版本</small><strong>v{versionStatus?.currentVersion || '—'}</strong></div><span className={versionStatus?.updateAvailable ? 'available' : ''}>{versionStatus?.updateAvailable ? `发现 v${versionStatus.latestVersion}` : versionStatus?.checkedAt ? '已是最新版本' : '尚未检查'}</span></div>
          <div className="admin-update-manual-note"><AlertTriangle /><span><strong>检查版本不会安装更新。</strong>只有点击“开始更新”并在确认弹窗输入 UPDATE 后，系统才会修改文件和重启服务。</span></div>
          {updateActive && <div className="admin-update-progress" role="status" aria-live="polite">
            <div className="admin-update-progress-heading">
              <div className="admin-update-progress-status"><span className="admin-update-progress-orb"><RefreshCw className="spinning" /></span><div><small>后台更新任务</small><strong>正在更新到 v{versionStatus?.targetVersion || versionStatus?.latestVersion}</strong></div></div>
              <div className="admin-update-progress-percent"><strong>{updateProgress}%</strong><span>实时同步</span></div>
            </div>
            <div className="admin-update-progress-track" aria-label={`更新进度 ${updateProgress}%`}><i style={{ transform: `scaleX(${updateProgress / 100})` }} /></div>
            <div className="admin-update-stage-list" aria-label="更新阶段">
              {UPDATE_STAGE_LABELS.map((item, index) => <span key={item.key} className={index < updateStage ? 'done' : index === updateStage ? 'active' : ''}><i>{index < updateStage ? '✓' : index + 1}</i>{item.label}</span>)}
            </div>
            <div className="admin-update-live"><span /><p>{versionStatus?.message || '更新器正在准备任务'}</p></div>
            <div className="admin-update-progress-meta"><span>{versionStatus?.startedAt ? `开始于 ${formatDate(versionStatus.startedAt)}` : '任务已提交'}</span><span>可关闭弹窗，更新不会中断</span></div>
          </div>}
          {!updateActive && <p className={versionStatus?.state === 'failed' ? 'is-error' : ''}>{versionStatus?.message || versionStatus?.reason || '正在读取版本信息'}</p>}
          <div className="admin-update-actions">
            <button type="button" className="admin-button secondary" disabled={busy || updateActive} onClick={() => void checkSystemUpdate()}><RefreshCw className={busy ? 'spinning' : ''} /> {updateActive ? '更新进行中' : '仅检查最新版本'}</button>
            {versionStatus?.updateAvailable && versionStatus.canAutoUpdate && <button type="button" className="admin-button primary" disabled={busy || updateActive} onClick={() => { setSecurityDialog(null); setUpdateConfirmation(''); setUpdateDialogOpen(true); }}><PackagePlus /> 开始更新到 v{versionStatus.latestVersion}</button>}
            {versionStatus?.updateAvailable && !versionStatus.canAutoUpdate && <a className="admin-button secondary" href={versionStatus.releaseUrl} target="_blank" rel="noreferrer">下载发布包 <ExternalLink /></a>}
          </div>
        </div>
      </AdminDialog>
      <AdminDialog open={securityDialog === 'backup'} size="wide" title="完整系统备份与迁移" description="备份、校验和恢复属于高风险操作，集中在弹窗内完成，主页面只保留状态摘要。" cancelLabel="关闭" onClose={() => setSecurityDialog(null)}>
        <div className="admin-database-actions">
          <label className="admin-field admin-database-backup-password"><span>新备份密码</span><input type="password" value={backupPassword} minLength={12} maxLength={256} autoComplete="new-password" placeholder="至少 12 位，恢复时必需" onChange={event => setBackupPassword(event.target.value)} /><small>密码只用于本次加密，不会保存在服务器或浏览器中。</small></label>
          <button type="button" className="admin-button secondary" disabled={busy || backupPassword.length < 12} onClick={() => void downloadDatabaseBackup()}><Download /> 创建并下载完整备份</button>
          <label className={`admin-database-file ${busy ? 'disabled' : ''}`}>
            <span className="admin-database-file-trigger"><Upload /><strong>选择上传</strong></span>
            <span className="admin-database-file-copy"><strong>{databaseFile?.name || '.xuibak 完整备份'}</strong><small>{databaseFile ? `${Math.max(1, Math.round(databaseFile.size / 1024))} KB` : '最大 96MB，支持迁移到使用不同密钥的新服务器'}</small></span>
            <input type="file" accept=".xuibak,application/vnd.xui-portable-backup" disabled={busy} aria-label="选择 .xuibak 完整备份" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; selectDatabaseFile(file); }} />
          </label>
          <label className="admin-field admin-database-restore-password"><span>备份密码</span><input type="password" value={restorePassword} minLength={12} maxLength={256} autoComplete="current-password" placeholder="输入创建备份时的密码" onChange={event => { setRestorePassword(event.target.value); setDatabaseValidation(null); }} /></label>
          <button type="button" className="admin-button secondary" disabled={busy || !databaseFile || restorePassword.length < 12} onClick={() => void validateDatabaseFile()}><ShieldCheck /> 解密并校验备份</button>
        </div>
        {databaseValidation && <div className="admin-database-validation"><CheckCircle2 /><div><strong>完整备份校验通过</strong><span>源版本 {databaseValidation.appVersion} · 创建于 {formatDate(databaseValidation.createdAt)} · 用户 {databaseValidation.counts.users || 0} · 订单 {databaseValidation.counts.orders || 0} · 权益 {databaseValidation.counts.entitlements || 0}</span></div><button type="button" className="admin-button danger" disabled={busy} onClick={() => { setRestoreConfirmation(''); setRestoreDialogOpen(true); }}><ArchiveRestore /> 恢复并迁移</button></div>}
        <p className="admin-database-note"><AlertTriangle /> 备份使用 scrypt 与 AES-256-GCM 加密；换服务器时只需上传此文件并输入密码。恢复前会自动保留当前数据库，恢复后全部账号需重新登录。</p>
      </AdminDialog>

      <PlanDialog plan={editingPlan} busy={busy} onChange={setEditingPlan} onClose={() => setEditingPlan(null)} onSave={() => void savePlan()} />
      <AdminDialog open={commandOpen} title="快速导航" description="搜索管理模块或设置项，也可以使用快捷键 K 打开。" cancelLabel="关闭" onClose={() => { setCommandOpen(false); setCommandQuery(''); }}>
        <div className="admin-command-palette">
          <label className="admin-command-search"><Search /><input value={commandQuery} onChange={event => setCommandQuery(event.target.value)} autoComplete="off" placeholder="搜索订单、客户、资源、支付或安全设置" /></label>
          <div className="admin-command-results">
            {filteredCommands.map(item => <button type="button" key={item.id} onClick={() => runCommand(item)}><span><strong>{item.label}</strong><small>{item.description}</small></span><kbd>打开</kbd></button>)}
            {!filteredCommands.length && <div className="admin-command-empty"><Search /><strong>没有匹配的功能</strong><span>尝试输入“客户”“支付”或“备份”</span></div>}
          </div>
        </div>
      </AdminDialog>
      <AdminDialog open={redeemCodeDialogOpen} title="生成金额卡密" description="每张卡密只能兑换一次，金额可充值到账户余额，也可在购买套餐时直接抵扣。" confirmLabel="生成卡密" tone="success" busy={busy} confirmDisabled={redeemCodeDraft.amountCents < 1 || redeemCodeDraft.quantity < 1 || redeemCodeDraft.quantity > 100} onClose={() => setRedeemCodeDialogOpen(false)} onConfirm={() => void createRedeemCodes()}>
        <div className="admin-form-grid">
          <label className="admin-field"><span>卡密金额（元）</span><NumberInput min="0.01" step="0.01" value={redeemCodeDraft.amountCents / 100} onValueChange={value => setRedeemCodeDraft({ ...redeemCodeDraft, amountCents: Math.round(value * 100) })} /><small>用户可充值余额或直接抵扣套餐金额。</small></label>
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
      <AdminDialog open={settingsDialog === 'redeem'} size="wide" title="设置卡密与第三方系统" description="本地卡密优先匹配；本地不存在时，系统才会调用已启用的第三方核销接口。确认后仍需点击“保存更改”生效。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
        <div className="admin-form-grid">
          <label className="admin-field span-2"><span>卡密购买链接</span><input type="url" value={settingsData.redeemCodePurchaseUrl} maxLength={1000} onChange={event => setSettingsData({ ...settingsData, redeemCodePurchaseUrl: event.target.value })} placeholder="https://example.com/buy" /><small>留空则不显示购买按钮，仅支持 HTTP 或 HTTPS。</small></label>
          <div className="admin-field span-2"><SettingSwitch label="启用第三方卡密核销" description="用户提交非本地卡密时，服务端调用下面的标准 JSON 接口进行一次性核销。" checked={settingsData.externalRedeem.enabled} onChange={enabled => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, enabled } })} /></div>
          <label className="admin-field"><span>接口类型</span><select value={settingsData.externalRedeem.provider} onChange={event => { const provider = event.target.value as 'generic_json' | 'shiyeka'; setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, provider, name: provider === 'shiyeka' ? '十夜卡密' : '第三方卡密', apiKey: '', apiKeyConfigured: false } }); }}><option value="shiyeka">十夜卡密（原生适配）</option><option value="generic_json">通用 JSON 接口</option></select></label>
          <label className="admin-field"><span>系统名称</span><input value={settingsData.externalRedeem.name} maxLength={40} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, name: event.target.value } })} placeholder="第三方卡密" /></label>
          {settingsData.externalRedeem.provider === 'generic_json' && <label className="admin-field"><span>鉴权方式</span><select value={settingsData.externalRedeem.authMode} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, authMode: event.target.value as typeof settingsData.externalRedeem.authMode } })}><option value="bearer">Authorization: Bearer</option><option value="x-api-key">X-API-Key</option><option value="none">无需鉴权</option></select></label>}
          <label className="admin-field span-2"><span>{settingsData.externalRedeem.provider === 'shiyeka' ? '十夜卡密服务地址' : '核销接口地址'}</span><input type="url" value={settingsData.externalRedeem.apiUrl} maxLength={1000} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, apiUrl: event.target.value } })} placeholder={settingsData.externalRedeem.provider === 'shiyeka' ? 'http://服务器IP:1111 或 https://卡密域名' : 'https://cards.example.com/api/redeem'} /><small>{settingsData.externalRedeem.provider === 'shiyeka' ? '填写站点根地址，系统会自动调用 /api/v1/card/activate 和 /query。' : '服务端以 POST JSON 调用；重定向响应会被拒绝。'}</small></label>
          {settingsData.externalRedeem.provider === 'shiyeka' && <label className="admin-field span-2"><span>App Key</span><input value={settingsData.externalRedeem.appKey || ''} maxLength={200} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, appKey: event.target.value } })} placeholder="在十夜卡密后台的项目管理中获取" /><small>对应十夜卡密项目的 app_key。</small></label>}
          {(settingsData.externalRedeem.provider === 'shiyeka' || settingsData.externalRedeem.authMode !== 'none') && <label className="admin-field span-2"><span>{settingsData.externalRedeem.provider === 'shiyeka' ? 'App Secret' : 'API 密钥'}</span><input type="password" value={settingsData.externalRedeem.apiKey || ''} maxLength={500} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, apiKey: event.target.value } })} placeholder={settingsData.externalRedeem.apiKeyConfigured ? '已配置，留空保持不变' : settingsData.externalRedeem.provider === 'shiyeka' ? '填写十夜卡密项目的 app_secret' : '填写第三方系统提供的 API 密钥'} /><small>密钥加密保存，保存后不会回传明文。</small></label>}
          {settingsData.externalRedeem.provider === 'generic_json' && <label className="admin-field"><span>amount 金额单位</span><select value={settingsData.externalRedeem.amountUnit} onChange={event => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, amountUnit: event.target.value as 'cents' | 'yuan' } })}><option value="cents">分</option><option value="yuan">元</option></select><small>若响应直接返回 amountCents，则始终按分处理。</small></label>}
          <label className="admin-field"><span>接口超时（秒）</span><NumberInput min="3" max="30" value={settingsData.externalRedeem.timeoutSeconds} onValueChange={timeoutSeconds => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, timeoutSeconds } })} /></label>
          <div className="admin-field span-2"><SettingSwitch label="允许访问内网接口" description="仅当卡密系统部署在同一内网时开启；默认阻止环回、私网和链路本地地址。" checked={settingsData.externalRedeem.allowPrivateNetwork} onChange={allowPrivateNetwork => setSettingsData({ ...settingsData, externalRedeem: { ...settingsData.externalRedeem, allowPrivateNetwork } })} /></div>
          <div className="admin-field span-2"><small>{settingsData.externalRedeem.provider === 'shiyeka' ? <>仅接受十夜卡密中的“金额卡”；请求使用其文档规定的 HMAC-SHA256 签名，成功激活后按返回的 <code>data.amount</code> 充值。</> : <>请求：<code>{'{ code, requestId, userId, username, planId }'}</code>；成功响应：<code>{'{ success: true, amountCents, tradeNo }'}</code>。也支持字段放在 <code>data</code> 中，或按上方单位返回 <code>amount</code>。</>}</small></div>
        </div>
      </AdminDialog>
      <AdminDialog open={settingsDialog === 'contact'} size="wide" title="客服与咨询设置" description="统一管理悬浮按钮文案、咨询说明和各联系方式对应的账号、链接与二维码。" confirmLabel="完成编辑" cancelLabel="关闭" onClose={() => setSettingsDialog(null)} onConfirm={() => setSettingsDialog(null)}>
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
              <div><strong>二维码图片</strong><small>{editingContactMethod.index >= 0 && savedContactMethodIds.includes(editingContactMethod.method.id) ? '支持 PNG、JPEG 或 WebP，图片不能超过 1MB；本地上传优先于图片地址。' : '选择图片后会自动保存当前联系方式并上传，图片不能超过 1MB。'}</small></div>
            </div>
            <div className="admin-resource-logo-actions">
              <label
                className={`admin-button secondary ${busy ? 'disabled' : ''}`}
                aria-disabled={busy}
                title={editingContactMethod.index >= 0 && savedContactMethodIds.includes(editingContactMethod.method.id) ? '上传二维码' : '选择图片并自动保存联系方式'}
              >
                <Upload /> {editingContactMethod.index >= 0 && savedContactMethodIds.includes(editingContactMethod.method.id) ? '上传二维码' : '上传并保存'}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void uploadContactQr(editingContactMethod.index, editingContactMethod.method, file); }} />
              </label>
              {editingContactMethod.method.qrCodeUploaded && <button type="button" className="admin-button danger" disabled={busy} onClick={() => void deleteContactQr(editingContactMethod.index, editingContactMethod.method)}><Trash2 /> 删除二维码</button>}
            </div>
          </div>
        </>}
      </AdminDialog>
      <AdminDialog open={Boolean(deletingContactMethod)} title="删除联系方式" description={`将从设置草稿中删除“${deletingContactMethod?.method.name || '未命名联系方式'}”。已上传的二维码会保留，使用相同标识重新添加后仍可显示。`} confirmLabel="确认删除" tone="danger" busy={busy} onClose={returnToContactSettings} onConfirm={() => { if (deletingContactMethod) removeContactMethod(deletingContactMethod.index); returnToContactSettings(); }} />
      <AdminDialog open={Boolean(cancelOrder)} title="取消待付款订单" description={`订单 ${cancelOrder?.orderNo || ''} 将变为已取消，之后不能继续支付。`} confirmLabel="确认取消订单" tone="danger" busy={busy} onClose={() => setCancelOrder(null)} onConfirm={() => cancelOrder && void runAction('订单已取消', `/api/admin/orders/${cancelOrder.id}/cancel`, { method: 'POST' }, () => setCancelOrder(null))} />
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
            {orderDetail.order.status === 'pending' && <button className="admin-button danger" onClick={() => { setViewOrder(null); setOrderDetail(null); setCancelOrder(orderDetail.order); }}>取消订单</button>}
            {orderDetail.order.status === 'paid' && !['redeem_code', 'external_redeem', 'balance'].includes(orderDetail.order.paymentProvider) && <button className="admin-button warning" onClick={() => { setViewOrder(null); setOrderDetail(null); setRefundOrder(orderDetail.order); setRefundTradeNo(''); setRefundReason(''); }}>登记外部退款</button>}
            {orderDetail.diagnosis.canRepairEntitlement && <button className="admin-button danger" onClick={() => { setViewOrder(null); setOrderDetail(null); setRepairOrder(orderDetail.order); }}><Wrench /> 补发缺失权益</button>}
          </div>
          <DetailBlock title="支付与时间">
            <div className="admin-detail-grid"><DetailItem label="支付渠道" value={paymentProviderName(orderDetail.order.paymentProvider || '-')} /><DetailItem label="支付子渠道" value={orderDetail.order.paymentChannel || '-'} /><DetailItem label="交易号" value={orderDetail.order.paymentTradeNo || '未支付'} mono /><DetailItem label="创建时间" value={formatDate(orderDetail.order.createdAt)} /><DetailItem label="到期时间" value={orderDetail.order.expiresAt ? formatDate(orderDetail.order.expiresAt) : '-'} /><DetailItem label="付款时间" value={orderDetail.order.paidAt ? formatDate(orderDetail.order.paidAt) : '未付款'} />{orderDetail.order.cancelledAt && <DetailItem label="取消时间" value={formatDate(orderDetail.order.cancelledAt)} />}{orderDetail.order.refundedAt && <DetailItem label="退款时间" value={formatDate(orderDetail.order.refundedAt)} />}{orderDetail.order.refundTradeNo && <DetailItem label="退款凭证" value={orderDetail.order.refundTradeNo} mono />}{(orderDetail.order.cancelReason || orderDetail.order.refundReason) && <DetailItem label="处理原因" value={orderDetail.order.refundReason || orderDetail.order.cancelReason || '-'} />}</div>
          </DetailBlock>
            {orderDetail.redeemCode && <DetailBlock title="金额卡密来源"><div className="admin-detail-grid"><DetailItem label="卡密" value={orderDetail.redeemCode.codeMasked} mono /><DetailItem label="卡密金额" value={formatMoney(orderDetail.redeemCode.amountCents)} /><DetailItem label="兑换用途" value={orderDetail.redeemCode.redemptionKind === 'purchase' ? '直接购买套餐' : '充值账户余额'} /><DetailItem label="兑换时间" value={formatDate(orderDetail.redeemCode.redeemedAt)} /><DetailItem label="卡密备注" value={orderDetail.redeemCode.note || '-'} /></div></DetailBlock>}
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
      <AdminDialog open={restoreDialogOpen} title="恢复完整系统备份" description="此操作会迁移已校验的业务数据与加密配置，并立即清除全部登录会话。" confirmLabel="确认恢复系统" tone="danger" busy={busy} confirmDisabled={!databaseValidation || restoreConfirmation !== 'RESTORE'} onClose={() => { setRestoreDialogOpen(false); setRestoreConfirmation(''); }} onConfirm={() => void restoreDatabase()}>
        <div className="admin-restore-confirmation">
          <div><AlertTriangle /><p><strong>恢复后当前页面会退出登录。</strong><span>系统会先保存恢复前数据库，再将备份中的敏感配置重新加密为当前服务器密钥后导入。</span></p></div>
          <label className="admin-field"><span>输入 RESTORE 确认</span><input value={restoreConfirmation} onChange={event => setRestoreConfirmation(event.target.value.toUpperCase())} autoComplete="off" placeholder="RESTORE" /></label>
        </div>
      </AdminDialog>
      <AdminDialog open={updateDialogOpen} className="admin-update-confirm-dialog" title="确认安装系统更新" description={`手动更新到 v${versionStatus?.latestVersion || '—'}，需要你最后确认后才会开始。`} confirmLabel="开始安装更新" cancelLabel="稍后处理" tone="danger" busy={busy} confirmDisabled={updateConfirmation !== 'UPDATE'} onClose={() => { setUpdateDialogOpen(false); setUpdateConfirmation(''); }} onConfirm={() => void startSystemUpdate()}>
        <div className="admin-update-confirmation">
          <div className="admin-update-confirmation-intro">
            <span className="admin-update-confirmation-icon"><AlertTriangle /></span>
            <div><span className="admin-update-confirmation-eyebrow">需要人工确认</span><strong>更新期间服务会短暂重启</strong><p>更新器会先备份当前程序，再下载并校验官方版本；完成健康检查后页面会自动刷新。</p></div>
          </div>
          <div className="admin-update-confirmation-checklist" aria-label="更新说明">
            <div><CheckCircle2 /><span>保留业务数据与环境配置</span></div>
            <div><CheckCircle2 /><span>校验 SHA256，失败自动回滚</span></div>
            <div><AlertTriangle /><span>请勿关闭服务器、终止 PM2 或删除应用目录</span></div>
          </div>
          <label className="admin-field admin-update-confirmation-input"><span>最后一步：输入 <code>UPDATE</code> 才能开始</span><input value={updateConfirmation} onChange={event => setUpdateConfirmation(event.target.value.toUpperCase())} autoComplete="off" placeholder="输入 UPDATE" /><small>这是手动更新，不会因“检查版本”自动执行。</small></label>
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

          {userProfileTab === 'entitlements' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>客户权益</h3><p>查看永久有效权益的剩余次数和使用限制。</p></div><button type="button" className="admin-button primary" onClick={() => { setGrant(value => ({ ...value, userId: userDetail.user.id })); setUserDetail(null); setGrantOpen(true); }}><BadgeCheck /> 发放权益</button></div><div className="admin-profile-records">{userDetail.entitlements.map(item => <article key={item.id}><div><strong>{item.planName}</strong><small>{item.lifetime ? '永久有效' : `有效期至 ${formatDate(item.expiresAt)}`} · 创建于 {formatDate(item.createdAt)}</small><p>面板 {quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}，已用 {item.panelUsed}，冻结 {item.panelReserved} · 节点 {quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}，已用 {item.nodeUsed}，冻结 {item.nodeReserved}</p></div><div><StatusBadge status={entitlementStatus(item)} /><button type="button" className="admin-link" onClick={() => { setUserDetail(null); setEditingEntitlement({ ...item }); }}>调整额度</button></div></article>)}{!userDetail.entitlements.length && <EmptyInline text="该客户暂无权益" />}</div></div>}

          {userProfileTab === 'orders' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>客户订单</h3><p>订单、金额和处理状态集中展示。</p></div></div><div className="admin-profile-records">{userDetail.orders.map(order => <button type="button" key={order.id} onClick={() => { setUserDetail(null); void openOrderDetail(order); }}><div><strong>{order.orderNo}</strong><small>{planSnapshotName(order)} · {formatDate(order.createdAt)}</small><p>{order.paymentTradeNo ? `交易号 ${order.paymentTradeNo}` : '尚未记录支付交易号'}</p></div><div><b>{formatMoney(order.amountCents)}</b><StatusBadge status={order.status} /><ChevronRight /></div></button>)}{!userDetail.orders.length && <EmptyInline text="该客户暂无订单" />}</div></div>}

          {userProfileTab === 'deployments' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>搭建任务</h3><p>查看面板安装与节点创建的执行结果。</p></div></div><div className="admin-profile-records">{userDetail.deployments.map(item => <button type="button" key={item.id} onClick={() => { setUserDetail(null); setViewDeployment(item); }}><div><strong>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.requestId}</strong><small>{item.targetHostMasked || '未记录目标'} · {formatDate(item.createdAt)}</small><p>{item.resultSummary || item.errorMessage || '暂无执行结果'}</p></div><div><StatusBadge status={item.status} /><ChevronRight /></div></button>)}{!userDetail.deployments.length && <EmptyInline text="该客户暂无搭建任务" />}</div></div>}

          {userProfileTab === 'ledger' && <div className="admin-profile-content"><div className="admin-profile-section-head"><div><h3>额度流水</h3><p>发放、冻结、核销、返还和人工调整记录。</p></div></div><div className="admin-profile-records">{userProfileLedger.map(item => <article key={item.id}><div><strong>{item.planName}</strong><small>{item.capability === 'panel' ? '面板额度' : '节点额度'} · {formatDate(item.createdAt)}</small><p>{item.note || '无备注'}{item.deploymentId ? ` · 关联任务 ${item.deploymentId.slice(0, 8)}` : ''}</p></div><div><StatusBadge status={item.action} /><b className={item.amount > 0 ? 'admin-number-positive' : item.amount < 0 ? 'admin-number-negative' : ''}>{item.amount > 0 ? `+${item.amount}` : item.amount}</b></div></article>)}{!userProfileLedger.length && <EmptyInline text="该客户暂无额度流水" />}</div></div>}
        </div>}
      </AdminDialog>
    </div>
  );
};

