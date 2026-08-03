import React from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CloudCog,
  Globe2,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';

const services = [
  {
    icon: Globe2,
    title: '跨境业务网络',
    description: '面向跨境电商、海外营销和国际协作场景，快速建立稳定、清晰的业务访问环境。',
    accent: 'cyan',
  },
  {
    icon: Bot,
    title: 'AI 应用环境',
    description: '为 AI 工具、模型服务和自动化工作流准备可用的网络基础环境，让业务更快进入运行状态。',
    accent: 'indigo',
  },
  {
    icon: Route,
    title: '全球接入优化',
    description: '围绕不同地区与业务目标进行环境交付，减少重复配置，提高多区域业务的执行效率。',
    accent: 'emerald',
  },
];

const capabilities = [
  ['01', '选择服务权益', '按实际任务选择单次、月度或长期权益，费用和可用次数清晰可见。'],
  ['02', '提交交付任务', '在统一工作台填写必要信息，系统会校验当前权益并锁定本次任务额度。'],
  ['03', '自动执行与反馈', '任务进入自动化交付流程，执行进度、结果和历史记录都在账户中统一管理。'],
];

export const LandingPage: React.FC = () => (
  <div className="landing-shell text-slate-100 selection:bg-cyan-400 selection:text-slate-950">
    <header className="landing-header">
      <a href="/" className="brand-lockup" aria-label="NEXUS CLOUD 首页">
        <span className="brand-mark"><Network className="h-5 w-5" /></span>
        <span>
          <strong>NEXUS CLOUD</strong>
          <small>GLOBAL NETWORK DELIVERY</small>
        </span>
      </a>

      <nav className="landing-nav" aria-label="网站导航">
        <a href="#services">服务能力</a>
        <a href="#workflow">交付流程</a>
        <a href="/login" className="landing-login-link">登录</a>
        <a href="/register" className="landing-register-link">
          注册账户 <ArrowRight className="h-4 w-4" />
        </a>
      </nav>
    </header>

    <main>
      <section className="landing-hero">
        <div className="network-scene" aria-hidden="true">
          <div className="network-grid" />
          <span className="network-route route-one" />
          <span className="network-route route-two" />
          <span className="network-route route-three" />
          <span className="network-route route-four" />
          <span className="network-node node-one"><i /></span>
          <span className="network-node node-two"><i /></span>
          <span className="network-node node-three"><i /></span>
          <span className="network-node node-four"><i /></span>
          <span className="network-node node-five"><i /></span>
          <div className="network-core">
            <Network className="h-10 w-10" />
            <span>GLOBAL CORE</span>
          </div>
          <div className="data-pulse pulse-one" />
          <div className="data-pulse pulse-two" />
          <div className="data-pulse pulse-three" />
        </div>

        <div className="hero-content">
          <div className="hero-kicker"><Sparkles className="h-4 w-4" /> 全球智能网络交付平台</div>
          <h1>为跨境业务与 AI 应用<br /><span>构建稳定的全球网络环境</span></h1>
          <p>
            面向海外业务、AI 服务与多区域团队，提供从服务权益到可用环境的一站式自动化交付，
            让复杂的网络准备过程变得清晰、高效、可管理。
          </p>
          <div className="hero-actions">
            <a href="/register" className="hero-primary">
              免费注册账户 <ArrowRight className="h-5 w-5" />
            </a>
            <a href="/login" className="hero-secondary">已有账户，立即登录</a>
          </div>
          <div className="hero-assurances">
            <span><CheckCircle2 className="h-4 w-4" /> 权益透明</span>
            <span><CheckCircle2 className="h-4 w-4" /> 自动化交付</span>
            <span><CheckCircle2 className="h-4 w-4" /> 全流程可追踪</span>
          </div>
        </div>

        <div className="hero-status" aria-label="平台能力概览">
          <div><strong>GLOBAL</strong><span>多区域业务环境</span></div>
          <div><strong>AUTO</strong><span>自动化任务交付</span></div>
          <div><strong>UNIFIED</strong><span>权益与记录统一管理</span></div>
        </div>
      </section>

      <section id="services" className="landing-section services-section">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / SERVICES</span>
            <h2>连接业务目标与全球网络能力</h2>
          </div>
          <p>不是堆叠复杂参数，而是围绕真实业务场景，交付可使用、可持续管理的网络环境。</p>
        </div>

        <div className="service-grid">
          {services.map(({ icon: Icon, title, description, accent }) => (
            <article key={title} className={`service-item service-item--${accent}`}>
              <div className="service-icon"><Icon className="h-6 w-6" /></div>
              <span className="service-signal" />
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="service-meta"><Zap className="h-4 w-4" /> ON-DEMAND DELIVERY</div>
            </article>
          ))}
        </div>
      </section>

      <section id="workflow" className="landing-section workflow-section">
        <div className="workflow-intro">
          <span className="section-index">02 / WORKFLOW</span>
          <h2>从购买权益到环境可用，<br />每一步都有明确反馈</h2>
          <p>统一账户承载套餐、任务、次数与交付记录。你只需要关注业务目标，平台负责把流程推进到可用结果。</p>
          <div className="workflow-icons">
            <span><CloudCog className="h-5 w-5" /> 自动执行</span>
            <span><ShieldCheck className="h-5 w-5" /> 权益校验</span>
            <span><Workflow className="h-5 w-5" /> 进度追踪</span>
          </div>
        </div>

        <div className="workflow-list">
          {capabilities.map(([number, title, description]) => (
            <article key={number} className="workflow-step">
              <span>{number}</span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <span className="section-index">READY TO CONNECT</span>
          <h2>让全球网络环境更快进入工作状态</h2>
          <p>创建账户，选择适合当前业务的服务权益，并在统一工作台中发起交付任务。</p>
        </div>
        <a href="/register">开始使用 <ArrowRight className="h-5 w-5" /></a>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="brand-lockup brand-lockup--footer">
        <span className="brand-mark"><Network className="h-5 w-5" /></span>
        <span><strong>NEXUS CLOUD</strong><small>全球智能网络交付平台</small></span>
      </div>
      <p>面向跨境业务与 AI 应用的网络环境交付服务</p>
      <a href="/admin">管理入口</a>
    </footer>
  </div>
);
