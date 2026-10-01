import React from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, CircleGauge, Layers3, Network, ServerCog, ShieldCheck, Sparkles, Workflow, Zap } from 'lucide-react';
import { ViewMode } from '../types';

interface HomeViewProps { onSelectView: (view: ViewMode) => void; onOpenGuide: () => void; onOpenSetupGuide?: () => void; }

const workstreams = [
  { view: 'panel' as ViewMode, icon: ServerCog, kicker: '工作流 01', title: '面板交付', text: '从服务器连接、系统检测到面板初始化，完成一次可验收的环境交付。', tone: 'violet', meta: ['自动识别系统环境', '生成可访问入口', '结果与日志留存'] },
  { view: 'node' as ViewMode, icon: Network, kicker: '工作流 02', title: '节点编排', text: '选择协议、传输与安全组合，快速创建节点并管理 SOCKS 链式出站。', tone: 'mint', meta: ['协议组合智能校验', '支持多级 SOCKS 中继', '链接与二维码可导出'] },
];

export const HomeView: React.FC<HomeViewProps> = ({ onSelectView, onOpenGuide, onOpenSetupGuide }) => <div className="workspace-home">
  <section className="workspace-welcome"><div><span className="workspace-kicker"><Sparkles /> 交付空间 · 今日工作台</span><h1>把下一次搭建，变成一项清晰的工作</h1><p>选择一条工作流，系统会校验你的权益并引导完成服务器面板或节点交付。所有结果都会沉淀在账户记录中。</p><div className="workspace-welcome-actions"><button type="button" className="workspace-primary" onClick={() => onSelectView('panel')}>开始面板交付 <ArrowRight /></button><button type="button" className="workspace-secondary" onClick={() => onSelectView('account')}>查看我的权益 <ChevronRight /></button></div></div><div className="workspace-welcome-orbit"><div className="workspace-orbit-ring ring-one" /><div className="workspace-orbit-ring ring-two" /><span><CircleGauge /></span><small>交付中枢</small></div></section>

  <section className="workspace-summary"><div><span><Zap /></span><div><small>下一步建议</small><strong>先完成一次面板交付</strong></div></div><p>完成后可直接带入凭据，继续创建节点。</p><button type="button" onClick={() => onSelectView('panel')}>开始 <ArrowRight /></button></section>

  <section className="workspace-workflows"><header><div><span className="workspace-kicker">核心工作流</span><h2>选择你现在要完成的交付</h2></div><button type="button" onClick={onOpenGuide}>查看协议说明 <ChevronRight /></button></header><div className="workspace-workflow-grid">{workstreams.map(({ view, icon: Icon, kicker, title, text, tone, meta }) => <button type="button" key={view} className={`workspace-workflow-card ${tone}`} onClick={() => onSelectView(view)}><div className="workspace-workflow-top"><span className="workspace-workflow-icon"><Icon /></span><small>{kicker}</small><ArrowRight /></div><h3>{title}</h3><p>{text}</p><ul>{meta.map(item => <li key={item}><Check /> {item}</li>)}</ul><footer><span>进入工作流</span><strong>开始配置 <ArrowRight /></strong></footer></button>)}</div></section>

  <section className="workspace-guidance"><div className="workspace-guidance-head"><span className="workspace-guidance-icon"><BookOpen /></span><div><span className="workspace-kicker">交付指南</span><h2>三件事，完成一次可复用的搭建</h2><p>首次使用可以先按照这条路径熟悉工作台，之后每次任务都能快速复用。</p></div>{onOpenSetupGuide && <button type="button" className="workspace-secondary" onClick={onOpenSetupGuide}>打开完整指南 <ArrowRight /></button>}</div><div className="workspace-guide-steps"><article><span>01</span><div><h3>准备服务器</h3><p>准备支持 SSH 的 Linux VPS，并确认安全组开放所需端口。</p></div></article><article><span>02</span><div><h3>完成面板交付</h3><p>填写连接信息，系统会自动执行安装并验证访问入口。</p></div></article><article><span>03</span><div><h3>继续创建节点</h3><p>从已完成的面板进入节点工作流，生成可使用的连接信息。</p></div></article></div></section>

  <section className="workspace-assurance-grid"><article><span><ShieldCheck /></span><div><h3>权益先校验</h3><p>提交任务前明确告知可用额度，不让任务中途失去上下文。</p></div></article><article><span><Workflow /></span><div><h3>过程可追踪</h3><p>执行中的状态、失败原因和最终结果都可以回到记录中查看。</p></div></article><article><span><Layers3 /></span><div><h3>数据可复用</h3><p>面板凭据、节点结果和历史配置可以继续用于下一次搭建。</p></div></article></section>
</div>;
