import React, { useEffect, useState } from 'react';
import { Check, Clock3, CreditCard, ExternalLink, KeyRound, Network, ShoppingCart, Terminal } from 'lucide-react';
import { api, formatMoney, Order, PaymentCheckout, PaymentMethod, Plan, quotaText } from '../commercial';
import { PaymentCheckoutDialog } from './PaymentCheckoutDialog';

interface PricingViewProps {
  plans: Plan[];
  onOrderCreated: () => Promise<unknown> | void;
  onPurchaseSuccess: (title?: string, description?: string) => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type PurchaseMode = 'payment' | 'balance' | 'redeem';

export const PricingView: React.FC<PricingViewProps> = ({ plans, onOrderCreated, onPurchaseSuccess, showToast }) => {
  const [ordering, setOrdering] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentProvider, setPaymentProvider] = useState('');
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>('redeem');
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCodePurchaseUrl, setRedeemCodePurchaseUrl] = useState('');
  const [balanceCents, setBalanceCents] = useState(0);
  const [checkout, setCheckout] = useState<{ order: Order; payment: PaymentCheckout } | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ paymentMethods: PaymentMethod[]; redeemCodePurchaseUrl: string }>('/api/payment-methods', { cache: 'no-store' }),
      api<{ user: { balanceCents: number } }>('/api/account', { cache: 'no-store' }),
    ]).then(([result, account]) => {
      // Treat the enabled flag as the source of truth on the client too. This
      // prevents a stale/cached response from reopening the online-payment tab
      // after an administrator switches the site to card-only mode.
      const enabledMethods = result.paymentMethods.filter(method => method.enabled);
      setPaymentMethods(enabledMethods);
      setPaymentProvider(value => enabledMethods.some(method => method.id === value) ? value : enabledMethods[0]?.id || '');
      setRedeemCodePurchaseUrl(result.redeemCodePurchaseUrl || '');
      setBalanceCents(Number(account.user.balanceCents) || 0);
      // 卡密是最直接的购买入口；余额和在线支付作为后续切换方式展示。
      setPurchaseMode('redeem');
    }).catch(() => {
      setPaymentMethods([]);
      setPaymentProvider('');
      setPurchaseMode('redeem');
      setRedeemCodePurchaseUrl('');
    });
  }, []);

  const openPurchase = (plan: Plan) => {
    setPurchaseMode('redeem');
    setRedeemCode('');
    setSelectedPlan(plan);
  };

  const order = async (plan: Plan) => {
    if (!paymentProvider) {
      showToast('暂时无法下单', '管理员尚未启用在线支付方式，可使用卡密兑换', 'warning');
      setPurchaseMode('redeem');
      return;
    }
    setOrdering(plan.id);
    try {
      const data = await api<{ order: Order; payment: PaymentCheckout | null; paymentError?: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id, paymentProvider }),
      });
      await onOrderCreated();
      if (data.payment?.checkoutType === 'redirect') {
        window.location.assign(data.payment.checkoutUrl);
        return;
      }
      if (data.payment?.checkoutType === 'qrcode') {
        setSelectedPlan(null);
        setCheckout({ order: data.order, payment: data.payment });
        return;
      }
      if (data.paymentError) {
        showToast('订单已创建', `支付网关暂不可用，可在我的账户中继续支付。${data.paymentError}`, 'warning');
        setSelectedPlan(null);
        return;
      }
      showToast('订单已创建', `订单号 ${data.order.orderNo}，请按页面提示完成付款`, 'success');
      setSelectedPlan(null);
    } catch (error) {
      showToast('创建订单失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setOrdering('');
    }
  };

  const buyWithBalance = async (plan: Plan) => {
    setOrdering(plan.id);
    try {
      const result = await api<{ order: Order; balanceCents: number }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id, paymentProvider: 'balance' }),
      });
      setBalanceCents(result.balanceCents);
      setSelectedPlan(null);
      await onOrderCreated();
      onPurchaseSuccess('套餐购买成功', `${plan.name} 已发放到账户，余额还剩 ${formatMoney(result.balanceCents)}。`);
    } catch (error) {
      showToast('余额购买失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setOrdering('');
    }
  };

  const redeem = async (plan: Plan) => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const result = await api<{ order?: Order; orderNo?: string; planName?: string; balanceCents: number; amountCents: number; redemptionKind: 'balance' | 'purchase'; purchasePending?: boolean; requestedPlanName?: string; shortfallCents?: number }>('/api/redeem-codes/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: redeemCode, planId: plan.id }),
      });
      setRedeemCode('');
      setSelectedPlan(null);
      setBalanceCents(result.balanceCents);
      await onOrderCreated();
      if (result.redemptionKind === 'purchase') {
        onPurchaseSuccess('卡密购买成功', `${result.planName || plan.name} 权益已经发放到账户，余额还剩 ${formatMoney(result.balanceCents)}。`);
      } else {
        onPurchaseSuccess('卡密已充值', `已到账 ${formatMoney(result.amountCents)}，当前余额 ${formatMoney(result.balanceCents)}${result.purchasePending && result.shortfallCents ? `，购买 ${result.requestedPlanName || plan.name} 还差 ${formatMoney(result.shortfallCents)}` : ''}。`);
      }
    } catch (error) {
      showToast('卡密兑换失败', error instanceof Error ? error.message : '请检查卡密后重试', 'error');
    } finally {
      setRedeeming(false);
    }
  };

  const availableBalanceCents = selectedPlan && purchaseMode === 'balance'
    ? Math.max(balanceCents - selectedPlan.priceCents, 0)
    : balanceCents;

  return (
    <div className="pricing-page max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-white/10 pb-5">
        <h1 className="text-2xl font-bold text-white">购买搭建权益</h1>
        <p className="text-sm text-zinc-400 mt-1">套餐按金额购买，权益永久有效，面板和节点按剩余次数使用。</p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {plans.map(plan => (
          <div key={plan.id} className="border border-white/10 bg-white/[0.035] rounded-lg p-5 flex flex-col min-h-[340px]">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
              <p className="text-xs text-zinc-500 mt-1 min-h-10">{plan.description}</p>
            </div>
            <div className="text-3xl font-bold text-white mb-5">{formatMoney(plan.priceCents)}</div>
            <div className="space-y-3 text-sm text-zinc-300 flex-1">
              <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-amber-400" />永久有效</div>
              <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-indigo-400" />面板：{quotaText(plan.panelMode, plan.panelLimit)}</div>
              <div className="flex items-center gap-2"><Network className="w-4 h-4 text-emerald-400" />节点：{quotaText(plan.nodeMode, plan.nodeLimit)}</div>
              <div className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-cyan-400" /><span>有剩余次数即可使用，不设每日上限</span></div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400" />最多并发 {plan.concurrencyLimit} 个任务</div>
            </div>
            <button onClick={() => openPurchase(plan)} className="mt-5 h-10 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold flex items-center justify-center gap-2">
              {paymentMethods.length ? <ShoppingCart className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
              {paymentMethods.length ? '购买套餐 / 卡密兑换' : '购买卡密 / 兑换'}
            </button>
          </div>
        ))}
      </div>
      {!plans.length && <div className="py-16 text-center text-zinc-500 border border-dashed border-white/10 rounded-lg">暂无可购买套餐</div>}
      {selectedPlan && <div className="payment-dialog-backdrop" role="presentation" onMouseDown={() => !ordering && !redeeming && setSelectedPlan(null)}>
        <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={event => event.stopPropagation()}>
          <header><div><span>永久次数套餐</span><h2 id="payment-title">购买套餐</h2><small>选择卡密或余额完成购买</small></div><button type="button" disabled={Boolean(ordering) || redeeming} onClick={() => setSelectedPlan(null)} aria-label="关闭">×</button></header>
          <div className="payment-order-summary"><div><span>套餐</span><strong>{selectedPlan.name}</strong></div><div><span>套餐价格</span><strong>{formatMoney(selectedPlan.priceCents)}</strong></div></div>
          <div className="payment-mode-tabs" role="tablist" aria-label="购买方式">
            <button type="button" role="tab" aria-selected={purchaseMode === 'redeem'} className={purchaseMode === 'redeem' ? 'active' : ''} onClick={() => setPurchaseMode('redeem')}><KeyRound />卡密兑换</button>
            <button type="button" role="tab" aria-selected={purchaseMode === 'balance'} className={purchaseMode === 'balance' ? 'active' : ''} onClick={() => setPurchaseMode('balance')}><CreditCard />余额购买</button>
            {paymentMethods.length > 0 && <button type="button" role="tab" aria-selected={purchaseMode === 'payment'} className={purchaseMode === 'payment' ? 'active' : ''} onClick={() => setPurchaseMode('payment')}><CreditCard />在线支付</button>}
          </div>
          {purchaseMode === 'balance' ? <div className="payment-redeem-panel payment-balance-panel">
            <div className="payment-balance-card" aria-label="余额概览">
              <div className="payment-balance-card-heading"><span>余额可用情况</span><small>本次购买实时计算</small></div>
              <div className="payment-balance-stats"><div><span>当前余额</span><strong>{formatMoney(balanceCents)}</strong></div><div><span>购买后可用余额</span><strong>{formatMoney(availableBalanceCents)}</strong></div></div>
            </div>
            <p>本次购买将扣除 {formatMoney(selectedPlan.priceCents)}，剩余金额会继续保留。</p><button className="payment-confirm" disabled={ordering === selectedPlan.id || balanceCents < selectedPlan.priceCents} onClick={() => void buyWithBalance(selectedPlan)}><ShoppingCart />{ordering === selectedPlan.id ? '正在购买...' : balanceCents < selectedPlan.priceCents ? '余额不足' : '确认余额购买'}</button></div> : purchaseMode === 'payment' ? <>
            <div className="payment-method-list">
              {paymentMethods.map(method => <label key={method.id} className={paymentProvider === method.id ? 'selected' : ''}>
                <input type="radio" name="payment-provider" value={method.id} checked={paymentProvider === method.id} onChange={() => setPaymentProvider(method.id)} />
                <span className="payment-method-icon"><CreditCard /></span>
                <span><strong>{method.name}</strong><small>{method.instructions || '创建订单后按提示完成付款'}</small></span>
                {method.paymentUrl && <a href={method.paymentUrl} target="_blank" rel="noreferrer" title="打开付款地址" onClick={event => event.stopPropagation()}><ExternalLink /></a>}
              </label>)}
            </div>
            <button className="payment-confirm" disabled={ordering === selectedPlan.id || !paymentProvider} onClick={() => void order(selectedPlan)}><ShoppingCart />{ordering === selectedPlan.id ? '正在创建订单...' : '确认创建订单'}</button>
          </> : <div className="payment-redeem-panel">
            {redeemCodePurchaseUrl && <a className="payment-redeem-purchase" href={redeemCodePurchaseUrl} target="_blank" rel="noreferrer"><ShoppingCart /><span><strong>立即购买卡密</strong><small>前往卡密购买页面，购买后返回此处兑换</small></span><ExternalLink /></a>}
            <label htmlFor="redeem-code"><span>金额卡密</span><div><KeyRound /><input id="redeem-code" value={redeemCode} onChange={event => setRedeemCode(event.target.value)} maxLength={200} autoComplete="off" placeholder="输入本地或第三方卡密" /></div><small>卡密金额会和当前余额合并，直接抵扣本套餐；第三方卡密金额不足时会先安全充入余额。</small></label>
            <div className="payment-redeem-actions">
              <button type="button" disabled={redeeming || !redeemCode.trim()} onClick={() => void redeem(selectedPlan)}><KeyRound />{redeeming ? '正在兑换...' : '兑换并创建订单'}</button>
            </div>
          </div>}
        </section>
      </div>}
      {checkout && <PaymentCheckoutDialog order={checkout.order} payment={checkout.payment} onClose={() => setCheckout(null)} onPaid={() => {
        setCheckout(null);
        void Promise.resolve(onOrderCreated()).then(
          () => onPurchaseSuccess(),
          () => onPurchaseSuccess(),
        );
      }} />}
    </div>
  );
};
