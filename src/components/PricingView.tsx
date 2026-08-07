import React, { useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, KeyRound, Network, ShoppingCart, Terminal } from 'lucide-react';
import { api, formatMoney, Order, Plan, quotaText } from '../commercial';

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
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCodePurchaseUrl, setRedeemCodePurchaseUrl] = useState('');

  useEffect(() => {
    api<{ redeemCodePurchaseUrl: string }>('/api/payment-methods').then(result => {
      setRedeemCodePurchaseUrl(result.redeemCodePurchaseUrl || '');
    }).catch(() => setRedeemCodePurchaseUrl(''));
  }, []);

  const openPurchase = (plan: Plan) => {
    setRedeemCode('');
    setSelectedPlan(plan);
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
              <KeyRound className="w-4 h-4" />购买卡密 / 兑换
            </button>
          </div>
        ))}
      </div>
      {!plans.length && <div className="py-16 text-center text-zinc-500 border border-dashed border-white/10 rounded-lg">暂无可购买套餐</div>}
      {selectedPlan && <div className="payment-dialog-backdrop" role="presentation" onMouseDown={() => !redeeming && setSelectedPlan(null)}>
        <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={event => event.stopPropagation()}>
          <header><div><span>REDEEM CODE</span><h2 id="payment-title">卡密兑换</h2></div><button type="button" disabled={redeeming} onClick={() => setSelectedPlan(null)} aria-label="关闭">×</button></header>
          <div className="payment-order-summary"><div><span>兑换套餐</span><strong>{selectedPlan.name}</strong></div><div><span>卡密价格</span><strong>{formatMoney(selectedPlan.priceCents)}</strong></div></div>
          <div className="payment-redeem-panel">
            {redeemCodePurchaseUrl && <a className="payment-redeem-purchase" href={redeemCodePurchaseUrl} target="_blank" rel="noreferrer"><ShoppingCart /><span><strong>立即购买卡密</strong><small>前往卡密购买页面，购买后返回此处兑换</small></span><ExternalLink /></a>}
            <label htmlFor="redeem-code"><span>套餐卡密</span><div><KeyRound /><input id="redeem-code" value={redeemCode} onChange={event => setRedeemCode(event.target.value.toUpperCase())} maxLength={40} autoComplete="off" placeholder="XUI-XXXX-XXXX-XXXX-XXXX" /></div><small>卡密必须与当前选择的“{selectedPlan.name}”套餐一致，兑换成功后自动生成已支付订单。</small></label>
            <div className="payment-redeem-actions">
              <button type="button" disabled={redeeming || !redeemCode.trim()} onClick={() => void redeem(selectedPlan)}><KeyRound />{redeeming ? '正在兑换...' : '兑换并创建订单'}</button>
            </div>
          </div>
        </section>
      </div>}
    </div>
  );
};
