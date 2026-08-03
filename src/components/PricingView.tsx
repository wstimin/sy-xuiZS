import React, { useState } from 'react';
import { Check, Clock3, Network, ShoppingCart, Terminal } from 'lucide-react';
import { api, formatMoney, Plan, quotaText } from '../commercial';

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

  const order = async (plan: Plan) => {
    setOrdering(plan.id);
    try {
      const data = await api<{ order: { orderNo: string } }>('/api/orders', { method: 'POST', body: JSON.stringify({ planId: plan.id }) });
      await onOrderCreated();
      showToast('订单已创建', `订单号 ${data.order.orderNo}，请按账户页说明完成付款`, 'success');
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
            <button onClick={() => order(plan)} disabled={ordering === plan.id} className="mt-5 h-10 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm font-semibold flex items-center justify-center gap-2">
              <ShoppingCart className="w-4 h-4" />{ordering === plan.id ? '正在下单...' : '立即下单'}
            </button>
          </div>
        ))}
      </div>
      {!plans.length && <div className="py-16 text-center text-zinc-500 border border-dashed border-white/10 rounded-lg">暂无可购买套餐</div>}
    </div>
  );
};
