import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CloudCog,
  Cpu,
  Globe2,
  Orbit,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Workflow,
  Waypoints,
  Zap,
} from 'lucide-react';
import { api, formatMoney, Plan, quotaText } from '../commercial';

const services = [
  {
    icon: ServerCog,
    title: '服务器面板搭建',
    description: '在用户端提交服务器连接信息，系统自动完成面板环境安装与初始化，并返回可用的访问结果。',
    accent: 'cyan',
  },
  {
    icon: Waypoints,
    title: '网络节点配置',
    description: '面板搭建完成后，可继续创建和管理节点任务。面板次数与节点次数分别计费、分别扣减。',
    accent: 'indigo',
  },
  {
    icon: Globe2,
    title: '跨境业务环境',
    description: '适用于跨境电商、海外营销、国际协作等业务，为不同地区的工作场景快速准备网络环境。',
    accent: 'emerald',
  },
  {
    icon: BrainCircuit,
    title: 'AI 网络环境',
    description: '为 AI 工具、模型服务和自动化工作流准备网络基础环境，减少重复部署与人工配置。',
    accent: 'amber',
  },
];

const capabilities = [
  ['01', '注册并购买搭建权益', '选择单次、月度、年度或永久套餐，面板搭建次数、节点配置次数和有效期在购买前清晰展示。'],
  ['02', '提交服务器搭建任务', '登录用户端填写服务器连接信息，系统先校验可用权益，再锁定本次面板或节点任务额度。'],
  ['03', '系统自动执行搭建', '沿用已经验证的自动化搭建流程执行安装和配置，任务状态、失败原因与额度变化全程留痕。'],
  ['04', '查看结果并继续配置', '搭建完成后在用户端查看交付结果和历史记录，并根据剩余权益继续创建节点或新的面板任务。'],
];

function planDuration(plan: Plan) {
  if (plan.durationUnit === 'lifetime') return '永久有效';
  const units = { days: '天', months: '个月', years: '年' };
  return `${plan.durationValue} ${units[plan.durationUnit]}`;
}

