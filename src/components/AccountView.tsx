import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  KeyRound,
  LogOut,
  Mail,
  Network,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UserCircle,
} from 'lucide-react';
import { AccountData, api, formatDate, formatMoney, quotaText } from '../commercial';
import { ChangePasswordForm } from './ChangePasswordForm';

interface AccountViewProps {
  account: AccountData | null;
  loading: boolean;
  onRefresh: () => void;
  onLoggedOut: () => void;
  onLogout: () => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type AccountTab = 'overview' | 'orders' | 'deployments' | 'security';

const orderLabels: Record<string, string> = { pending: '待付款确认', paid: '已付款', expired: '已过期', cancelled: '已取消', refunded: '已退款' };
const deploymentLabels: Record<string, string> = { reserved: '已预占', running: '执行中', succeeded: '成功', failed: '失败已返还', uncertain: '结果待确认' };

function planName(snapshot: string) {
  try {
    return JSON.parse(snapshot || '{}').name || '-';
  } catch {
    return '-';
  }
}

export const AccountView: React.FC<AccountViewProps> = ({ account, loading, onRefresh, onLoggedOut, onLogout, showToast }) => {
  const [tab, setTab] = useState<AccountTab>('overview');
  const activeEntitlements = useMemo(() => account?.entitlements.filter(item => item.status === 'active' && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())) || [], [account]);
  const panelQuota = activeEntitlements.some(item => item.panelMode === 'unlimited') ? '不限次数' : `${activeEntitlements.reduce((total, item) => total + (item.panelMode === 'limited' ? item.panelRemaining : 0), 0)} 次`;
  const nodeQuota = activeEntitlements.some(item => item.nodeMode === 'unlimited') ? '不限次数' : `${activeEntitlements.reduce((total, item) => total + (item.nodeMode === 'limited' ? item.nodeRemaining : 0), 0)} 次`;
  const paymentMethod = (provider: string) => account?.paymentMethods.find(method => method.id === provider);

