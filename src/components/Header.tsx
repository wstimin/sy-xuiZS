import React from 'react';
import { ViewMode } from '../types';
import {
  BookOpen,
  Cpu,
  CreditCard,
  HelpCircle,
  History,
  LogOut,
  Network,
  Terminal
} from 'lucide-react';
import { CurrentUser } from '../commercial';

interface HeaderProps {
  currentView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onOpenGuide: () => void;
  onOpenSetupGuide?: () => void;
  onOpenHistory: () => void;
  historyCount: number;
  user: CurrentUser;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onSelectView,
  onOpenGuide,
  onOpenSetupGuide,
  onOpenHistory,
  historyCount,
  user,
  onLogout
}) => {
  const navClass = (view: ViewMode, extraClass = '') =>
    `app-header-nav-button${currentView === view ? ' is-active' : ''}${extraClass ? ` ${extraClass}` : ''}`;
  const accountLabel = `${user.username} · 我的账户`;

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <button
          type="button"
          className="app-header-brand"
          onClick={() => onSelectView('home')}
          title="返回首页"
        >
          <span className="app-header-brand-mark"><Terminal /></span>
          <span className="app-header-brand-copy">
            <strong><span>xui面板</span><em>一键搭建助手</em></strong>
            <small>专注面板与节点搭建</small>
          </span>
        </button>

        <nav className="app-header-primary-nav" aria-label="主要功能">
          <button type="button" className={navClass('home', 'app-header-home')} onClick={() => onSelectView('home')}>
            <Cpu /><span>首页</span>
          </button>
          <button type="button" className={navClass('panel', 'app-header-panel')} onClick={() => onSelectView('panel')}>
            <Terminal /><span>搭建面板</span>
          </button>
          <button type="button" className={navClass('node', 'app-header-node')} onClick={() => onSelectView('node')}>
            <Network /><span>搭建节点</span>
          </button>
          <button type="button" className={navClass('pricing', 'app-header-purchase')} onClick={() => onSelectView('pricing')}>
            <CreditCard /><span>购买</span>
          </button>
        </nav>

        <div className="app-header-tools" aria-label="辅助功能">
          {onOpenSetupGuide && (
            <button type="button" className="app-header-tool-button app-header-guide" onClick={onOpenSetupGuide} title="查看 xui 面板与节点使用搭建指南">
              <BookOpen /><span>使用说明</span>
            </button>
          )}
          <button type="button" className="app-header-tool-button app-header-protocol" onClick={onOpenGuide} title="协议冲突与速查规则">
            <HelpCircle /><span>协议速查</span>
          </button>
          <button type="button" className="app-header-tool-button app-header-history" onClick={onOpenHistory} title="历史生成记录">
            <History /><span>历史配置</span>
            {historyCount > 0 && <b className="app-header-history-count">{historyCount}</b>}
          </button>
        </div>

        <div className="app-header-session">
          <button
            type="button"
            className={`app-header-account${currentView === 'account' ? ' is-active' : ''}`}
            onClick={() => onSelectView('account')}
            title={accountLabel}
          >
            <span className="app-header-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="app-header-account-label">
              <strong>{user.username}</strong>
              <i aria-hidden="true">·</i>
              <span>我的账户</span>
            </span>
          </button>
          <button type="button" onClick={onLogout} title="退出登录" className="app-header-logout">
            <LogOut /><span>退出</span>
          </button>
        </div>
      </div>
    </header>
  );
};
