import React, { useEffect, useState } from 'react';
import { Check, Clock3, CreditCard, ExternalLink, KeyRound, Network, ShoppingCart, Terminal } from 'lucide-react';
import { api, formatMoney, Order, PaymentCheckout, PaymentMethod, Plan, quotaText } from '../commercial';
import { PaymentCheckoutDialog } from './PaymentCheckoutDialog';

interface PricingViewProps {
  plans: Plan[];
  onOrderCreated: () => Promise<void> | void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type PurchaseMode = 'payment' | 'redeem';

function duration(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', quarters: '个季度', years: '年' };
  return `${plan.durationValue} ${units[plan.durationUnit]}`;
}

export const PricingView: React.FC<PricingViewProps> = ({ plans, onOrderCreated, showToast }) => {
  const [ordering, setOrdering] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentProvider, setPaymentProvider] = useState('');
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>('redeem');
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCodePurchaseUrl, setRedeemCodePurchaseUrl] = useState('');
  const [checkout, setCheckout] = useState<{ order: Order; payment: PaymentCheckout } | null>(null);

  useEffect(() => {
    api<{ paymentMethods: PaymentMethod[]; redeemCodePurchaseUrl: string }>('/api/payment-methods').then(result => {
      setPaymentMethods(result.paymentMethods);
      setPaymentProvider(value => result.paymentMethods.some(method => method.id === value) ? value : result.paymentMethods[0]?.id || '');
      setRedeemCodePurchaseUrl(result.redeemCodePurchaseUrl || '');
      setPurchaseMode(result.paymentMethods.length ? 'payment' : 'redeem');
    }).catch(() => {
      setPaymentMethods([]);
      setPaymentProvider('');
      setPurchaseMode('redeem');
      setRedeemCodePurchaseUrl('');
    });
  }, []);

  const openPurchase = (plan: Plan) => {
    setPurchaseMode(paymentMethods.length ? 'payment' : 'redeem');
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

  const redeem = async (plan: Plan) => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const result = await api<{ order: Order; orderNo: string; planName: string }>('/api/redeem-codes/redeem', {
        method: 'POST',
        body: JSON.stringify({ code: redeemCode, planId: plan.id }),
      });
      setRedeemCode('');
      setSelectedPlan(null);
      await onOrderCreated();
      showToast('卡密兑换成功', `${result.planName} 权益已发放，订单 ${result.orderNo} 已记录`, 'success');
    } catch (error) {
      showToast('卡密兑换失败', error instanceof Error ? error.message : '请检查卡密后重试', 'error');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-white/10 pb-5">
        <h1 className="text-2xl font-bold text-white">购买搭建权益</h1>
        <p className="text-sm text-zinc-400 mt-1">套餐价格、有效期、面板次数和节点次数均由管理员配置。</p>
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
              <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-amber-400" />{duration(plan)}</div>
              <div className="flex items-center gap-2"><Terminal className="w-4 h-4 text-indigo-400" />面板：{quotaText(plan.panelMode, plan.panelLimit)}</div>
              <div className="flex items-center gap-2"><Network className="w-4 h-4 text-emerald-400" />节点：{quotaText(plan.nodeMode, plan.nodeLimit)}</div>
              <div className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 text-cyan-400" /><span>每日面板 {plan.dailyPanelLimit || '不限'} 次，节点 {plan.dailyNodeLimit || '不限'} 次</span></div>
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
          <header><div><span>{paymentMethods.length ? 'ORDER CHECKOUT' : 'REDEEM CODE'}</span><h2 id="payment-title">{paymentMethods.length ? '购买套餐' : '卡密兑换'}</h2></div><button type="button" disabled={Boolean(ordering) || redeeming} onClick={() => setSelectedPlan(null)} aria-label="关闭">×</button></header>
          <div className="payment-order-summary"><div><span>套餐</span><strong>{selectedPlan.name}</strong></div><div><span>套餐价格</span><strong>{formatMoney(selectedPlan.priceCents)}</strong></div></div>
          {paymentMethods.length > 0 && <div className="payment-mode-tabs" role="tablist" aria-label="购买方式">
            <button type="button" role="tab" aria-selected={purchaseMode === 'payment'} className={purchaseMode === 'payment' ? 'active' : ''} onClick={() => setPurchaseMode('payment')}><CreditCard />在线支付</button>
            <button type="button" role="tab" aria-selected={purchaseMode === 'redeem'} className={purchaseMode === 'redeem' ? 'active' : ''} onClick={() => setPurchaseMode('redeem')}><KeyRound />卡密兑换</button>
          </div>}
          {paymentMethods.length > 0 && purchaseMode === 'payment' ? <>
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
            <label htmlFor="redeem-code"><span>套餐卡密</span><div><KeyRound /><input id="redeem-code" value={redeemCode} onChange={event => setRedeemCode(event.target.value.toUpperCase())} maxLength={40} autoComplete="off" placeholder="XUI-XXXX-XXXX-XXXX-XXXX" /></div><small>卡密必须与当前选择的“{selectedPlan.name}”套餐一致，兑换成功后自动生成已支付订单。</small></label>
            <div className="payment-redeem-actions">
              <button type="button" disabled={redeeming || !redeemCode.trim()} onClick={() => void redeem(selectedPlan)}><KeyRound />{redeeming ? '正在兑换...' : '兑换并创建订单'}</button>
            </div>
          </div>}
        </section>
      </div>}
      {checkout && <PaymentCheckoutDialog order={checkout.order} payment={checkout.payment} onClose={() => setCheckout(null)} onPaid={() => {
        setCheckout(null);
        void onOrderCreated();
        showToast('支付成功', '套餐权益已经自动发放到账户', 'success');
      }} />}
    </div>
  );
};