export const LandingPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api<{ plans: Plan[] }>('/api/plans')
      .then(result => setPlans(result.plans.filter(plan => plan.enabled).slice(0, 4)))
      .catch(() => setPlans([]));
  }, []);

  return <div className="landing-shell text-slate-100 selection:bg-cyan-400 selection:text-slate-950">
    <header className="landing-header">
      <a href="/" className="brand-lockup" aria-label="NEXUS CLOUD 首页">
        <span className="brand-mark"><Orbit className="h-5 w-5" /></span>
        <span>
          <strong>NEXUS CLOUD</strong>
          <small>GLOBAL NETWORK DELIVERY</small>
        </span>
      </a>

      <nav className="landing-nav" aria-label="网站导航">
        <a href="#services">搭建服务</a>
        <a href="#plans">套餐权益</a>
        <a href="#workflow">搭建流程</a>
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
            <Waypoints className="h-10 w-10" />
            <span>GLOBAL CORE</span>
          </div>
          <div className="data-pulse pulse-one" />
          <div className="data-pulse pulse-two" />
          <div className="data-pulse pulse-three" />
        </div>

        <div className="hero-content">
          <div className="hero-kicker"><Sparkles className="h-4 w-4" /> 服务器面板与网络节点自助搭建</div>
          <h1>购买搭建权益，<br /><span>在线完成面板与节点部署</span></h1>
          <p>
            面向跨境业务、AI 应用和多区域网络使用场景，提供服务器面板安装、网络节点配置与任务记录管理。
            用户购买权益后即可在工作台发起搭建，面板次数与节点次数独立计算，执行结果清晰可查。
          </p>
          <div className="hero-actions">
            <a href="/register" className="hero-primary">
              注册并开始搭建 <ArrowRight className="h-5 w-5" />
            </a>
            <a href="#plans" className="hero-secondary">查看搭建套餐</a>
          </div>
          <div className="hero-assurances">
            <span><CheckCircle2 className="h-4 w-4" /> 面板与节点独立计次</span>
            <span><CheckCircle2 className="h-4 w-4" /> 用户端自助执行</span>
            <span><CheckCircle2 className="h-4 w-4" /> 搭建记录全程可查</span>
          </div>
        </div>

        <div className="hero-status" aria-label="平台能力概览">
          <div><strong>PANEL</strong><span>服务器面板自动安装</span></div>
          <div><strong>NODE</strong><span>网络节点创建与配置</span></div>
          <div><strong>QUOTA</strong><span>套餐、次数与有效期管理</span></div>
        </div>
      </section>

      <section id="services" className="landing-section services-section">
        <div className="section-heading">
          <div>
            <span className="section-index">01 / BUILD SERVICES</span>
            <h2>用户真正可以购买和执行的搭建服务</h2>
          </div>
          <p>不展示底层面板品牌，但明确展示实际交付内容：服务器面板安装、节点配置、任务执行和结果管理。</p>
        </div>

        <div className="service-grid">
          {services.map(({ icon: Icon, title, description, accent }) => (
            <article key={title} className={`service-item service-item--${accent}`}>
              <div className="service-icon"><Icon className="h-6 w-6" /></div>
              <span className="service-signal" />
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="service-meta"><Zap className="h-4 w-4" /> SELF-SERVICE BUILD</div>
            </article>
          ))}
        </div>
      </section>

      <section id="plans" className="landing-section plans-section">
        <div className="section-heading">
          <div>
            <span className="section-index">02 / SERVICE PLANS</span>
            <h2>按搭建次数和使用期限购买</h2>
          </div>
          <p>以下内容直接读取当前系统套餐。管理员修改价格、有效期、面板次数或节点次数后，首页会同步显示。</p>
        </div>
        <div className="landing-plan-grid">
          {plans.map(plan => (
            <article key={plan.id} className="landing-plan-item">
              <div className="landing-plan-title"><span><Cpu /></span><div><h3>{plan.name}</h3><small>{planDuration(plan)}</small></div></div>
              <strong>{formatMoney(plan.priceCents)}</strong>
              <p>{plan.description}</p>
              <dl>
                <div><dt>面板搭建</dt><dd>{quotaText(plan.panelMode, plan.panelLimit)}</dd></div>
                <div><dt>节点配置</dt><dd>{quotaText(plan.nodeMode, plan.nodeLimit)}</dd></div>
              </dl>
              <a href="/register">购买此套餐 <ArrowRight /></a>
            </article>
          ))}
          {!plans.length && <div className="landing-plans-empty">套餐正在配置中，请登录后查看当前可购买权益。</div>}
        </div>
      </section>

      <section id="workflow" className="landing-section workflow-section">
        <div className="workflow-intro">
          <span className="section-index">03 / BUILD WORKFLOW</span>
          <h2>从购买次数到完成搭建，<br />都在用户端执行</h2>
          <p>账户统一管理套餐、面板次数、节点次数、订单和搭建记录。每次任务执行前校验权益，成功后扣减，失败则按系统规则处理额度。</p>
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
          <span className="section-index">READY TO BUILD</span>
          <h2>注册账户，开始第一次自助搭建</h2>
          <p>购买适合的面板与节点权益，在用户工作台提交服务器信息并查看实时任务结果。</p>
        </div>
        <a href="/register">注册并购买权益 <ArrowRight className="h-5 w-5" /></a>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="brand-lockup brand-lockup--footer">
        <span className="brand-mark"><Orbit className="h-5 w-5" /></span>
        <span><strong>NEXUS CLOUD</strong><small>网络环境自助搭建服务</small></span>
      </div>
      <p>服务器面板安装、网络节点配置与搭建权益管理</p>
      <a href="/admin">管理入口</a>
    </footer>
  </div>
};
