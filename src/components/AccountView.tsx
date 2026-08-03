import React from 'react';
import { AlertCircle, CheckCircle2, Clock3, Network, ReceiptText, RefreshCw, Terminal } from 'lucide-react';
import { AccountData, formatDate, formatMoney, quotaText } from '../commercial';
import { api } from '../commercial';
import { ChangePasswordForm } from './ChangePasswordForm';

interface AccountViewProps {
  account: AccountData | null;
  loading: boolean;
  onRefresh: () => void;
  onLoggedOut: () => void;
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const orderLabels: Record<string, string> = { pending: '待付款确认', paid: '已付款', expired: '已过期', cancelled: '已取消', refunded: '已退款' };
const deploymentLabels: Record<string, string> = { reserved: '已预占', running: '执行中', succeeded: '成功', failed: '失败已返还', uncertain: '结果待确认' };

export const AccountView: React.FC<AccountViewProps> = ({ account, loading, onRefresh, onLoggedOut, showToast }) => {
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
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div><h1 className="text-2xl font-bold text-white">我的账户</h1><p className="text-sm text-zinc-400 mt-1">查看订单、可用次数和搭建结果。</p></div>
        <button onClick={onRefresh} disabled={loading} title="刷新账户" className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {account?.orders.some(order => order.status === 'pending') && (
        <div className="border border-amber-500/25 bg-amber-500/10 rounded-lg p-4">
          <div className="font-semibold text-amber-200 flex items-center gap-2"><AlertCircle className="w-4 h-4" />待付款订单说明</div>
          <p className="text-sm text-amber-100/80 mt-2 whitespace-pre-wrap">{account.paymentInstructions}</p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-white">当前权益</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {account?.entitlements.map(item => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-semibold text-white">{item.planName}</h3><p className="text-xs text-zinc-500 mt-1">到期：{formatDate(item.expiresAt)}</p></div>
                <span className={`text-xs px-2 py-1 rounded ${item.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'}`}>{item.status === 'active' ? '有效' : '已停用'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-black/25 rounded-md p-3"><Terminal className="w-4 h-4 text-indigo-400 mb-2" /><div className="text-xs text-zinc-500">面板可用</div><div className="font-semibold mt-1">{quotaText(item.panelMode, item.panelRemaining, item.panelTotal)}</div></div>
                <div className="bg-black/25 rounded-md p-3"><Network className="w-4 h-4 text-emerald-400 mb-2" /><div className="text-xs text-zinc-500">节点可用</div><div className="font-semibold mt-1">{quotaText(item.nodeMode, item.nodeRemaining, item.nodeTotal)}</div></div>
              </div>
            </div>
          ))}
          {!account?.entitlements.length && <div className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-lg p-8">暂无权益，请先购买套餐。</div>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2"><ReceiptText className="w-4 h-4" />订单</h2>
        <div className="overflow-x-auto border border-white/10 rounded-lg">
          <table className="w-full text-sm min-w-[760px]"><thead className="bg-white/5 text-zinc-400"><tr><th className="text-left p-3">订单号</th><th className="text-left p-3">套餐</th><th className="text-left p-3">金额</th><th className="text-left p-3">状态</th><th className="text-left p-3">创建时间</th><th className="text-left p-3">操作</th></tr></thead>
            <tbody>{account?.orders.map(order => { const snapshot = JSON.parse(order.planSnapshot || '{}'); return <tr key={order.id} className="border-t border-white/5"><td className="p-3 font-mono text-xs">{order.orderNo}</td><td className="p-3">{snapshot.name || '-'}</td><td className="p-3">{formatMoney(order.amountCents)}</td><td className="p-3">{orderLabels[order.status] || order.status}</td><td className="p-3 text-zinc-500">{formatDate(order.createdAt)}</td><td className="p-3">{order.status === 'pending' ? <button onClick={() => void cancelOrder(order.id)} className="h-8 px-3 border border-rose-500/30 text-rose-300 rounded text-xs">取消订单</button> : '-'}</td></tr>; })}</tbody>
          </table>
          {!account?.orders.length && <div className="p-6 text-center text-zinc-500 text-sm">暂无订单</div>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2"><Clock3 className="w-4 h-4" />搭建记录</h2>
        <div className="space-y-2">{account?.deployments.slice(0, 30).map(item => (
          <div key={item.id} className="border border-white/10 rounded-md px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-3">{item.status === 'succeeded' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className={`w-4 h-4 ${item.status === 'uncertain' ? 'text-amber-400' : 'text-zinc-500'}`} />}<div><span className="text-white">{item.capability === 'panel' ? '面板安装' : '节点创建'}</span><span className="text-zinc-500 ml-2">{item.targetHostMasked || '-'}</span><div className="text-xs text-zinc-600 mt-0.5">{item.resultSummary || item.errorMessage}</div></div></div>
            <div className="text-right"><div>{deploymentLabels[item.status] || item.status}</div><div className="text-xs text-zinc-600">{formatDate(item.createdAt)}</div></div>
          </div>
        ))}{!account?.deployments.length && <div className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-lg p-8">暂无搭建记录</div>}</div>
      </section>

      <section className="space-y-3">
        <ChangePasswordForm endpoint="/api/auth/change-password" onChanged={onLoggedOut} showToast={showToast} />
      </section>
    </div>
  );
};
