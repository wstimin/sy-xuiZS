import React, { useState, useEffect } from 'react';
import { ViewMode, PanelResult, NodeResult, ToastMessage, HistoryItem, PanelFlavor } from './types';
import { copyToClipboard } from './utils/clipboard';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { PanelDeployView } from './components/PanelDeployView';
import { NodeDeployView } from './components/NodeDeployView';
import { ProtocolMatrixGuideModal } from './components/ProtocolMatrixGuideModal';
import { SetupGuideModal } from './components/SetupGuideModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { Toast } from './components/Toast';
import { AccountData, activeCapability, api, CurrentUser, Plan, ResourceRecommendationSettings } from './commercial';
import { PricingView } from './components/PricingView';
import { AccountView } from './components/AccountView';
import { ContactButton } from './components/ContactButton';
import { ResourceRecommendationsView } from './components/ResourceRecommendationsView';
import { CustomerNoticeDialog } from './components/CustomerNoticeDialog';

const LOCAL_HISTORY_PREFIX = '3xui_deploy_history:v2:';

const localHistoryKey = (userId: string) => `${LOCAL_HISTORY_PREFIX}${userId}`;

const readLocalHistory = (userId: string): HistoryItem[] => {
  try {
    const raw = localStorage.getItem(localHistoryKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; userId?: string; items?: unknown };
    if (parsed.version !== 2 || parsed.userId !== userId || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter((item): item is HistoryItem => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<HistoryItem>;
      return typeof candidate.id === 'string'
        && (candidate.type === 'panel' || candidate.type === 'node')
        && Boolean(candidate.type === 'panel' ? candidate.panelData : candidate.nodeData);
    }).slice(0, 30);
  } catch {
    return [];
  }
};

const writeLocalHistory = (userId: string, items: HistoryItem[]) => {
  try {
    const localItems = items.filter(item => item.type === 'panel' ? Boolean(item.panelData) : Boolean(item.nodeData)).slice(0, 30);
    localStorage.setItem(localHistoryKey(userId), JSON.stringify({ version: 2, userId, items: localItems }));
    return true;
  } catch {
    return false;
  }
};

