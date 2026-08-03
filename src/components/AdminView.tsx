import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CreditCard, Gauge, PackagePlus, RefreshCw, Save, Settings, Shield, Users } from 'lucide-react';
import { api, DeploymentRecord, Entitlement, formatDate, formatMoney, Order, Plan, quotaText } from '../commercial';

type AdminTab = 'overview' | 'plans' | 'orders' | 'users' | 'entitlements' | 'deployments' | 'settings';
type AdminUser = { id: string; username: string; role: 'user' | 'admin'; status: 'active' | 'disabled'; createdAt: string; lastLoginAt?: string };
type Stats = { users: number; paidOrders: number; revenueCents: number; deployments: number; succeeded: number; uncertain: number };
type SystemSettings = { registrationEnabled: boolean; panelDeployEnabled: boolean; nodeDeployEnabled: boolean; paymentInstructions: string };

const emptyPlan: Omit<Plan, 'id'> = {
  name: '', description: '', priceCents: 990, durationUnit: 'days', durationValue: 7,
  panelMode: 'limited', panelLimit: 1, nodeMode: 'limited', nodeLimit: 3,
  dailyPanelLimit: 1, dailyNodeLimit: 3, concurrencyLimit: 1, enabled: true, sortOrder: 10,
};

const inputClass = 'w-full h-9 rounded-md bg-black/35 border border-white/10 px-3 text-sm outline-none focus:border-indigo-500';
const selectClass = `${inputClass} appearance-none`;

