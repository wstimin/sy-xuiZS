import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  KeyRound,
  LogOut,
  Mail,
  Network,
  PlayCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Terminal,
  UserCircle,
} from 'lucide-react';
import { AccountData, api, formatDate, formatMoney, Order, PaymentCheckout, quotaText } from '../commercial';
import { ChangePasswordForm } from './ChangePasswordForm';
import { PaymentCheckoutDialog } from './PaymentCheckoutDialog';

interface AccountViewProps {
  account: AccountData | null;
  loading: boolean;
  onRefresh: () => Promise<unknown> | void;
  onPurchaseSuccess: (title?: string, description?: string) => void;
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

function orderPaymentName(order: Order, methodName?: string) {
  if (order.paymentProvider === 'redeem_code') return '卡密兑换';
  if (order.paymentProvider === 'external_redeem') return order.paymentChannel || '第三方卡密';
  if (order.paymentProvider === 'balance') return '账户余额';
  return methodName || order.paymentProvider || '-';
}

export const AccountView: React.FC<AccountViewProps> = ({ account, loading, onRefresh, onPurchaseSuccess, onLoggedOut, onLogout, showToast }) => {
  const [tab, setTab] = useState<AccountTab>('overview');
  const [checkout, setCheckout] = useState<{ order: Order; payment: PaymentCheckout } | null>(null);
  const [payingOrderId, setPayingOrderId] = useState('');
  const [walletCode, setWalletCode] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletRechargeOpen, setWalletRechargeOpen] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletPaymentProvider, setWalletPaymentProvider] = useState('');
  const [walletPaymentBusy, setWalletPaymentBusy] = useState(false);
  const entitlements = account?.entitlements || [];
  const orders = account?.orders || [];
  const deployments = account?.deployments || [];
  const activeEntitlements = useMemo(() => entitlements.filter(item => item.status === 'active' && (!item.expiresAt || new Date(item.expiresAt).getTime() > Date.now())), [entitlements]);
  const panelQuota = activeEntitlements.some(item => item.panelMode === 'unlimited') ? '不限次数' : `${activeEntitlements.reduce((total, item) => total + (item.panelMode === 'limited' ? item.panelRemaining : 0), 0)} 次`;
  const nodeQuota = activeEntitlements.some(item => item.nodeMode === 'unlimited') ? '不限次数' : `${activeEntitlements.reduce((total, item) => total + (item.nodeMode === 'limited' ? item.nodeRemaining : 0), 0)} 次`;
  const paymentMethod = (provider: string, optionId?: string) => account?.paymentMethods.find(method => method.id === (optionId || provider));
  const walletPaymentMethods = (account?.paymentMethods || []).filter(method => method.enabled);
  const cardRechargeEnabled = Boolean(account?.redeemCodeEnabled || account?.redeemCodePurchaseUrl?.trim());

  const openWalletRecharge = () => {
    setWalletAmount('');
    setWalletCode('');
    setWalletPaymentProvider(walletPaymentMethods[0]?.id || '');
    setWalletRechargeOpen(true);
  };

  const cancelOrder = async (id: string) => {
    try {
      await api(`/api/orders/${id}/cancel`, { method: 'POST' });
      onRefresh();
      showToast('订单已取消', '该订单不会再发放权益', 'success');
    } catch (error) {
      showToast('取消订单失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    }
  };

  const continuePayment = async (order: Order) => {
    setPayingOrderId(order.id);
    try {
      const result = await api<{ order: Order; payment: PaymentCheckout | null }>(`/api/orders/${order.id}/checkout`, { method: 'POST' });
      if (!result.payment) {
        showToast('暂时无法支付', '该订单没有可用的在线支付渠道，请联系管理员处理', 'warning');
        return;
      }
      if (result.payment.checkoutType === 'redirect') {
        window.location.assign(result.payment.checkoutUrl);
        return;
      }
      setCheckout({ order: result.order, payment: result.payment });
    } catch (error) {
      showToast('发起支付失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setPayingOrderId('');
    }
  };

  const rechargeWallet = async () => {
    if (!walletCode.trim()) return showToast('请输入金额卡密', '', 'warning');
    setWalletBusy(true);
    try {
      const result = await api<{ balanceCents: number; amountCents: number }>('/api/redeem-codes/redeem', { method: 'POST', body: JSON.stringify({ code: walletCode }) });
      setWalletCode('');
      await onRefresh();
      showToast('余额充值成功', `已到账 ${formatMoney(result.amountCents)}，当前余额 ${formatMoney(result.balanceCents)}。`, 'success');
    } catch (error) {
      showToast('余额充值失败', error instanceof Error ? error.message : '请检查卡密后重试', 'error');
    } finally {
      setWalletBusy(false);
    }
  };

  const createWalletTopup = async () => {
    const amountCents = Math.round(Number(walletAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 1) return showToast('请输入充值金额', '充值金额最低为 0.01 元', 'warning');
    if (!walletPaymentProvider) return showToast('暂无可用支付方式', '请使用卡密充值，或联系管理员开启在线支付方式', 'warning');
    setWalletPaymentBusy(true);
    try {
      const result = await api<{ order: Order; payment: PaymentCheckout | null; paymentError?: string }>('/api/wallet/topups', {
        method: 'POST',
        body: JSON.stringify({ amountCents, paymentProvider: walletPaymentProvider }),
      });
      if (!result.payment) {
        showToast('充值订单已创建', result.paymentError || '支付渠道暂不可用，请稍后在订单中重试', 'warning');
        setWalletRechargeOpen(false);
        await onRefresh();
        return;
      }
      if (result.payment.checkoutType === 'redirect') {
        window.location.assign(result.payment.checkoutUrl);
        return;
      }
      setWalletRechargeOpen(false);
      setCheckout({ order: result.order, payment: result.payment });
    } catch (error) {
      showToast('创建充值订单失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setWalletPaymentBusy(false);
    }
  };

  return (
    <div className="account-shell">
      <section className="account-hero">
        <div className="account-identity">
          <span className="account-avatar">{account?.user.username.slice(0, 1).toUpperCase() || <UserCircle />}</span>
          <div>
            <span className="account-eyebrow">账户中心</span>
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
        <article className="amber account-balance-summary"><span><ReceiptText /></span><div><small>账户余额</small><strong>{formatMoney(account?.user.balanceCents || 0)}</strong><p>可直接购买永久次数套餐</p></div>{(walletPaymentMethods.length > 0 || cardRechargeEnabled) && <button type="button" className="account-balance-recharge" onClick={openWalletRecharge}><CreditCard /> 充值</button>}</article>
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
            <div className="account-entitlement-head"><div><h3>{item.planName}</h3><p>永久有效 · 按剩余次数使用</p></div><span className={`account-status ${item.status}`}>{item.status === 'active' ? '有效' : item.status === 'expired' ? '已过期' : '已停用'}</span></div>
            <div className="account-quota-grid">
              <div><span className="violet"><Terminal /></span><small>面板可用</small><strong>{quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}</strong><p>已用 {item.panelUsed}，冻结 {item.panelReserved}</p></div>
              <div><span className="emerald"><Network /></span><small>节点可用</small><strong>{quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}</strong><p>已用 {item.nodeUsed}，冻结 {item.nodeReserved}</p></div>
            </div>
          </article>)}
          {!entitlements.length && <AccountEmpty icon={BadgeCheck} title="暂无可用权益" description="购买套餐后，面板和节点额度会显示在这里。" />}
        </div>
      </section>}

      {tab === 'orders' && <section className="account-section">
        <header><div><span>订单中心</span><h2>订单记录</h2><p>查看套餐、金额、支付状态和付款方式。</p></div></header>
        <div className="account-table-wrap">
          <table className="account-table"><thead><tr><th>订单信息</th><th>金额</th><th>支付方式</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>{orders.map(order => { const method = paymentMethod(order.paymentProvider, order.paymentOptionId); return <tr key={order.id}><td><strong>{planName(order.planSnapshot)}</strong><small>{order.orderNo}</small></td><td className="account-money">{formatMoney(order.amountCents)}</td><td><span>{orderPaymentName(order, method?.name)}</span>{order.status === 'pending' && method?.instructions && <small>{method.instructions}</small>}</td><td><span className={`account-status ${order.status}`}>{orderLabels[order.status] || order.status}</span></td><td>{formatDate(order.createdAt)}</td><td>{order.status === 'pending' ? <div className="account-order-actions"><button type="button" className="account-continue-payment" disabled={payingOrderId === order.id} onClick={() => void continuePayment(order)}><PlayCircle /> {payingOrderId === order.id ? '处理中' : '继续支付'}</button><button type="button" className="account-cancel-order" onClick={() => void cancelOrder(order.id)}>取消</button></div> : <span className="account-muted">-</span>}</td></tr>; })}</tbody>
          </table>
          {!orders.length && <AccountEmpty icon={ReceiptText} title="暂无订单" description="购买套餐后，订单会显示在这里。" />}
        </div>
      </section>}

      {tab === 'deployments' && <section className="account-section">
        <header><div><span>交付记录</span><h2>搭建记录</h2><p>展示最近 30 条真实任务状态与执行结果。</p></div></header>
        <div className="account-deployment-list">{deployments.slice(0, 30).map(item => <article key={item.id}>
          <span className={`account-deployment-icon ${item.status}`}>{item.status === 'succeeded' ? <CheckCircle2 /> : <AlertCircle />}</span>
          <div><h3>{item.capability === 'panel' ? '面板安装' : '节点创建'} <small>{item.targetHostMasked || '-'}</small></h3><p>{item.resultSummary || item.errorMessage || '任务结果正在记录中'}</p></div>
          <div><strong>{deploymentLabels[item.status] || item.status}</strong><small>{formatDate(item.createdAt)}</small></div>
        </article>)}{!deployments.length && <AccountEmpty icon={Clock3} title="暂无搭建记录" description="执行面板或节点任务后，结果会显示在这里。" />}</div>
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
      {walletRechargeOpen && <div className="payment-dialog-backdrop" role="presentation" onMouseDown={() => !walletPaymentBusy && !walletBusy && setWalletRechargeOpen(false)}>
        <section className="payment-dialog wallet-recharge-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-recharge-title" onMouseDown={event => event.stopPropagation()}>
          <header><div><span>账户余额</span><h2 id="wallet-recharge-title">充值余额</h2><small>当前余额：{formatMoney(account?.user.balanceCents || 0)}</small></div><button type="button" disabled={walletPaymentBusy || walletBusy} onClick={() => setWalletRechargeOpen(false)} aria-label="关闭">×</button></header>
          <div className="wallet-recharge-content">
            {walletPaymentMethods.length > 0 && <label className="wallet-recharge-amount"><span>充值金额（元）</span><input type="number" min="0.01" step="0.01" value={walletAmount} onChange={event => setWalletAmount(event.target.value)} placeholder="请输入充值金额" /></label>}
            {walletPaymentMethods.length > 0 && <section className="wallet-recharge-section"><div className="wallet-recharge-section-title"><strong>在线支付</strong><small>选择后台已开启的支付方式</small></div><div className="payment-method-list wallet-payment-method-list">{walletPaymentMethods.map(method => <label key={method.id} className={walletPaymentProvider === method.id ? 'selected' : ''}><input type="radio" name="wallet-payment-provider" value={method.id} checked={walletPaymentProvider === method.id} onChange={() => setWalletPaymentProvider(method.id)} /><span className="payment-method-icon"><CreditCard /></span><span><strong>{method.name}</strong><small>{method.instructions || '支付成功后自动到账'}</small></span>{method.paymentUrl && <a href={method.paymentUrl} target="_blank" rel="noreferrer" title="打开付款地址" onClick={event => event.stopPropagation()}><ExternalLink /></a>}</label>)}</div><button type="button" className="payment-confirm" disabled={walletPaymentBusy || !walletAmount.trim()} onClick={() => void createWalletTopup()}><CreditCard />{walletPaymentBusy ? '正在创建充值订单...' : '使用在线支付充值'}</button></section>}
            {cardRechargeEnabled && <section className="wallet-recharge-section wallet-card-recharge"><div className="wallet-recharge-section-title"><strong>金额卡密充值</strong><small>输入本地或已对接的第三方卡密，金额会直接到账余额</small></div>{account?.redeemCodePurchaseUrl && <a className="payment-redeem-purchase" href={account.redeemCodePurchaseUrl} target="_blank" rel="noreferrer"><ShoppingCart /><span><strong>前往购买卡密</strong><small>打开购买页面，购买后返回这里兑换</small></span><ExternalLink /></a>}<div className="wallet-code-input"><KeyRound /><input value={walletCode} onChange={event => setWalletCode(event.target.value)} maxLength={200} placeholder="输入本地或第三方卡密" /><button type="button" disabled={walletBusy || !walletCode.trim()} onClick={() => void rechargeWallet()}>{walletBusy ? '兑换中...' : '兑换充值'}</button></div></section>}
            {!walletPaymentMethods.length && !cardRechargeEnabled && <div className="wallet-recharge-empty"><CreditCard /><strong>暂未开放充值方式</strong><span>管理员尚未开启在线支付或卡密充值。</span></div>}
          </div>
        </section>
      </div>}
      {checkout && <PaymentCheckoutDialog order={checkout.order} payment={checkout.payment} onClose={() => setCheckout(null)} onPaid={() => {
        setCheckout(null);
        void Promise.resolve(onRefresh()).then(
          () => onPurchaseSuccess('余额充值成功', '充值金额已到账，可以继续购买永久次数套餐。'),
          () => onPurchaseSuccess(),
        );
      }} />}
    </div>
  );
};

const AccountEmpty: React.FC<{ icon: React.ElementType; title: string; description: string }> = ({ icon: Icon, title, description }) => <div className="account-empty"><Icon /><strong>{title}</strong><p>{description}</p></div>;