  const cancelOrder = async (id: string) => {
    try {
      await api(`/api/orders/${id}/cancel`, { method: 'POST' });
      onRefresh();
      showToast('订单已取消', '该订单不会再发放权益', 'success');
    } catch (error) {
      showToast('取消订单失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    }
  };

  return (
    <div className="account-shell">
      <section className="account-hero">
        <div className="account-identity">
          <span className="account-avatar">{account?.user.username.slice(0, 1).toUpperCase() || <UserCircle />}</span>
          <div>
            <span className="account-eyebrow">USER ACCOUNT</span>
            <h1>{account?.user.username || '我的账户'}</h1>
            <p><Mail /> {account?.user.email || '暂未绑定邮箱'} {account?.user.emailVerified && <em><BadgeCheck /> 已验证</em>}</p>
          </div>
        </div>
        <div className="account-hero-actions">
          <button type="button" className="account-refresh" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} /> 刷新数据</button>
          <button type="button" className="account-logout-button" onClick={onLogout}><LogOut /> 退出登录</button>
        </div>
      </section>

      <div className="account-summary-grid">
        <article className="cyan"><span><BadgeCheck /></span><div><small>有效权益</small><strong>{activeEntitlements.length}</strong><p>当前可用于提交任务</p></div></article>
        <article className="violet"><span><Terminal /></span><div><small>面板可用</small><strong>{panelQuota}</strong><p>所有有效权益合计</p></div></article>
        <article className="emerald"><span><Network /></span><div><small>节点可用</small><strong>{nodeQuota}</strong><p>与面板次数独立计算</p></div></article>
        <article className="amber"><span><ReceiptText /></span><div><small>订单记录</small><strong>{account?.orders.length || 0}</strong><p>{account?.orders.filter(order => order.status === 'pending').length || 0} 笔等待付款确认</p></div></article>
      </div>

      {account?.orders.some(order => order.status === 'pending') && (
        <div className="account-payment-notice">
          <AlertCircle />
          <div><strong>待付款订单说明</strong><p>{account.paymentInstructions || '请按订单中选择的支付方式完成付款。'}</p></div>
        </div>
      )}

      <nav className="account-tabs" aria-label="账户内容">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><BadgeCheck /> 权益概览</button>
        <button type="button" className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ReceiptText /> 订单记录</button>
        <button type="button" className={tab === 'deployments' ? 'active' : ''} onClick={() => setTab('deployments')}><Clock3 /> 搭建记录</button>
        <button type="button" className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}><ShieldCheck /> 账户安全</button>
      </nav>

      {tab === 'overview' && <section className="account-section">
        <header><div><span>权益与额度</span><h2>当前可用套餐</h2><p>面板搭建和节点配置分别计次，额度数据来自当前账户的真实权益记录。</p></div></header>
        <div className="account-entitlement-grid">
          {account?.entitlements.map(item => <article key={item.id} className="account-entitlement-card">
            <div className="account-entitlement-head"><div><h3>{item.planName}</h3><p>有效期至 {formatDate(item.expiresAt)}</p></div><span className={`account-status ${item.status}`}>{item.status === 'active' ? '有效' : item.status === 'expired' ? '已过期' : '已停用'}</span></div>
            <div className="account-quota-grid">
              <div><span className="violet"><Terminal /></span><small>面板可用</small><strong>{quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}</strong><p>已用 {item.panelUsed}，冻结 {item.panelReserved}</p></div>
              <div><span className="emerald"><Network /></span><small>节点可用</small><strong>{quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}</strong><p>已用 {item.nodeUsed}，冻结 {item.nodeReserved}</p></div>
            </div>
          </article>)}
          {!account?.entitlements.length && <AccountEmpty icon={BadgeCheck} title="暂无可用权益" description="购买套餐后，面板和节点额度会显示在这里。" />}
        </div>
      </section>}

      {tab === 'orders' && <section className="account-section">
        <header><div><span>ORDER HISTORY</span><h2>订单记录</h2><p>查看套餐、金额、支付状态和付款方式。</p></div></header>
        <div className="account-table-wrap">
          <table className="account-table"><thead><tr><th>订单信息</th><th>金额</th><th>支付方式</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>{account?.orders.map(order => { const method = paymentMethod(order.paymentProvider); return <tr key={order.id}><td><strong>{planName(order.planSnapshot)}</strong><small>{order.orderNo}</small></td><td className="account-money">{formatMoney(order.amountCents)}</td><td><span>{method?.name || order.paymentProvider || '-'}</span>{order.status === 'pending' && method?.instructions && <small>{method.instructions}</small>}</td><td><span className={`account-status ${order.status}`}>{orderLabels[order.status] || order.status}</span></td><td>{formatDate(order.createdAt)}</td><td>{order.status === 'pending' ? <button type="button" className="account-cancel-order" onClick={() => void cancelOrder(order.id)}>取消订单</button> : <span className="account-muted">-</span>}</td></tr>; })}</tbody>
          </table>
          {!account?.orders.length && <AccountEmpty icon={ReceiptText} title="暂无订单" description="购买套餐后，订单会显示在这里。" />}
        </div>
      </section>}

      {tab === 'deployments' && <section className="account-section">
        <header><div><span>DELIVERY RECORDS</span><h2>搭建记录</h2><p>展示最近 30 条真实任务状态与执行结果。</p></div></header>
        <div className="account-deployment-list">{account?.deployments.slice(0, 30).map(item => <article key={item.id}>
          <span className={`account-deployment-icon ${item.status}`}>{item.status === 'succeeded' ? <CheckCircle2 /> : <AlertCircle />}</span>
          <div><h3>{item.capability === 'panel' ? '面板安装' : '节点创建'} <small>{item.targetHostMasked || '-'}</small></h3><p>{item.resultSummary || item.errorMessage || '任务结果正在记录中'}</p></div>
          <div><strong>{deploymentLabels[item.status] || item.status}</strong><small>{formatDate(item.createdAt)}</small></div>
        </article>)}{!account?.deployments.length && <AccountEmpty icon={Clock3} title="暂无搭建记录" description="执行面板或节点任务后，结果会显示在这里。" />}</div>
      </section>}

      {tab === 'security' && <section className="account-security-grid">
        <div className="account-security-card">
          <header><span><KeyRound /></span><div><h2>修改登录密码</h2><p>修改成功后当前会话会退出，需要使用新密码重新登录。</p></div></header>
          <ChangePasswordForm endpoint="/api/auth/change-password" onChanged={onLoggedOut} showToast={showToast} variant="account" />
        </div>
        <div className="account-security-card danger">
          <header><span><LogOut /></span><div><h2>退出当前账户</h2><p>退出后本机的登录会话将立即失效，不会影响订单、权益与搭建记录。</p></div></header>
          <div className="account-session"><div><small>当前登录账号</small><strong>{account?.user.email || account?.user.username || '-'}</strong></div><button type="button" onClick={onLogout}><LogOut /> 退出登录</button></div>
        </div>
      </section>}
    </div>
  );
};

const AccountEmpty: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => <div className="account-empty"><Icon /><strong>{title}</strong><p>{description}</p></div>;