interface AdminViewProps {
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onChanged: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ showToast, onChanged }) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [settingsData, setSettingsData] = useState<SystemSettings>({ registrationEnabled: true, panelDeployEnabled: true, nodeDeployEnabled: true, paymentInstructions: '' });
  const [editingPlan, setEditingPlan] = useState<(Omit<Plan, 'id'> & { id?: string }) | null>(null);
  const [grant, setGrant] = useState({ userId: '', name: '管理员发放权益', durationUnit: 'months', durationValue: 1, panelMode: 'limited', panelLimit: 1, nodeMode: 'limited', nodeLimit: 5, dailyPanelLimit: 1, dailyNodeLimit: 5, concurrencyLimit: 1 });

  const load = async () => {
    setLoading(true);
    try {
      const [statsResult, plansResult, ordersResult, usersResult, entitlementResult, deploymentResult, settingsResult] = await Promise.all([
        api<{ stats: Stats }>('/api/admin/stats'),
        api<{ plans: Plan[] }>('/api/admin/plans'),
        api<{ orders: Order[] }>('/api/admin/orders'),
        api<{ users: AdminUser[] }>('/api/admin/users'),
        api<{ entitlements: Entitlement[] }>('/api/admin/entitlements'),
        api<{ deployments: DeploymentRecord[] }>('/api/admin/deployments'),
        api<{ settings: SystemSettings }>('/api/admin/settings'),
      ]);
      setStats(statsResult.stats); setPlans(plansResult.plans); setOrders(ordersResult.orders); setUsers(usersResult.users);
      setEntitlements(entitlementResult.entitlements); setDeployments(deploymentResult.deployments); setSettingsData(settingsResult.settings);
      if (!grant.userId && usersResult.users.length) setGrant(value => ({ ...value, userId: usersResult.users.find(user => user.role === 'user')?.id || usersResult.users[0].id }));
    } catch (error) {
      showToast('管理数据加载失败', error instanceof Error ? error.message : '请刷新重试', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const request = async (title: string, url: string, options: RequestInit) => {
    try {
      await api(url, options);
      await load();
      await onChanged();
      showToast(title, '操作已生效', 'success');
    } catch (error) { showToast('操作失败', error instanceof Error ? error.message : '请稍后重试', 'error'); }
  };

  const savePlan = async () => {
    if (!editingPlan) return;
    const url = editingPlan.id ? `/api/admin/plans/${editingPlan.id}` : '/api/admin/plans';
    await request('套餐已保存', url, { method: editingPlan.id ? 'PUT' : 'POST', body: JSON.stringify(editingPlan) });
    setEditingPlan(null);
  };

  const saveSettings = () => request('系统设置已保存', '/api/admin/settings', { method: 'PUT', body: JSON.stringify(settingsData) });
  const pendingOrders = useMemo(() => orders.filter(order => order.status === 'pending'), [orders]);
  const tabs: Array<[AdminTab, string]> = [['overview', '概览'], ['plans', '套餐'], ['orders', '订单'], ['users', '用户'], ['entitlements', '权益'], ['deployments', '搭建任务'], ['settings', '设置']];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-2"><Shield className="w-6 h-6 text-indigo-400" />管理端</h1><p className="text-sm text-zinc-400 mt-1">套餐、收款、用户权益和搭建任务。</p></div>
        <button onClick={() => void load()} disabled={loading} title="刷新管理数据" className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 pb-2">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`px-3 py-2 rounded-md text-sm whitespace-nowrap ${tab === value ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:bg-white/5'}`}>{label}</button>)}</div>

      {tab === 'overview' && <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{[
          ['用户', stats?.users || 0], ['已付款订单', stats?.paidOrders || 0], ['收入', formatMoney(stats?.revenueCents || 0)], ['搭建任务', stats?.deployments || 0], ['成功', stats?.succeeded || 0], ['待确认', stats?.uncertain || 0],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/[0.035] p-4"><div className="text-xs text-zinc-500">{label}</div><div className="text-xl font-bold text-white mt-2">{value}</div></div>)}</div>
        <div className="grid md:grid-cols-2 gap-4"><div className="border border-white/10 rounded-lg p-4"><h2 className="font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4 text-amber-400" />待确认订单</h2><div className="text-3xl font-bold mt-4">{pendingOrders.length}</div><button onClick={() => setTab('orders')} className="mt-4 text-sm text-indigo-300">查看并确认收款</button></div><div className="border border-white/10 rounded-lg p-4"><h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />结果不确定任务</h2><div className="text-3xl font-bold mt-4">{deployments.filter(item => item.status === 'uncertain').length}</div><button onClick={() => setTab('deployments')} className="mt-4 text-sm text-indigo-300">人工核对处理</button></div></div>
      </div>}

      {tab === 'plans' && <div className="space-y-4">
        <div className="flex justify-end"><button onClick={() => setEditingPlan({ ...emptyPlan })} className="h-9 px-3 rounded-md bg-indigo-600 text-sm flex items-center gap-2"><PackagePlus className="w-4 h-4" />新增套餐</button></div>
        {editingPlan && <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-lg p-4 space-y-4">
          <div className="font-semibold">{editingPlan.id ? '编辑套餐' : '新增套餐'}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-zinc-400">名称<input className={`${inputClass} mt-1`} value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} /></label>
            <label className="text-xs text-zinc-400">价格（元）<input type="number" step="0.01" className={`${inputClass} mt-1`} value={editingPlan.priceCents / 100} onChange={e => setEditingPlan({ ...editingPlan, priceCents: Math.round(Number(e.target.value) * 100) })} /></label>
            <label className="text-xs text-zinc-400">有效期单位<select className={`${selectClass} mt-1`} value={editingPlan.durationUnit} onChange={e => setEditingPlan({ ...editingPlan, durationUnit: e.target.value as Plan['durationUnit'] })}><option value="days">天</option><option value="months">月</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
            <label className="text-xs text-zinc-400">有效期数值<input type="number" className={`${inputClass} mt-1`} value={editingPlan.durationValue} disabled={editingPlan.durationUnit === 'lifetime'} onChange={e => setEditingPlan({ ...editingPlan, durationValue: Number(e.target.value) })} /></label>
          </div>
          <label className="block text-xs text-zinc-400">说明<input className={`${inputClass} mt-1`} value={editingPlan.description} onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })} /></label>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="text-xs text-zinc-400">面板权益<select className={`${selectClass} mt-1`} value={editingPlan.panelMode} onChange={e => setEditingPlan({ ...editingPlan, panelMode: e.target.value as Plan['panelMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
            <label className="text-xs text-zinc-400">面板总次数<input type="number" className={`${inputClass} mt-1`} disabled={editingPlan.panelMode !== 'limited'} value={editingPlan.panelLimit} onChange={e => setEditingPlan({ ...editingPlan, panelLimit: Number(e.target.value) })} /></label>
            <label className="text-xs text-zinc-400">节点权益<select className={`${selectClass} mt-1`} value={editingPlan.nodeMode} onChange={e => setEditingPlan({ ...editingPlan, nodeMode: e.target.value as Plan['nodeMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
            <label className="text-xs text-zinc-400">节点总次数<input type="number" className={`${inputClass} mt-1`} disabled={editingPlan.nodeMode !== 'limited'} value={editingPlan.nodeLimit} onChange={e => setEditingPlan({ ...editingPlan, nodeLimit: Number(e.target.value) })} /></label>
            <label className="text-xs text-zinc-400">每日面板上限<input type="number" className={`${inputClass} mt-1`} value={editingPlan.dailyPanelLimit} onChange={e => setEditingPlan({ ...editingPlan, dailyPanelLimit: Number(e.target.value) })} /></label>
            <label className="text-xs text-zinc-400">每日节点上限<input type="number" className={`${inputClass} mt-1`} value={editingPlan.dailyNodeLimit} onChange={e => setEditingPlan({ ...editingPlan, dailyNodeLimit: Number(e.target.value) })} /></label>
            <label className="text-xs text-zinc-400">并发上限<input type="number" className={`${inputClass} mt-1`} value={editingPlan.concurrencyLimit} onChange={e => setEditingPlan({ ...editingPlan, concurrencyLimit: Number(e.target.value) })} /></label>
            <label className="text-xs text-zinc-400">排序<input type="number" className={`${inputClass} mt-1`} value={editingPlan.sortOrder} onChange={e => setEditingPlan({ ...editingPlan, sortOrder: Number(e.target.value) })} /></label>
          </div>
          <div className="flex items-center justify-between"><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={editingPlan.enabled} onChange={e => setEditingPlan({ ...editingPlan, enabled: e.target.checked })} />上架套餐</label><div className="flex gap-2"><button onClick={() => setEditingPlan(null)} className="h-9 px-3 border border-white/10 rounded-md text-sm">取消</button><button onClick={() => void savePlan()} className="h-9 px-3 bg-indigo-600 rounded-md text-sm flex items-center gap-2"><Save className="w-4 h-4" />保存</button></div></div>
        </div>}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{plans.map(plan => <div key={plan.id} className="border border-white/10 rounded-lg p-4"><div className="flex justify-between"><div><h3 className="font-semibold">{plan.name}</h3><div className="text-2xl font-bold mt-2">{formatMoney(plan.priceCents)}</div></div><span className={`text-xs h-fit px-2 py-1 rounded ${plan.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-500/15 text-zinc-400'}`}>{plan.enabled ? '已上架' : '已下架'}</span></div><div className="text-sm text-zinc-400 mt-4 space-y-1"><div>面板：{quotaText(plan.panelMode, plan.panelLimit)}</div><div>节点：{quotaText(plan.nodeMode, plan.nodeLimit)}</div><div>每日限制：面板 {plan.dailyPanelLimit || '不限'} / 节点 {plan.dailyNodeLimit || '不限'}</div></div><button onClick={() => setEditingPlan({ ...plan })} className="mt-4 text-sm text-indigo-300">编辑套餐</button></div>)}</div>
      </div>}

      {tab === 'orders' && <DataTable headers={['订单号', '用户', '金额', '状态', '创建时间', '操作']} rows={orders.map(order => [order.orderNo, order.username || '-', formatMoney(order.amountCents), order.status === 'pending' ? '待确认' : order.status === 'paid' ? '已付款' : order.status, formatDate(order.createdAt), order.status === 'pending' ? <button onClick={() => void request('订单已确认收款', `/api/admin/orders/${order.id}/mark-paid`, { method: 'POST', body: JSON.stringify({}) })} className="h-8 px-3 bg-emerald-600 rounded text-xs">确认收款</button> : '-'])} />}

      {tab === 'users' && <DataTable headers={['用户名', '角色', '状态', '注册时间', '操作']} rows={users.map(user => [user.username, user.role === 'admin' ? '管理员' : '用户', user.status === 'active' ? '正常' : '禁用', formatDate(user.createdAt), <button onClick={() => void request(user.status === 'active' ? '用户已禁用' : '用户已启用', `/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ status: user.status === 'active' ? 'disabled' : 'active' }) })} className="h-8 px-3 border border-white/10 rounded text-xs">{user.status === 'active' ? '禁用' : '启用'}</button>])} />}

      {tab === 'entitlements' && <div className="space-y-5">
        <div className="border border-white/10 rounded-lg p-4 space-y-3"><h2 className="font-semibold">手工发放权益</h2><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-zinc-400">用户<select className={`${selectClass} mt-1`} value={grant.userId} onChange={e => setGrant({ ...grant, userId: e.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
          <label className="text-xs text-zinc-400">权益名称<input className={`${inputClass} mt-1`} value={grant.name} onChange={e => setGrant({ ...grant, name: e.target.value })} /></label>
          <label className="text-xs text-zinc-400">有效期<select className={`${selectClass} mt-1`} value={grant.durationUnit} onChange={e => setGrant({ ...grant, durationUnit: e.target.value })}><option value="days">天</option><option value="months">月</option><option value="years">年</option><option value="lifetime">永久</option></select></label>
          <label className="text-xs text-zinc-400">有效期数值<input type="number" className={`${inputClass} mt-1`} value={grant.durationValue} onChange={e => setGrant({ ...grant, durationValue: Number(e.target.value) })} /></label>
          <label className="text-xs text-zinc-400">面板模式<select className={`${selectClass} mt-1`} value={grant.panelMode} onChange={e => setGrant({ ...grant, panelMode: e.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
          <label className="text-xs text-zinc-400">面板次数<input type="number" className={`${inputClass} mt-1`} value={grant.panelLimit} onChange={e => setGrant({ ...grant, panelLimit: Number(e.target.value) })} /></label>
          <label className="text-xs text-zinc-400">节点模式<select className={`${selectClass} mt-1`} value={grant.nodeMode} onChange={e => setGrant({ ...grant, nodeMode: e.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option><option value="unlimited">不限次数</option></select></label>
          <label className="text-xs text-zinc-400">节点次数<input type="number" className={`${inputClass} mt-1`} value={grant.nodeLimit} onChange={e => setGrant({ ...grant, nodeLimit: Number(e.target.value) })} /></label>
          <label className="text-xs text-zinc-400">每日面板上限<input type="number" className={`${inputClass} mt-1`} value={grant.dailyPanelLimit} onChange={e => setGrant({ ...grant, dailyPanelLimit: Number(e.target.value) })} /></label>
          <label className="text-xs text-zinc-400">每日节点上限<input type="number" className={`${inputClass} mt-1`} value={grant.dailyNodeLimit} onChange={e => setGrant({ ...grant, dailyNodeLimit: Number(e.target.value) })} /></label>
          <label className="text-xs text-zinc-400">并发上限<input type="number" className={`${inputClass} mt-1`} value={grant.concurrencyLimit} onChange={e => setGrant({ ...grant, concurrencyLimit: Number(e.target.value) })} /></label>
        </div><button onClick={() => void request('权益已发放', '/api/admin/entitlements', { method: 'POST', body: JSON.stringify(grant) })} className="h-9 px-3 bg-indigo-600 rounded-md text-sm">发放权益</button></div>
        <DataTable headers={['用户', '权益', '面板剩余', '节点剩余', '到期时间', '状态', '操作']} rows={entitlements.map(item => [item.username || '-', item.planName, quotaText(item.panelMode, item.panelRemaining), quotaText(item.nodeMode, item.nodeRemaining), formatDate(item.expiresAt), item.status, <button onClick={() => void request('权益状态已更新', `/api/admin/entitlements/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: item.status === 'active' ? 'revoked' : 'active' }) })} className="h-8 px-3 border border-white/10 rounded text-xs">{item.status === 'active' ? '停用' : '启用'}</button>])} />
      </div>}

      {tab === 'deployments' && <DataTable headers={['用户', '类型', '目标', '状态', '时间', '说明', '操作']} rows={deployments.map(item => [item.username || '-', item.capability === 'panel' ? '面板' : '节点', item.targetHostMasked || '-', item.status, formatDate(item.createdAt), item.resultSummary || item.errorMessage || '-', item.status === 'uncertain' ? <div className="flex gap-2"><button onClick={() => void request('任务已按成功核销', `/api/admin/deployments/${item.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: 'succeeded' }) })} className="h-8 px-2 bg-emerald-600 rounded text-xs">确认成功</button><button onClick={() => void request('任务已按失败返还', `/api/admin/deployments/${item.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: 'failed' }) })} className="h-8 px-2 bg-rose-600 rounded text-xs">确认失败</button></div> : '-'])} />}

      {tab === 'settings' && <div className="max-w-2xl border border-white/10 rounded-lg p-5 space-y-5"><h2 className="font-semibold flex items-center gap-2"><Settings className="w-4 h-4" />系统开关</h2>{[
        ['registrationEnabled', '允许新用户注册'], ['panelDeployEnabled', '允许执行面板搭建'], ['nodeDeployEnabled', '允许执行节点搭建'],
      ].map(([key, label]) => <label key={key} className="flex items-center justify-between border-b border-white/5 pb-3 text-sm"><span>{label}</span><input type="checkbox" checked={Boolean(settingsData[key as keyof SystemSettings])} onChange={e => setSettingsData({ ...settingsData, [key]: e.target.checked })} /></label>)}<label className="block text-sm">付款说明<textarea className="mt-2 w-full min-h-28 rounded-md bg-black/35 border border-white/10 p-3 outline-none focus:border-indigo-500" value={settingsData.paymentInstructions} onChange={e => setSettingsData({ ...settingsData, paymentInstructions: e.target.value })} /></label><button onClick={() => void saveSettings()} className="h-9 px-4 bg-indigo-600 rounded-md text-sm flex items-center gap-2"><Save className="w-4 h-4" />保存设置</button></div>}
    </div>
  );
};

const DataTable: React.FC<{ headers: string[]; rows: React.ReactNode[][] }> = ({ headers, rows }) => <div className="overflow-x-auto border border-white/10 rounded-lg"><table className="w-full min-w-[800px] text-sm"><thead className="bg-white/5 text-zinc-400"><tr>{headers.map(header => <th key={header} className="p-3 text-left font-medium">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-white/5">{row.map((cell, cellIndex) => <td key={cellIndex} className="p-3 align-top">{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="p-8 text-center text-zinc-500 text-sm">暂无数据</div>}</div>;
