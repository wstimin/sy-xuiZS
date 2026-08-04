import React, { useEffect, useState } from 'react';
import { Check, Clock3, CreditCard, ExternalLink, Network, ShoppingCart, Terminal } from 'lucide-react';
import { api, formatMoney, Order, PaymentCheckout, PaymentMethod, Plan, quotaText } from '../commercial';
import { PaymentCheckoutDialog } from './PaymentCheckoutDialog';

interface PricingViewProps {
  plans: Plan[];
  onOrderCreated: () => Promise<void> | void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

function duration(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', years: '年' };
  return `${plan.durationValue} ${units[plan.durationUnit]}`;
}

export const PricingView: React.FC<PricingViewProps> = ({ plans, onOrderCreated, showToast }) => {
  const [ordering, setOrdering] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentProvider, setPaymentProvider] = useState('');
  const [checkout, setCheckout] = useState<{ order: Order; payment: PaymentCheckout } | null>(null);

  useEffect(() => {
    api<{ paymentMethods: PaymentMethod[] }>('/api/payment-methods').then(result => {
      setPaymentMethods(result.paymentMethods);
      setPaymentProvider(value => value || result.paymentMethods[0]?.id || '');
    }).catch(() => setPaymentMethods([]));
  }, []);

  const order = async (plan: Plan) => {
    if (!paymentProvider) {
      showToast('暂时无法下单', '管理员尚未启用支付方式', 'warning');
      return;
    }
    setOrdering(plan.id);
    try {
      const data = await api<{ order: Order; payment: PaymentCheckout | null }>('/api/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id, paymentProvider }) });
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
      showToast('订单已创建', `订单号 ${data.order.orderNo}，请按账户页说明完成付款`, 'success');
      setSelectedPlan(null);
    } catch (error) {
      showToast('创建订单失败', error instanceof Error ? error.message : '请稍后重试', 'error');
    } finally {
      setOrdering('');
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
            <button onClick={() => setSelectedPlan(plan)} disabled={!paymentMethods.length} className="mt-5 h-10 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-semibold flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" />{paymentMethods.length ? '选择支付方式' : '暂无支付方式'}
            </button>
          </div>
        ))}
      </div>
      {!plans.length && <div className="py-16 text-center text-zinc-500 border border-dashed border-white/10 rounded-lg">暂无可购买套餐</div>}
      {selectedPlan && <div className="payment-dialog-backdrop" role="presentation" onMouseDown={() => !ordering && setSelectedPlan(null)}>
        <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={event => event.stopPropagation()}>
          <header><div><span>PAYMENT METHOD</span><h2 id="payment-title">选择支付方式</h2></div><button type="button" onClick={() => setSelectedPlan(null)} aria-label="关闭">×</button></header>
          <div className="payment-order-summary"><div><span>套餐</span><strong>{selectedPlan.name}</strong></div><div><span>应付金额</span><strong>{formatMoney(selectedPlan.priceCents)}</strong></div></div>
          <div className="payment-method-list">
            {paymentMethods.map(method => <label key={method.id} className={paymentProvider === method.id ? 'selected' : ''}>
              <input type="radio" name="payment-provider" value={method.id} checked={paymentProvider === method.id} onChange={() => setPaymentProvider(method.id)} />
              <span className="payment-method-icon"><CreditCard /></span>
              <span><strong>{method.name}</strong><small>{method.instructions || '创建订单后按提示完成付款'}</small></span>
              {method.paymentUrl && <a href={method.paymentUrl} target="_blank" rel="noreferrer" title="打开付款地址" onClick={event => event.stopPropagation()}><ExternalLink /></a>}
            </label>)}
          </div>
          <button className="payment-confirm" disabled={ordering === selectedPlan.id || !paymentProvider} onClick={() => void order(selectedPlan)}><ShoppingCart />{ordering === selectedPlan.id ? '正在创建订单...' : '确认创建订单'}</button>
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
