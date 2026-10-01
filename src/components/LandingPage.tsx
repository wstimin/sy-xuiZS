import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  CloudCog,
  Cpu,
  Globe2,
  Layers3,
  Network,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import { api, formatMoney, Plan, quotaText } from '../commercial';
import { ContactButton } from './ContactButton';
import { PUBLIC_THEME_STORAGE_KEY, ThemeToggle } from './ThemeToggle';

const capabilityCards = [
  { icon: ServerCog, title: '面板交付', label: '标准化环境', text: '从系统检测、依赖安装到面板初始化，形成可追踪的标准交付链。', color: 'violet' },
  { icon: Network, title: '节点编排', label: '多区域协同', text: '面板完成后继续配置节点，额度、状态与结果在同一工作台统一管理。', color: 'blue' },
  { icon: ShieldCheck, title: '权益控制', label: '清晰可核对', text: '套餐、订单、永久次数和使用记录透明呈现，关键动作均有记录可回溯。', color: 'mint' },
];

const scenarioCards = [
  { icon: Globe2, tag: '跨境业务', title: '为多区域团队准备稳定的工作环境', text: '适合跨境电商、海外营销和国际协作，快速准备不同地区的网络基础设施。' },
  { icon: Cpu, tag: 'AI 应用', title: '让模型服务接入更快、更可控', text: '为 AI 工具、模型服务与自动化流程准备网络环境，减少重复配置和人工排查。' },
  { icon: Layers3, tag: '交付团队', title: '把一次性交付变成可复用的流程', text: '按统一步骤执行、查看、验收，适合需要重复交付面板和节点的运营团队。' },
  { icon: Boxes, tag: '资源协同', title: '把资源选择和部署动作放在一起', text: '从服务器、住宅网络到交付记录，减少跨页面切换，让每一次搭建都有上下文。' },
];

const deliverySteps = [
  ['01', '配置权益', '根据项目规模选择套餐，价格、永久次数和使用范围在下单前明确展示。'],
  ['02', '提交任务', '填写服务器连接信息，系统先校验权益，再锁定对应的交付额度。'],
  ['03', '自动交付', '标准化流程自动执行安装、初始化和节点配置，并持续反馈执行状态。'],
  ['04', '验收复用', '查看访问结果、日志和历史记录，继续使用永久次数完成下一次交付。'],
];

function planDuration(plan: Plan) {
  void plan;
  return '永久有效';
}

