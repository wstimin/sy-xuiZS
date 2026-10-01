import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BadgeCheck,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardCheck,
  ClipboardCopy,
  CheckCircle2,
  CreditCard,
  CircleGauge,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileClock,
  FileText,
  Headphones,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Network,
  PackagePlus,
  Pencil,
  PowerOff,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  AdminExceptions,
  ContactMethod,
  DeploymentRecord,
  Entitlement,
  formatDate,
  formatMoney,
  Order,
  OrderDetail,
  PaymentCheckResult,
  PaymentMethod,
  PaymentProvider,
  Plan,
  ResourceRecommendation,
  quotaText,
} from '../../commercial';
import { NumberInput } from '../NumberInput';
import { AdminDialog } from './AdminDialog';
import {
  AdminTab,
  AdminUser,
  AuditLog,
  contactTypeLabels,
  emptyGrant,
  LEGACY_TOKENPAY_CURRENCIES,
  MGATE_CURRENCIES,
  Stats,
  TOKENPAY_CURRENCIES,
  UsageLedgerEntry,
} from './adminModel';
import {
  defaultPaymentCurrency,
  EPAY_CHANNEL_OPTIONS,
  durationText,
  isLegacyTokenPayCurrency,
  legacyPaymentType,
  parsePlanSnapshot,
  paymentProvider,
  paymentProviderName,
  tokenPayCurrency,
} from './adminUtils';

export const Dashboard: React.FC<{
  stats: Stats | null;
  exceptions: AdminExceptions;
  orders: Order[];
  deployments: DeploymentRecord[];
  onNavigate: (tab: AdminTab) => void;
  onOpenOrder: (order: Order) => void;
  onOpenDeployment: (deployment: DeploymentRecord) => void;
}> = ({ stats, exceptions, orders, deployments, onNavigate, onOpenOrder, onOpenDeployment }) => {
  const successRate = stats?.deployments ? Math.round((stats.succeeded / stats.deployments) * 100) : 0;
  const recentOrders = orders.slice(0, 5);
  const recentDeployments = deployments.slice(0, 5);
  return <div className="ops-dashboard">
    <header className="ops-dashboard-heading"><div><span className="ops-kicker">运营中枢 · 实时视图</span><h2>今天的业务，正在发生什么</h2><p>从收入、权益到交付任务，先看需要动作的事项，再查看整体经营状态。</p></div><span className="ops-live"><i /> 数据已同步</span></header>
    <div className="ops-health-strip"><div><span className="ops-health-icon"><CircleGauge /></span><div><strong>业务健康度</strong><p>支付、权益与交付链路的当前运行摘要</p></div></div><small>数据来自当前业务数据库</small></div>
    <div className="ops-stat-grid">
      <Stat icon={Users} label="用户总数" value={stats?.users || 0} detail={`${stats?.activeUsers || 0} 正常 / ${stats?.disabledUsers || 0} 禁用`} tone="cyan" />
      <Stat icon={CircleDollarSign} label="实际收入" value={formatMoney(stats?.revenueCents || 0)} detail={`${stats?.paidOrders || 0} 笔已付款订单`} tone="green" />
      <Stat icon={BadgeCheck} label="有效权益" value={stats?.activeEntitlements || 0} detail={`${stats?.expiredEntitlements || 0} 过期 / ${stats?.revokedEntitlements || 0} 撤销`} tone="indigo" />
      <Stat icon={Network} label="交付成功率" value={`${successRate}%`} detail={`${stats?.succeeded || 0} 成功 / ${stats?.failed || 0} 失败`} tone="amber" />
    </div>
    <div className="ops-attention-grid">
      <button type="button" onClick={() => onNavigate('orders')}><span className="ops-attention-icon amber"><FileClock /></span><div><strong>{stats?.pendingOrders || 0}</strong><small>待确认付款订单</small></div><ChevronRight /></button>
      <button type="button" onClick={() => onNavigate('deployments')}><span className="ops-attention-icon rose"><ClipboardCheck /></span><div><strong>{stats?.uncertain || 0}</strong><small>待人工核对任务</small></div><ChevronRight /></button>
      <button type="button" onClick={() => onNavigate('deployments')}><span className="ops-attention-icon cyan"><Activity /></span><div><strong>{stats?.running || 0}</strong><small>正在执行的任务</small></div><ChevronRight /></button>
    </div>
    <section className={`ops-exception-center ${exceptions.summary.total ? 'has-exceptions' : 'clear'}`}>
      <header><div><span className="ops-exception-icon"><AlertTriangle /></span><div><h3>待处理事项</h3><p>自动汇总支付、权益发放和搭建任务中需要人工处理的问题。</p></div></div><div className="ops-exception-count"><b>{exceptions.summary.total}</b><span><strong>{exceptions.summary.critical}</strong> 紧急 · <strong>{exceptions.summary.warning}</strong> 提醒</span></div></header>
      <div className="ops-exception-list">
        {exceptions.items.slice(0, 8).map(item => <button type="button" key={item.id} className={item.severity} onClick={() => item.order ? onOpenOrder(item.order) : item.deployment ? onOpenDeployment(item.deployment) : onNavigate(item.targetType === 'order' ? 'orders' : 'deployments')}>
          <span>{item.severity === 'danger' ? <AlertTriangle /> : <Clock3 />}</span><div><strong>{item.title}</strong><p>{item.description}</p><small>{formatDate(item.createdAt)}</small></div><ChevronRight />
        </button>)}
        {!exceptions.items.length && <div className="ops-exception-empty"><CheckCircle2 /><div><strong>当前没有业务异常</strong><span>支付、权益和交付任务状态均未发现需要人工处理的问题。</span></div></div>}
      </div>
    </section>
    <div className="ops-feed-grid">
      <section className="ops-feed-panel"><header><div><span>流水</span><h3>最近订单</h3><p>按创建时间倒序</p></div><button onClick={() => onNavigate('orders')}>查看全部 <ChevronRight /></button></header><div className="ops-feed-list">{recentOrders.map(order => <div key={order.id}><span className="ops-feed-icon"><CreditCard /></span><div><strong>{order.username || '-'}</strong><small>{order.orderNo}</small></div><div className="ops-feed-value"><strong>{formatMoney(order.amountCents)}</strong><StatusBadge status={order.status} /></div></div>)}{!recentOrders.length && <EmptyInline text="暂无订单" />}</div></section>
      <section className="ops-feed-panel"><header><div><span>交付</span><h3>最近交付任务</h3><p>面板安装与节点创建记录</p></div><button onClick={() => onNavigate('deployments')}>查看全部 <ChevronRight /></button></header><div className="ops-feed-list">{recentDeployments.map(item => <div key={item.id}><span className="ops-feed-icon"><Network /></span><div><strong>{item.username || '-'}</strong><small>{item.capability === 'panel' ? '面板安装' : '节点创建'} · {item.targetHostMasked || '-'}</small></div><div className="ops-feed-value"><StatusBadge status={item.status} /><small>{formatDate(item.createdAt)}</small></div></div>)}{!recentDeployments.length && <EmptyInline text="暂无交付任务" />}</div></section>
    </div>
  </div>;
};