const mergeHistory = (serverItems: HistoryItem[], localItems: HistoryItem[]): HistoryItem[] => {
  const localById = new Map(localItems.map(item => [item.id, item]));
  return serverItems.map(item => {
    const local = localById.get(item.id);
    if (!local || local.type !== item.type) return { ...item, hasDetails: false };
    if (item.type === 'panel' && local.panelData) return { ...item, hasDetails: true, panelData: local.panelData };
    if (item.type === 'node' && local.nodeData) return { ...item, hasDetails: true, nodeData: local.nodeData };
    return { ...item, hasDetails: false };
  });
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('home');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState<boolean>(false);
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [quotaRequired, setQuotaRequired] = useState<'panel' | 'node' | null>(null);
  const [purchaseNotice, setPurchaseNotice] = useState<{ title: string; description: string } | null>(null);
  const [recommendations, setRecommendations] = useState<ResourceRecommendationSettings>({ serverEnabled: true, residentialIpEnabled: true, items: [] });

  // Pre-filled panel login credentials for node deployment
  const [prefilledPanel, setPrefilledPanel] = useState<{
    host: string;
    port: string;
    path: string;
    protocol?: 'http' | 'https';
    username: string;
    password?: string;
    apiToken?: string;
    panelFlavor?: PanelFlavor;
    webCertFile?: string;
    webKeyFile?: string;
  } | null>(null);

  // The legacy key was shared by every account in the browser. Remove it instead
  // of migrating secrets across users; v2 records are namespaced by user id.
  useEffect(() => {
    try {
      localStorage.removeItem('3xui_deploy_history');
    } catch {
      // ignore
    }
  }, []);

  const refreshPlans = async () => {
    const result = await api<{ plans: Plan[] }>('/api/plans');
    setPlans(result.plans);
  };

  const refreshAccount = async () => {
    if (!user) return null;
    setAccountLoading(true);
    try {
      const result = await api<AccountData>('/api/account');
      setAccount({
        ...result,
        entitlements: Array.isArray(result.entitlements) ? result.entitlements : [],
        orders: Array.isArray(result.orders) ? result.orders : [],
        deployments: Array.isArray(result.deployments) ? result.deployments : [],
        paymentMethods: Array.isArray(result.paymentMethods) ? result.paymentMethods : [],
      });
      return result;
    } finally {
      setAccountLoading(false);
    }
  };

  const refreshHistory = async (owner = user) => {
    if (!owner) return;
    const result = await api<{ items: HistoryItem[] }>('/api/deployment-history');
    setHistoryItems(mergeHistory(result.items, readLocalHistory(owner.id)));
  };

  const hasAvailableCapability = async (capability: 'panel' | 'node') => {
    try {
      const latestAccount = await refreshAccount();
      return Boolean(latestAccount && activeCapability(Array.isArray(latestAccount.entitlements) ? latestAccount.entitlements : [], capability).length);
    } catch {
      // Let the deployment endpoint perform the authoritative check if account refresh is temporarily unavailable.
      return true;
    }
  };

  const showPurchaseSuccess = (title = '套餐购买成功', description = '套餐权益已经自动发放到账户，现在可以继续搭建。') => {
    setPurchaseNotice({ title, description });
  };

  useEffect(() => {
    Promise.all([
      api<{ user: CurrentUser | null }>('/api/auth/me'),
      api<{ plans: Plan[] }>('/api/plans'),
    ]).then(([me, planResult]) => {
      setUser(me.user);
      setPlans(planResult.plans);
    }).catch(() => setUser(null)).finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (user) {
      void refreshAccount();
      void refreshHistory(user).catch(() => setHistoryItems([]));
      void api<{ recommendations: ResourceRecommendationSettings }>('/api/resource-recommendations')
        .then(result => setRecommendations(result.recommendations))
        .catch(() => setRecommendations({ serverEnabled: true, residentialIpEnabled: true, items: [] }));
    } else {
      setAccount(null);
      setHistoryItems([]);
      setPrefilledPanel(null);
      setRecommendations({ serverEnabled: true, residentialIpEnabled: true, items: [] });
    }
  }, [user?.id]);

  const showResources = recommendations.items.some(item => item.enabled && (
    (item.category === 'server' && recommendations.serverEnabled)
    || (item.category === 'residential_ip' && recommendations.residentialIpEnabled)
  ));

  useEffect(() => {
    if (currentView === 'resources' && !showResources) setCurrentView('home');
  }, [currentView, showResources]);

  useEffect(() => {
    if (!user) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get('payment') !== 'return') return;
    const orderId = query.get('order');
    if (!orderId) return;
    let stopped = false;
    let attempts = 0;
    const checkPayment = async () => {
      try {
        const result = await api<{ order: { status: string; planSnapshot?: string } }>(`/api/orders/${encodeURIComponent(orderId)}/status`);
        if (stopped) return;
        if (result.order.status === 'paid') {
          await refreshAccount();
          setCurrentView('account');
          let walletTopup = false;
          try { walletTopup = JSON.parse(result.order.planSnapshot || '{}').kind === 'wallet_topup'; } catch { /* Ignore malformed legacy snapshots. */ }
          showPurchaseSuccess(walletTopup ? '余额充值成功' : undefined, walletTopup ? '充值金额已到账，可以继续购买永久次数套餐。' : undefined);
          window.history.replaceState({}, '', '/console');
          return;
        }
        if (result.order.status !== 'pending') {
          setCurrentView('account');
          showToast('订单未完成', '请在账户订单中查看当前状态', 'warning');
          window.history.replaceState({}, '', '/console');
          return;
        }
        attempts += 1;
        if (attempts < 8) window.setTimeout(checkPayment, 2000);
        else {
          setCurrentView('account');
          showToast('正在等待支付结果', '到账后系统会自动发放权益，可在订单记录中刷新查看', 'info');
          window.history.replaceState({}, '', '/console');
        }
      } catch {
        setCurrentView('account');
        window.history.replaceState({}, '', '/console');
      }
    };
    void checkPayment();
    return () => { stopped = true; };
  }, [user?.id]);

  const saveHistoryInMemory = (newItem: HistoryItem) => {
    setHistoryItems(prev => {
      const next = [newItem, ...prev.filter(item => item.id !== newItem.id)].slice(0, 30);
      if (user && !writeLocalHistory(user.id, next)) {
        window.setTimeout(() => showToast('本地保存失败', '浏览器可能禁用了本地存储，请及时复制并另行保管搭建信息', 'warning'));
      }
      return next;
    });
  };

  const showToast = (
    title: string,
    message?: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info'
  ) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleDismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleClearHistory = async () => {
    try {
      await api<{ success: true; cleared: number }>('/api/deployment-history', { method: 'DELETE' });
      if (user) localStorage.removeItem(localHistoryKey(user.id));
      setHistoryItems([]);
      showToast('历史记录已清空', '此浏览器中的敏感详情和服务器上的脱敏摘要均已清除', 'info');
    } catch (error) {
      showToast('清空失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    }
  };

  const handlePanelCreated = (result: PanelResult) => {
    const historyItem: HistoryItem = {
      id: result.id,
      timestamp: result.createdAt,
      type: 'panel',
      title: `xui面板 (${result.host}:${result.port})`,
      summary: result.accessUrl,
      hasDetails: true,
      panelData: { ...result }
    };
    saveHistoryInMemory(historyItem);
    void refreshAccount();
  };

  const handleNodeCreated = (result: NodeResult) => {
    const historyItem: HistoryItem = {
      id: result.id,
      timestamp: result.createdAt,
      type: 'node',
      title: `${result.nodeName} (${result.protocol} + ${result.transport})`,
      summary: `${result.protocol} + ${result.transport} · 入站 #${result.inboundId}`,
      hasDetails: true,
      nodeData: { ...result }
    };
    saveHistoryInMemory(historyItem);
    void refreshAccount();
  };

  const handleGoToNodeWithPanel = (result: PanelResult) => {
    setPrefilledPanel({
      host: result.host,
      port: result.port,
      path: result.path,
      protocol: result.protocol,
      username: result.username,
      password: result.password || '',
      apiToken: result.apiToken || '',
      panelFlavor: result.panelFlavor || 'official',
      webCertFile: result.webCertFile,
      webKeyFile: result.webKeyFile
    });
    setCurrentView('node');
    showToast(
      '已载入面板凭据',
      result.apiToken
        ? `账号、密码和 API Token 已自动填写，准备为 ${result.host}:${result.port} 搭建节点`
        : `账号和密码已自动填写，准备为 ${result.host}:${result.port} 搭建节点`,
      'success'
    );
  };

  if (authLoading) return <div className="min-h-screen bg-[#0a0a0c] text-zinc-400 flex items-center justify-center">正在加载账户...</div>;
  if (!user) {
    window.location.replace('/login');
    return <div className="min-h-screen bg-[#0a0a0c] text-zinc-400 flex items-center justify-center">正在前往登录页...</div>;
  }

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setHistoryItems([]);
    setPrefilledPanel(null);
    setUser(null);
    setCurrentView('home');
    window.location.assign('/');
  };

  return (
    <div className="console-shell min-h-screen bg-[#0a0a0c] text-slate-200 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
      {/* Background Glow Overlay */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[160px]" />
      </div>

      {/* Main Header Bar */}
      <Header
        currentView={currentView}
        onSelectView={setCurrentView}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenSetupGuide={() => setSetupGuideOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        historyCount={historyItems.length}
        user={user}
        onLogout={() => void logout()}
        showResources={showResources}
      />

      {/* Main Body View Switching */}
      <main className="flex-1 relative z-10">
        {currentView === 'home' && (
          <HomeView
            onSelectView={setCurrentView}
            onOpenGuide={() => setGuideOpen(true)}
            onOpenSetupGuide={() => setSetupGuideOpen(true)}
          />
        )}

        {currentView === 'resources' && <ResourceRecommendationsView recommendations={recommendations} />}

        {currentView === 'panel' && (
          <PanelDeployView
            onPanelCreated={handlePanelCreated}
            onGoToNodeWithPanel={handleGoToNodeWithPanel}
            showToast={showToast}
            entitlements={account?.entitlements}
            onCheckCapability={() => hasAvailableCapability('panel')}
            onQuotaRequired={() => setQuotaRequired('panel')}
            onOpenResources={showResources ? () => setCurrentView('resources') : undefined}
          />
        )}

        {currentView === 'node' && (
          <NodeDeployView
            initialPanelData={prefilledPanel}
            onNodeCreated={handleNodeCreated}
            showToast={showToast}
            entitlements={account?.entitlements}
            onCheckCapability={() => hasAvailableCapability('node')}
            onQuotaRequired={() => setQuotaRequired('node')}
            onOpenResources={showResources ? () => setCurrentView('resources') : undefined}
          />
        )}

        {currentView === 'pricing' && <PricingView plans={plans} onOrderCreated={refreshAccount} onPurchaseSuccess={showPurchaseSuccess} showToast={showToast} />}
        {currentView === 'account' && <AccountView account={account} loading={accountLoading} onRefresh={refreshAccount} onPurchaseSuccess={showPurchaseSuccess} onLoggedOut={() => { setUser(null); window.location.assign('/'); }} onLogout={() => void logout()} showToast={showToast} />}
      </main>

      {/* Footer */}
      <footer className="console-footer border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500 relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">xui面板一键搭建助手</span>
            <span>&bull;</span>
            <span>专注面板极速部署与 SOCKS 链式节点构建</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <button
              onClick={() => setSetupGuideOpen(true)}
              className="hover:text-indigo-400 transition-colors font-medium text-indigo-300"
            >
              搭建使用指南
            </button>
            <button
              onClick={() => setGuideOpen(true)}
              className="hover:text-cyan-400 transition-colors"
            >
              协议矩阵速查
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="hover:text-indigo-400 transition-colors"
            >
              历史配置 ({historyItems.length})
            </button>
          </div>
        </div>
      </footer>

      <ContactButton />

      <CustomerNoticeDialog
        open={Boolean(quotaRequired)}
        tone="warning"
        title="套餐额度不足"
        description={`当前没有可用的${quotaRequired === 'node' ? '节点搭建' : '面板搭建'}次数，请先购买套餐后再继续。`}
        confirmLabel="购买套餐"
        cancelLabel="暂不购买"
        onClose={() => setQuotaRequired(null)}
        onConfirm={() => { setQuotaRequired(null); setCurrentView('pricing'); }}
      />

      <CustomerNoticeDialog
        open={Boolean(purchaseNotice)}
        tone="success"
        title={purchaseNotice?.title || '套餐购买成功'}
        description={purchaseNotice?.description || '套餐权益已经自动发放到账户，现在可以继续搭建。'}
        confirmLabel="知道了"
        onClose={() => setPurchaseNotice(null)}
        onConfirm={() => setPurchaseNotice(null)}
      />

      {/* Modals & Overlays */}
      <SetupGuideModal
        isOpen={setupGuideOpen}
        onClose={() => setSetupGuideOpen(false)}
        onSelectView={view => setCurrentView(view)}
      />

      <ProtocolMatrixGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />

      <HistoryDrawer
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={historyItems}
        onClearHistory={handleClearHistory}
        onCopyText={async (text, title) => {
          const success = await copyToClipboard(text);
          if (success) {
            showToast('已复制到剪贴板', title, 'success');
          } else {
            showToast('复制失败', '请手动选中文本进行复制', 'error');
          }
        }}
        onSelectPanelToNode={data => {
          setPrefilledPanel({
            host: data.host,
            port: data.port,
            path: data.path,
            protocol: data.protocol,
            username: data.username,
            password: data.password || '',
            apiToken: data.apiToken || '',
            panelFlavor: data.panelFlavor || 'official',
            webCertFile: data.webCertFile,
            webKeyFile: data.webKeyFile
          });
          setCurrentView('node');
          showToast(
            '已载入面板凭证',
            data.apiToken
              ? '面板地址、账号、密码、Token 和证书路径已自动回填'
              : '面板地址、账号和密码已自动回填',
            'success'
          );
        }}
      />

      <Toast toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}