export const LandingPage: React.FC<{ adminPath: string }> = () => {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    void api<{ plans: Plan[] }>('/api/plans')
      .then(result => setPlans(result.plans.filter(plan => plan.enabled && plan.homepageVisible)))
      .catch(() => setPlans([]));
  }, []);

  return <div className="site-shell">
    <header className="site-header">
      <a href="/" className="site-brand" aria-label="xui面板一键搭建助手首页">
        <span className="site-brand-mark"><Terminal /></span>
        <span><strong>xui面板<em>一键搭建助手</em></strong><small>商业网络交付平台</small></span>
      </a>
      <nav className="site-nav" aria-label="网站导航">
        <a href="#capabilities">产品能力</a><a href="#scenarios">业务场景</a><a href="#plans">权益中心</a><a href="#delivery">交付流程</a>
      </nav>
      <div className="site-header-actions"><ThemeToggle compact storageKey={PUBLIC_THEME_STORAGE_KEY} /><a className="site-login" href="/login">登录</a><a className="site-header-cta" href="/register">立即开始 <ArrowRight /></a></div>
    </header>

    <main>
      <section className="site-hero">
        <div className="site-hero-copy">
          <span className="site-eyebrow"><Sparkles /> 商业网络交付操作系统</span>
          <h1>把复杂的服务器搭建，变成<strong>可追踪的业务流程</strong></h1>
          <p>面板安装、节点编排、权益管理和交付验收，在一个明亮、清晰、可复用的工作台里完成。为跨境业务、AI 应用和多区域团队提供稳定的基础设施交付能力。</p>
          <div className="site-hero-actions"><a className="site-primary-button" href="/register">创建我的交付空间 <ArrowRight /></a><a className="site-text-button" href="#plans">查看权益方案 <ChevronRight /></a></div>
          <div className="site-proof-row"><span><CheckCircle2 /> 任务状态全程可查</span><span><CheckCircle2 /> 面板与节点独立计次</span><span><CheckCircle2 /> 关键动作留痕</span></div>
        </div>
        <div className="site-hero-board" aria-label="交付运营看板示意">
          <div className="site-board-glow" />
          <header><div><span className="site-board-dot" /> 今日交付空间</div><span>运行稳定 <CheckCircle2 /></span></header>
          <div className="site-board-title"><div><small>本月交付完成率</small><strong>98.6%</strong></div><span className="site-board-trend">↗ 12.4%</span></div>
          <div className="site-board-chart"><i /><i /><i /><i /><i /><i /><i /><span /></div>
          <div className="site-board-grid"><div><span><ServerCog /></span><small>面板交付</small><strong>24</strong><em>本月完成</em></div><div><span><Network /></span><small>节点配置</small><strong>86</strong><em>本月完成</em></div><div><span><BadgeCheck /></span><small>可用权益</small><strong>128</strong><em>剩余额度</em></div></div>
          <div className="site-board-task"><span className="site-task-icon"><CloudCog /></span><div><strong>节点交付任务</strong><small>欧洲区域 · 正在执行环境检测</small></div><b>进行中</b></div>
        </div>
      </section>

      <section className="site-metrics" aria-label="平台指标"><div><strong>4 类</strong><span>核心交付能力</span></div><div><strong>全链路</strong><span>状态与日志记录</span></div><div><strong>7 × 24</strong><span>在线任务可追踪</span></div><div><strong>一次配置</strong><span>持续复用工作流</span></div></section>

      <section id="capabilities" className="site-section site-capabilities">
        <div className="site-section-heading"><span className="site-section-kicker">产品能力</span><h2>让每一次交付都更有秩序</h2><p>从购买权益到最终验收，平台把复杂的基础设施工作拆成清晰、可复用的业务步骤。</p></div>
        <div className="site-capability-layout"><article className="site-capability-feature"><div className="site-feature-icon"><CircleGauge /></div><span>统一交付中枢</span><h3>一个工作台，管理所有搭建动作</h3><p>不再在零散的脚本、聊天记录和表格之间切换。用户端查看自己的任务，运营端掌握全局状态，数据在同一套业务链路中流转。</p><div className="site-feature-list"><span><Check /> 自动校验可用权益</span><span><Check /> 失败原因清晰可见</span><span><Check /> 交付结果长期留存</span></div><a href="/register">进入我的交付空间 <ArrowRight /></a></article><div className="site-capability-list">{capabilityCards.map(({ icon: Icon, title, label, text, color }) => <article className={`site-capability-card ${color}`} key={title}><span className="site-capability-icon"><Icon /></span><div><small>{label}</small><h3>{title}</h3><p>{text}</p></div><ChevronRight /></article>)}</div></div>
      </section>

      <section id="scenarios" className="site-section site-scenarios"><div className="site-section-heading centered"><span className="site-section-kicker">业务场景</span><h2>为真实业务，而不是展示页面而设计</h2><p>无论是一次临时搭建，还是持续交付的运营团队，都可以用同一套流程完成协作。</p></div><div className="site-scenario-grid">{scenarioCards.map(({ icon: Icon, tag, title, text }) => <article className="site-scenario-card" key={tag}><span className="site-scenario-icon"><Icon /></span><small>{tag}</small><h3>{title}</h3><p>{text}</p><a href="/register">了解交付方式 <ArrowRight /></a></article>)}</div></section>

      <section id="plans" className="site-section site-plans"><div className="site-section-heading"><span className="site-section-kicker">权益中心</span><h2>按业务节奏选择交付额度</h2><p>价格、有效期、面板与节点额度清晰呈现。购买后即可在用户工作台发起任务。</p></div><div className="site-plan-layout"><div className="site-plan-aside"><span className="site-plan-aside-icon"><Zap /></span><h3>从一次任务开始</h3><p>先用轻量额度验证流程，再按团队规模升级。所有订单和权益都在账户中统一管理。</p><ul><li><Check /> 下单前查看完整额度</li><li><Check /> 用不完的权益状态可查</li><li><Check /> 需要时继续购买补充</li></ul><a href="/register">注册后查看全部方案 <ArrowRight /></a></div><div className="site-plan-grid">{plans.map((plan, index) => <article className={`site-plan-card ${index === 1 ? 'featured' : ''}`} key={plan.id}>{index === 1 && <span className="site-plan-badge">更受欢迎</span>}<div className="site-plan-card-top"><span><Cpu /></span><div><small>{planDuration(plan)}</small><h3>{plan.name}</h3></div></div><strong className="site-plan-price">{formatMoney(plan.priceCents)}</strong><p>{plan.description || '适合按需使用的交付权益方案。'}</p><div className="site-plan-quota"><span><b>面板</b>{quotaText(plan.panelMode, plan.panelLimit)}</span><span><b>节点</b>{quotaText(plan.nodeMode, plan.nodeLimit)}</span></div><a href="/register">选择此方案 <ArrowRight /></a></article>)}{!plans.length && <div className="site-plan-empty">当前方案正在配置中，注册后可查看最新权益。</div>}</div></div></section>

      <section id="delivery" className="site-section site-delivery"><div className="site-delivery-copy"><span className="site-section-kicker">交付流程</span><h2>从购买到验收，四步完成一次交付</h2><p>每一步都有明确的输入、状态和结果。团队可以快速上手，运营人员也能随时掌握全局。</p><div className="site-delivery-note"><Workflow /><span><strong>流程可复用</strong><small>同一套标准可以持续交付不同区域和不同类型的任务。</small></span></div></div><div className="site-delivery-timeline">{deliverySteps.map(([number, title, text], index) => <article key={number}><span className="site-step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div>{index < deliverySteps.length - 1 && <i className="site-step-line" />}</article>)}</div></section>

      <section className="site-final-cta"><div><span className="site-section-kicker">现在开始</span><h2>把下一次搭建，交给一套更可靠的流程</h2><p>注册账户，配置适合你的权益方案，今天就开始第一次自助交付。</p></div><a className="site-primary-button" href="/register">创建交付空间 <ArrowRight /></a></section>
    </main>

    <footer className="site-footer"><a href="/" className="site-brand"><span className="site-brand-mark"><Terminal /></span><span><strong>xui面板<em>一键搭建助手</em></strong><small>商业网络交付平台</small></span></a><span>面板安装 · 节点编排 · 权益管理</span><div><a href="/login">用户登录</a></div></footer>
    <ContactButton />
  </div>;
};
