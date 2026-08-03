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
import { AccountData, api, CurrentUser, Plan } from './commercial';
import { PricingView } from './components/PricingView';
import { AccountView } from './components/AccountView';

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

  const normalizeHistoryItem = (item: HistoryItem): HistoryItem => {
    if (item.type === 'panel' && item.panelData) {
      return {
        id: item.id,
        timestamp: item.timestamp,
        type: 'panel',
        title: item.title,
        summary: item.summary
      };
    }
    return {
      id: item.id,
      timestamp: item.timestamp,
      type: 'node',
      title: item.title,
      summary: item.nodeData
        ? `${item.nodeData.protocol} + ${item.nodeData.transport} · 入站 #${item.nodeData.inboundId}`
        : item.summary.replace(/(?:vless|vmess|trojan|ss):\/\/\S+/gi, '[敏感链接已清理]')
    };
  };

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('3xui_deploy_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized = Array.isArray(parsed) ? parsed.map(normalizeHistoryItem) : [];
        setHistoryItems(normalized);
        localStorage.setItem('3xui_deploy_history', JSON.stringify(normalized));
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshPlans = async () => {
    const result = await api<{ plans: Plan[] }>('/api/plans');
    setPlans(result.plans);
  };

  const refreshAccount = async () => {
    if (!user) return;
    setAccountLoading(true);
    try {
      const result = await api<AccountData>('/api/account');
      setAccount(result);
    } finally {
      setAccountLoading(false);
    }
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
    if (user) void refreshAccount();
    else setAccount(null);
  }, [user?.id]);

  const saveHistory = (newItem: HistoryItem) => {
    setHistoryItems(prev => {
      const updated = [newItem, ...prev].slice(0, 30);
      try {
        localStorage.setItem('3xui_deploy_history', JSON.stringify(updated.map(normalizeHistoryItem)));
      } catch {
        // ignore
      }
      return updated;
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

  const handleClearHistory = () => {
    setHistoryItems([]);
    try {
      localStorage.removeItem('3xui_deploy_history');
    } catch {
      // ignore
    }
    showToast('清空历史记录', '已清除所有本地搭建记录', 'info');
  };

  const handlePanelCreated = (result: PanelResult) => {
    const historyItem: HistoryItem = {
      id: result.id,
      timestamp: result.createdAt,
      type: 'panel',
      title: `xui面板 (${result.host}:${result.port})`,
      summary: result.accessUrl,
      panelData: { ...result }
    };
    saveHistory(historyItem);
    void refreshAccount();
  };

  const handleNodeCreated = (result: NodeResult) => {
    const historyItem: HistoryItem = {
      id: result.id,
      timestamp: result.createdAt,
      type: 'node',
      title: `${result.nodeName} (${result.protocol} + ${result.transport})`,
      summary: `${result.protocol} + ${result.transport} · 入站 #${result.inboundId}`
    };
    saveHistory(historyItem);
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
      panelFlavor: result.panelFlavor || (
        result.scriptType === 'recommended'
          ? 'mogai'
          : result.scriptType === 'official'
            ? 'official'
            : 'compatible'
      ),
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
    setUser(null);
    setCurrentView('home');
    window.location.assign('/');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 flex flex-col font-sans selection:bg-indigo-500 selection:text-white antialiased">
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

        {currentView === 'panel' && (
          <PanelDeployView
            onPanelCreated={handlePanelCreated}
            onGoToNodeWithPanel={handleGoToNodeWithPanel}
            showToast={showToast}
            entitlements={account?.entitlements}
          />
        )}

        {currentView === 'node' && (
          <NodeDeployView
            initialPanelData={prefilledPanel}
            onNodeCreated={handleNodeCreated}
            showToast={showToast}
            entitlements={account?.entitlements}
          />
        )}

        {currentView === 'pricing' && <PricingView plans={plans} onOrderCreated={refreshAccount} showToast={showToast} />}
        {currentView === 'account' && <AccountView account={account} loading={accountLoading} onRefresh={() => void refreshAccount()} onLoggedOut={() => { setUser(null); window.location.assign('/'); }} showToast={showToast} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500 relative z-10">
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
            panelFlavor: data.panelFlavor || (
              data.scriptType === 'recommended'
                ? 'mogai'
                : data.scriptType === 'official'
                  ? 'official'
                  : 'compatible'
            ),
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