export const DiagnosisBadge: React.FC<{ diagnosis: OrderDetail['diagnosis'] }> = ({ diagnosis }) => <span className={`admin-diagnosis-badge ${diagnosis.severity}`} title={diagnosis.recommendedAction}><i />{diagnosis.processingLabel}</span>;

type AdminToolbarProps = { query: string; onQuery: (value: string) => void; placeholder: string; filter: string; onFilter: (value: string) => void; options: Array<[string, string]>; action?: React.ReactNode };

export const AdminSection: React.FC<{ title: string; description: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, description, action, children }) => {
  return <section className="enterprise-module">
    <header className="enterprise-module-head"><div><span>业务模块</span><h2>{title}</h2><p>{description}</p></div>{action && <div className="enterprise-module-actions">{action}</div>}</header>
    <div className="enterprise-module-body">{children}</div>
  </section>;
};
export const AdminToolbar: React.FC<AdminToolbarProps> = ({ query, onQuery, placeholder, filter, onFilter, options, action }) => <div className="ops-toolbar"><label className="ops-search"><Search /><input value={query} onChange={event => onQuery(event.target.value)} placeholder={placeholder} />{query && <button type="button" title="清除搜索" onClick={() => onQuery('')}><X /></button>}</label><div className="ops-toolbar-right"><div className="ops-filter-buttons" aria-label="状态筛选">{options.map(([value, label]) => <button type="button" key={value} className={`ops-filter-button ${filter === value ? 'active' : ''}`} aria-pressed={filter === value} onClick={() => onFilter(value)}>{label}</button>)}</div>{(query || filter !== 'all') && <button type="button" className="ops-toolbar-clear" onClick={() => { onQuery(''); onFilter('all'); }}><X /> 清理</button>}{action && <div className="ops-toolbar-actions">{action}</div>}</div></div>;
export const AdminTable: React.FC<{ columns: string[]; empty: string; children: React.ReactNode }> = ({ columns, empty, children }) => <div className="ops-table-wrap"><table className="ops-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{children}</tbody></table>{React.Children.count(children) === 0 && <div className="ops-table-empty"><Search /><strong>{empty}</strong><span>调整搜索词或筛选条件后再试。</span></div>}</div>;
export const Pagination: React.FC<{ total: number; page: number; pageCount: number; onPage: (page: number) => void }> = ({ total, page, pageCount, onPage }) => {
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(item => item === 1 || item === pageCount || Math.abs(item - page) <= 1);
  return <div className="ops-pagination"><span>共 <strong>{total}</strong> 条记录</span><div className="ops-page-buttons"><button className="admin-icon-button small" disabled={page <= 1} onClick={() => onPage(page - 1)} title="上一页"><ChevronLeft /></button>{pages.map((item, index) => <React.Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span className="ops-page-gap">...</span>}<button type="button" className={`ops-page-number ${item === page ? 'active' : ''}`} aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>{item}</button></React.Fragment>)}<button className="admin-icon-button small" disabled={page >= pageCount} onClick={() => onPage(page + 1)} title="下一页"><ChevronRight /></button></div></div>;
};
export const Stat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; detail: string; tone: string }> = ({ icon: Icon, label, value, detail, tone }) => <div className={`ops-stat ${tone}`}><div className="ops-stat-head"><span className="ops-stat-icon"><Icon /></span><span className="ops-stat-signal"><i /> 实时</span></div><strong>{value}</strong><small>{label}</small><p>{detail}</p></div>;
export const EmptyInline: React.FC<{ text: string }> = ({ text }) => <div className="admin-empty-inline">{text}</div>;
export const AdminPageLoading = () => <div className="admin-page-loading"><RefreshCw /><p>正在读取管理数据...</p></div>;
export const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => <section className="admin-detail-block"><header><FileText /><h3>{title}</h3></header>{children}</section>;
export const DetailItem: React.FC<{ label: string; value: React.ReactNode; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => <div className={`admin-detail-item ${mono ? 'mono' : ''} ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
export const PayloadDetails: React.FC<{ payload: string; label: string }> = ({ payload, label }) => {
  let formatted = payload || '{}';
  try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch { /* Preserve non-JSON gateway responses. */ }
  return <details className="admin-payload-details"><summary>{label}</summary><pre>{formatted}</pre></details>;
};
export const PlanSnapshotDetails: React.FC<{ order: Order }> = ({ order }) => {
  const snapshot = parsePlanSnapshot(order);
  return <div className="admin-detail-grid"><DetailItem label="套餐名称" value={String(snapshot.name || '套餐快照')} /><DetailItem label="套餐说明" value={String(snapshot.description || '无')} /><DetailItem label="面板额度" value={snapshot.panelMode === 'unlimited' ? '不限次数' : snapshot.panelMode === 'none' ? '不包含' : `${Number(snapshot.panelLimit || 0)} 次`} /><DetailItem label="节点额度" value={snapshot.nodeMode === 'unlimited' ? '不限次数' : snapshot.nodeMode === 'none' ? '不包含' : `${Number(snapshot.nodeLimit || 0)} 次`} /><DetailItem label="并发任务上限" value={Number(snapshot.concurrencyLimit || 1)} /><DetailItem label="有效期" value="永久有效" /></div>;
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const labels: Record<string, string> = { created: '已创建', pending: '待确认', paid: '已付款', failed: '失败', closed: '已关闭', accepted: '已验收', rejected: '已拒绝', refunded: '已退款', cancelled: '已取消', expired: '已过期', active: '正常', redeemed: '已兑换', disabled: '已禁用', admin: '管理员', user: '普通用户', enabled: '已上架', revoked: '已撤销', reserved: '已预约', running: '执行中', succeeded: '成功', uncertain: '待核对', grant: '发放', reserve: '冻结', consume: '核销', release: '返还', adjust: '调额', panel: '面板', node: '节点', plan: '套餐', order: '订单', entitlement: '权益', deployment: '交付任务', redeem_code: '卡密', settings: '系统设置', commercial: '系统设置', manual: '支付方式', payment: '支付方式' };
  return <span className={`admin-status ${status}`}>{labels[status] || status}</span>;
};

export const SettingSwitch: React.FC<{ label: string; description: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, description, checked, onChange }) => <div className="admin-setting-row"><div><strong>{label}</strong><p>{description}</p></div><div className="admin-setting-toggle"><b className={checked ? 'enabled' : 'disabled'}>{checked ? '已启用' : '未启用'}</b><button type="button" role="switch" aria-label={`${checked ? '停用' : '启用'}${label}`} aria-checked={checked} className={`admin-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div></div>;

export const PlanDialog: React.FC<{ plan: (Omit<Plan, 'id'> & { id?: string }) | null; busy: boolean; onChange: (plan: (Omit<Plan, 'id'> & { id?: string }) | null) => void; onClose: () => void; onSave: () => void }> = ({ plan, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(plan)} title={plan?.id ? '编辑套餐' : '新增套餐'} description="套餐按金额购买，权益永久有效，只按面板和节点剩余次数核销。" confirmLabel="保存套餐" busy={busy} confirmDisabled={!plan?.name.trim()} onClose={onClose} onConfirm={onSave}>{plan && <div className="admin-form-grid">
  <label className="admin-field"><span>套餐名称</span><input value={plan.name} onChange={event => onChange({ ...plan, name: event.target.value })} maxLength={80} /></label>
  <label className="admin-field"><span>价格（元）</span><NumberInput min="0" step="0.01" value={plan.priceCents / 100} onValueChange={price => onChange({ ...plan, priceCents: Math.round(price * 100) })} /></label>
  <label className="admin-field span-2"><span>套餐说明</span><input value={plan.description} onChange={event => onChange({ ...plan, description: event.target.value })} maxLength={300} /></label>
  <div className="admin-form-context span-2"><strong>永久次数套餐</strong><span>购买后不会过期，只要还有剩余次数就可以使用。</span></div>
  <label className="admin-field"><span>面板权益</span><select value={plan.panelMode} onChange={event => onChange({ ...plan, panelMode: event.target.value as Plan['panelMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option></select></label>
  <label className="admin-field"><span>面板总次数</span><NumberInput min="0" disabled={plan.panelMode !== 'limited'} value={plan.panelLimit} onValueChange={panelLimit => onChange({ ...plan, panelLimit })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={plan.nodeMode} onChange={event => onChange({ ...plan, nodeMode: event.target.value as Plan['nodeMode'] })}><option value="none">不包含</option><option value="limited">限制次数</option></select></label>
  <label className="admin-field"><span>节点总次数</span><NumberInput min="0" disabled={plan.nodeMode !== 'limited'} value={plan.nodeLimit} onValueChange={nodeLimit => onChange({ ...plan, nodeLimit })} /></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={plan.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...plan, concurrencyLimit })} /></label>
  <label className="admin-field"><span>显示排序</span><NumberInput value={plan.sortOrder} onValueChange={sortOrder => onChange({ ...plan, sortOrder })} /></label>
  <label className="admin-checkbox span-2"><input type="checkbox" checked={plan.homepageVisible} onChange={event => onChange({ ...plan, homepageVisible: event.target.checked })} /><span><strong>在官网首页展示此套餐</strong><small>此开关只控制官网套餐区域；套餐仍需上架后才会显示并可购买。</small></span></label>
  <label className="admin-checkbox span-2"><input type="checkbox" checked={plan.enabled} onChange={event => onChange({ ...plan, enabled: event.target.checked })} /><span><strong>在用户端上架此套餐</strong><small>下架后不能新建订单，已有订单和权益不受影响。</small></span></label>
</div>}</AdminDialog>;

export const GrantDialog: React.FC<{ open: boolean; busy: boolean; users: AdminUser[]; value: typeof emptyGrant; onChange: (value: typeof emptyGrant) => void; onClose: () => void; onSave: () => void }> = ({ open, busy, users, value, onChange, onClose, onSave }) => <AdminDialog open={open} title="手工发放权益" description="直接为指定用户创建永久次数权益，不会创建订单或收入记录。" confirmLabel="确认发放权益" tone="success" busy={busy} confirmDisabled={!value.userId || !value.name.trim()} onClose={onClose} onConfirm={onSave}><div className="admin-form-grid">
  <label className="admin-field"><span>用户</span><select value={value.userId} onChange={event => onChange({ ...value, userId: event.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}</select></label>
  <label className="admin-field"><span>权益名称</span><input value={value.name} onChange={event => onChange({ ...value, name: event.target.value })} maxLength={80} /></label>
  <div className="admin-form-context span-2"><strong>永久有效</strong><span>只按剩余次数核销。</span></div>
  <label className="admin-field"><span>面板权益</span><select value={value.panelMode} onChange={event => onChange({ ...value, panelMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option></select></label>
  <label className="admin-field"><span>面板次数</span><NumberInput min="0" disabled={value.panelMode !== 'limited'} value={value.panelLimit} onValueChange={panelLimit => onChange({ ...value, panelLimit })} /></label>
  <label className="admin-field"><span>节点权益</span><select value={value.nodeMode} onChange={event => onChange({ ...value, nodeMode: event.target.value })}><option value="none">不包含</option><option value="limited">限制次数</option></select></label>
  <label className="admin-field"><span>节点次数</span><NumberInput min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeLimit} onValueChange={nodeLimit => onChange({ ...value, nodeLimit })} /></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={value.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...value, concurrencyLimit })} /></label>
</div></AdminDialog>;

export const QuotaDialog: React.FC<{ value: Entitlement | null; busy: boolean; onChange: (value: Entitlement | null) => void; onClose: () => void; onSave: () => void }> = ({ value, busy, onChange, onClose, onSave }) => <AdminDialog open={Boolean(value)} title="调整权益额度" description="修改剩余次数时，系统会保留已使用和已冻结数量；权益永久有效且不设每日上限。" confirmLabel="保存额度调整" busy={busy} onClose={onClose} onConfirm={onSave}>{value && <div className="admin-form-grid">
  <div className="admin-form-context span-2"><strong>{value.username}</strong><span>{value.planName}</span></div>
  <label className="admin-field"><span>面板剩余次数</span><NumberInput min="0" disabled={value.panelMode !== 'limited'} value={value.panelRemaining} onValueChange={panelRemaining => onChange({ ...value, panelRemaining })} /><small>{value.panelMode === 'limited' ? `已用 ${value.panelUsed}，冻结 ${value.panelReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>节点剩余次数</span><NumberInput min="0" disabled={value.nodeMode !== 'limited'} value={value.nodeRemaining} onValueChange={nodeRemaining => onChange({ ...value, nodeRemaining })} /><small>{value.nodeMode === 'limited' ? `已用 ${value.nodeUsed}，冻结 ${value.nodeReserved}` : '该权益不是限次模式'}</small></label>
  <label className="admin-field"><span>并发任务上限</span><NumberInput min="1" value={value.concurrencyLimit} onValueChange={concurrencyLimit => onChange({ ...value, concurrencyLimit })} /></label>
</div>}</AdminDialog>;

export const ContactMethodEditor: React.FC<{ method: ContactMethod; idLocked: boolean; onChange: (method: ContactMethod) => void }> = ({ method, idLocked, onChange }) => {
  const patch = (value: Partial<ContactMethod>) => onChange({ ...method, ...value });
  return <div className="admin-form-grid">
    <label className="admin-field"><span>联系方式类型</span><select value={method.type} onChange={event => { const type = event.target.value as ContactMethod['type']; patch({ type, name: method.name === contactTypeLabels[method.type] ? contactTypeLabels[type] : method.name }); }}>{Object.entries(contactTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="admin-field"><span>唯一标识</span><input value={method.id} maxLength={40} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于绑定二维码，创建后不可修改。' : '用于独立保存二维码，创建后不可修改。'}</small></label>
    <label className="admin-field"><span>显示名称</span><input value={method.name} maxLength={80} onChange={event => patch({ name: event.target.value })} placeholder={contactTypeLabels[method.type]} /></label>
    <label className="admin-field"><span>显示排序</span><NumberInput min="-9999" max="9999" value={method.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>
    <label className="admin-field span-2"><span>账号或联系信息</span><textarea value={method.value} maxLength={1000} onChange={event => patch({ value: event.target.value })} placeholder="例如：example、@example、support@example.com" /><small>这里填写的内容会和本条二维码一起显示。</small></label>
    <label className="admin-field span-2"><span>联系链接</span><input value={method.contactUrl} maxLength={1000} onChange={event => patch({ contactUrl: event.target.value })} placeholder="https://t.me/example、mailto:support@example.com 或 tel:+8613800000000" /><small>可选，支持 HTTP、HTTPS、mailto 和 tel。</small></label>
    <label className="admin-field span-2"><span>二维码图片地址</span><input type="url" value={method.qrCodeUrl} maxLength={1000} onChange={event => patch({ qrCodeUrl: event.target.value })} placeholder="https://example.com/contact.png" /><small>可选。保存更改后也可在列表中上传图片，上传图片优先显示。</small></label>
    <label className="admin-checkbox span-2"><input type="checkbox" checked={method.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此联系方式</strong><small>关闭后该方式从用户咨询弹窗隐藏，配置和二维码仍然保留。</small></span></label>
  </div>;
};

export const ResourceRecommendationEditor: React.FC<{ item: ResourceRecommendation; idLocked: boolean; onChange: (item: ResourceRecommendation) => void }> = ({ item, idLocked, onChange }) => {
  const patch = (value: Partial<ResourceRecommendation>) => onChange({ ...item, ...value });
  return <div className="admin-form-grid">
    <label className="admin-field"><span>推荐分类</span><select value={item.category} onChange={event => patch({ category: event.target.value as ResourceRecommendation['category'] })}><option value="server">服务器厂商</option><option value="residential_ip">住宅 IP 厂商</option></select></label>
    <label className="admin-field"><span>唯一标识</span><input value={item.id} maxLength={40} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于绑定 Logo，创建后不可修改。' : '用于 Logo 存储，创建后不可修改。'}</small></label>
    <label className="admin-field"><span>厂商名称</span><input value={item.name} maxLength={80} onChange={event => patch({ name: event.target.value })} /></label>
    <label className="admin-field"><span>推荐标签</span><input value={item.badge} maxLength={30} onChange={event => patch({ badge: event.target.value })} placeholder="例如：新手推荐" /></label>
    <label className="admin-field span-2"><span>简短介绍</span><textarea value={item.description} maxLength={500} onChange={event => patch({ description: event.target.value })} placeholder="简要说明厂商特点和适用场景" /><small>{item.description.length} / 500</small></label>
    <label className="admin-field span-2"><span>跳转链接</span><input type="url" value={item.purchaseUrl} maxLength={1000} onChange={event => patch({ purchaseUrl: event.target.value })} placeholder="https://example.com" /><small>保存后可在推荐列表中点击自动获取 Logo。</small></label>
    <label className="admin-field"><span>按钮名称</span><input value={item.buttonLabel} maxLength={30} onChange={event => patch({ buttonLabel: event.target.value })} placeholder="了解详情" /></label>
    <label className="admin-field"><span>显示排序</span><NumberInput min="-9999" max="9999" value={item.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>
    <label className="admin-field span-2"><span>Logo 图片地址</span><input type="url" value={item.logoUrl} maxLength={1000} onChange={event => patch({ logoUrl: event.target.value })} placeholder="https://example.com/logo.png" /><small>可选。也可保存推荐项后自动获取或上传图片，本站保存的图片优先显示。</small></label>
    <label className="admin-checkbox"><input type="checkbox" checked={item.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此推荐项</strong><small>还需开启对应分类才会在用户端显示。</small></span></label>
    <label className="admin-checkbox"><input type="checkbox" checked={item.openInNewTab} onChange={event => patch({ openInNewTab: event.target.checked })} /><span><strong>在新窗口打开跳转链接</strong><small>建议外部厂商页面保持开启。</small></span></label>
  </div>;
};

export const PaymentMethodEditor: React.FC<{ method: PaymentMethod; idLocked: boolean; onChange: (method: PaymentMethod) => void }> = ({ method, idLocked, onChange }) => {
  const provider = paymentProvider(method);
  const patch = (value: Partial<PaymentMethod>) => onChange({ ...method, ...value });
  const secretPlaceholder = method.merchantSecretConfigured ? '已配置，留空保持不变' : '请输入密钥';
  const privateKeyPlaceholder = method.privateKeyConfigured ? '已配置，留空保持不变' : '粘贴完整私钥内容';
  const apiV3Placeholder = method.apiV3KeyConfigured ? '已配置，留空保持不变' : '输入 32 位 API v3 密钥';
  return <div className="admin-form-grid">
    <label className="admin-field"><span>显示名称</span><input value={method.name} maxLength={40} onChange={event => patch({ name: event.target.value })} /></label>
    <label className="admin-field"><span>唯一标识</span><input value={method.id} maxLength={32} disabled={idLocked} onChange={event => patch({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} /><small>{idLocked ? '已用于订单和回调匹配，创建后不可修改。' : '用于订单和回调匹配，创建后不可修改。'}</small></label>
    <label className="admin-field"><span>支付驱动</span><select value={provider} onChange={event => { const next = event.target.value as PaymentProvider; patch({ provider: next, type: legacyPaymentType(next), channel: next === 'epay' ? method.channel || 'alipay' : method.channel, enabledChannels: next === 'epay' ? method.enabledChannels || [method.channel || 'alipay'] : method.enabledChannels, currency: defaultPaymentCurrency(next, method) }); }}>
      {provider === 'mgate' && <option value="mgate">MGate（历史配置）</option>}
      <option value="epay">易支付聚合</option>
      <option value="tokenpay">USDT - TokenPay</option>
      <option value="epusdt">USDT - Epusdt</option>
      <option value="paypal">PayPal 官方</option>
      <option value="alipay_official">支付宝官方</option>
      <option value="wechat_official">微信支付官方</option>
    </select></label>
    <label className="admin-field"><span>显示排序</span><NumberInput value={method.sortOrder} onValueChange={sortOrder => patch({ sortOrder })} /></label>

    <>
      <label className="admin-field span-2"><span>前台付款说明</span><input value={method.instructions} maxLength={1000} placeholder="例如：支付完成后系统自动到账" onChange={event => patch({ instructions: event.target.value })} /></label>
      <label className="admin-field span-2"><span>自定义回调域名</span><input type="url" value={method.callbackBaseUrl || ''} onChange={event => patch({ callbackBaseUrl: event.target.value })} placeholder="可选，留空使用系统公网访问地址" /><small>必须是支付平台能够通过公网访问的 HTTP 或 HTTPS 地址。</small></label>
    </>

    {provider === 'epay' && <>
      <label className="admin-field span-2"><span>支付平台网关地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://pay.example.com/submit.php" /></label>
      <label className="admin-field"><span>商户 PID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <div className="admin-field span-2"><span>用户可选支付方式</span><div className="admin-payment-channel-options">
        {EPAY_CHANNEL_OPTIONS.map(option => <label key={option.value} className="admin-checkbox"><input type="checkbox" checked={(method.enabledChannels || [method.channel || 'alipay']).includes(option.value)} onChange={event => {
          const current = method.enabledChannels || [method.channel || 'alipay'];
          const next = event.target.checked ? [...new Set([...current, option.value])] : current.filter(item => item !== option.value);
          patch({ enabledChannels: next, channel: next[0] || method.channel || 'alipay' });
        }} /><span><strong>{option.label}</strong><small>允许用户在下单时选择</small></span></label>)}
      </div><small>可同时启用多种方式。启用此易支付渠道时至少选择一种；如果只使用卡密，可停用整个支付渠道。</small></div>
      <SecretField label="商户密钥" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
      <div className="admin-form-context span-2"><strong>异步通知地址</strong><span>保存后在支付列表中复制，填写到支付平台后台的异步通知地址。同步返回地址由系统按当前站点自动生成。</span></div>
    </>}

    {provider === 'mgate' && <>
      <label className="admin-field span-2"><span>MGate API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://gateway.example.com" /></label>
      <label className="admin-field"><span>APP ID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field"><span>源货币</span><select value={method.currency || 'CNY'} onChange={event => patch({ currency: event.target.value })}>{MGATE_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      <SecretField label="App Secret" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'tokenpay' && <>
      <label className="admin-field span-2"><span>TokenPay API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://tokenpay.example.com" /></label>
      <label className="admin-field span-2"><span>USDT 网络</span><select value={tokenPayCurrency(method)} onChange={event => patch({ currency: event.target.value })}>{isLegacyTokenPayCurrency(method) && <option value={tokenPayCurrency(method)}>{tokenPayCurrency(method).replaceAll('_', '-')}（历史配置）</option>}{TOKENPAY_CURRENCIES.map(currency => <option key={currency.value} value={currency.value}>{currency.label}</option>)}</select><small>新通道仅提供 USDT 网络；历史 TRX、ETH、USDC 配置仍可读取并迁移。</small></label>
      <SecretField label="API 密钥" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'epusdt' && <>
      <label className="admin-field span-2"><span>Epusdt API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="https://epusdt.example.com/api/v1/order/create-transaction" /></label>
      <label className="admin-field span-2"><span>币种</span><select value="USDT-TRC20" onChange={() => patch({ currency: 'USDT-TRC20' })}><option value="USDT-TRC20">USDT-TRC20</option></select><small>Epusdt 当前驱动固定使用 USDT-TRC20。</small></label>
      <SecretField label="签名 Token" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
    </>}

    {provider === 'paypal' && <>
      <label className="admin-field span-2"><span>PayPal API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 PayPal 官方 API 地址" /><small>正式环境默认使用 api-m.paypal.com，沙箱环境默认使用 api-m.sandbox.paypal.com。</small></label>
      <label className="admin-field span-2"><span>Client ID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} autoComplete="off" /></label>
      <SecretField label="Client Secret" value={method.merchantSecret || ''} placeholder={secretPlaceholder} onChange={merchantSecret => patch({ merchantSecret })} />
      <label className="admin-field span-2"><span>Webhook ID</span><input value={method.appId || ''} onChange={event => patch({ appId: event.target.value })} /><small>在 PayPal 开发者后台创建 Webhook 后填写其 ID，用于校验异步通知。</small></label>
      <label className="admin-field span-2"><span>订单币种</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select><small>当前套餐金额按人民币分存储，固定使用 CNY 可避免未换汇直接扣款。</small></label>
      <label className="admin-checkbox span-2"><input type="checkbox" checked={method.sandbox === true} onChange={event => patch({ sandbox: event.target.checked })} /><span><strong>使用 PayPal 沙箱</strong><small>测试时启用并填写沙箱应用的 Client ID、Client Secret 与 Webhook ID。</small></span></label>
    </>}

    {provider === 'alipay_official' && <>
      <label className="admin-field span-2"><span>支付宝网关</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 https://openapi.alipay.com/gateway.do" /></label>
      <label className="admin-field span-2"><span>应用 APPID</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field span-2"><span>订单币种</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select></label>
      <label className="admin-field span-2"><span>应用私钥</span><textarea value={method.privateKey || ''} onChange={event => patch({ privateKey: event.target.value })} placeholder={privateKeyPlaceholder} /><small>支持 PEM 或未带头尾的 PKCS8 私钥，保存后不回传明文。</small></label>
      <label className="admin-field span-2"><span>支付宝公钥</span><textarea value={method.publicKey || ''} onChange={event => patch({ publicKey: event.target.value })} placeholder="粘贴支付宝开放平台提供的支付宝公钥" /></label>
      <label className="admin-checkbox span-2"><input type="checkbox" checked={method.sandbox === true} onChange={event => patch({ sandbox: event.target.checked })} /><span><strong>标记为沙箱通道</strong><small>启用后请同时填写支付宝沙箱网关地址与沙箱应用资料。</small></span></label>
    </>}

    {provider === 'wechat_official' && <>
      <label className="admin-field span-2"><span>微信支付 API 地址</span><input type="url" value={method.gatewayUrl || ''} onChange={event => patch({ gatewayUrl: event.target.value })} placeholder="留空使用 https://api.mch.weixin.qq.com" /></label>
      <label className="admin-field"><span>应用 AppID</span><input value={method.appId || ''} onChange={event => patch({ appId: event.target.value })} /></label>
      <label className="admin-field"><span>商户号</span><input value={method.merchantId || ''} onChange={event => patch({ merchantId: event.target.value })} /></label>
      <label className="admin-field"><span>商户证书序列号</span><input value={method.certificateSerial || ''} onChange={event => patch({ certificateSerial: event.target.value })} /></label>
      <label className="admin-field"><span>结算货币</span><select value="CNY" onChange={() => patch({ currency: 'CNY' })}><option value="CNY">CNY - 人民币</option></select></label>
      <label className="admin-field span-2"><span>商户 API 私钥</span><textarea value={method.privateKey || ''} onChange={event => patch({ privateKey: event.target.value })} placeholder={privateKeyPlaceholder} /><small>填写商户 API 证书对应私钥，保存后不回传明文。</small></label>
      <label className="admin-field span-2"><span>微信支付平台证书或公钥</span><textarea value={method.publicKey || ''} onChange={event => patch({ publicKey: event.target.value })} placeholder="粘贴平台证书 PEM 或平台公钥" /></label>
      <SecretField label="API v3 密钥" value={method.apiV3Key || ''} placeholder={apiV3Placeholder} onChange={apiV3Key => patch({ apiV3Key })} help="必须为 32 字节，用于解密支付通知。" />
    </>}

    <label className="admin-checkbox span-2"><input type="checkbox" checked={method.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span><strong>启用此支付方式</strong><small>启用前必须填写该驱动要求的全部资料。</small></span></label>
  </div>;
};

export const SecretField: React.FC<{ label: string; value: string; placeholder: string; help?: string; onChange: (value: string) => void }> = ({ label, value, placeholder, help, onChange }) => <label className="admin-field span-2"><span>{label}</span><input type="password" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="new-password" /><small>{help || '保存后不会再向前端回传明文。'}</small></label>;
