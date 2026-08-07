import React from 'react';
import { ArrowUpRight, Building2, CheckCircle2, Globe2, Network, Server, Tag } from 'lucide-react';
import { ResourceRecommendation, ResourceRecommendationSettings } from '../commercial';

interface ResourceRecommendationsViewProps {
  recommendations: ResourceRecommendationSettings;
}

export const ResourceRecommendationsView: React.FC<ResourceRecommendationsViewProps> = ({ recommendations }) => {
  const servers = recommendations.serverEnabled ? recommendations.items.filter(item => item.category === 'server' && item.enabled) : [];
  const residentialIps = recommendations.residentialIpEnabled ? recommendations.items.filter(item => item.category === 'residential_ip' && item.enabled) : [];

  return <div className="resource-page">
    <header className="resource-page-head">
      <div>
        <span className="resource-page-eyebrow"><Globe2 /> RESOURCE DIRECTORY</span>
        <h1>资源推荐</h1>
        <p>按实际搭建需求选择服务器或住宅 IP 服务，点击按钮可直接前往厂商购买页面。</p>
      </div>
      <div className="resource-page-summary">
        <span><strong>{servers.length}</strong>服务器厂商</span>
        <span><strong>{residentialIps.length}</strong>住宅 IP 厂商</span>
      </div>
    </header>

    {servers.length > 0 && <ResourceSection
      icon={Server}
      tone="cyan"
      title="服务器厂商推荐"
      description="适合部署 xui 面板、节点服务及其他长期运行任务。"
      items={servers}
    />}

    {residentialIps.length > 0 && <ResourceSection
      icon={Network}
      tone="emerald"
      title="住宅 IP 厂商推荐"
      description="适合需要住宅网络出口、地区覆盖或 SOCKS 链式转发的场景。"
      items={residentialIps}
    />}
  </div>;
};

const ResourceSection: React.FC<{
  icon: React.ElementType;
  tone: 'cyan' | 'emerald';
  title: string;
  description: string;
  items: ResourceRecommendation[];
}> = ({ icon: Icon, tone, title, description, items }) => <section className={`resource-section ${tone}`}>
  <header>
    <span><Icon /></span>
    <div><h2>{title}</h2><p>{description}</p></div>
    <b>{items.length} 项</b>
  </header>
  <div className="resource-grid">
    {items.map(item => <ResourceCard key={item.id} item={item} />)}
  </div>
</section>;

const ResourceCard: React.FC<{ item: ResourceRecommendation }> = ({ item }) => {
  const logo = item.logoUploaded ? `/api/resource-recommendations/${encodeURIComponent(item.id)}/logo` : item.logoUrl;
  const details = item.category === 'server'
    ? [item.regions && ['可用地区', item.regions], item.serverConfiguration && ['参考配置', item.serverConfiguration], item.referencePrice && ['参考价格', item.referencePrice]]
    : [item.regions && ['覆盖地区', item.regions], item.ipType && ['IP 类型', item.ipType], item.protocols && ['支持协议', item.protocols], item.billingMethod && ['计费方式', item.billingMethod], item.referencePrice && ['参考价格', item.referencePrice]];

  return <article className="resource-card">
    <div className="resource-card-top">
      <span className="resource-logo">{logo ? <img src={logo} alt={`${item.name} Logo`} /> : <Building2 />}</span>
      <div><h3>{item.name}</h3>{item.badge && <span className="resource-badge"><Tag />{item.badge}</span>}</div>
    </div>
    {item.description && <p className="resource-description">{item.description}</p>}
    <dl className="resource-details">
      {details.filter(Boolean).map(detail => {
        const [label, value] = detail as [string, string];
        return <div key={label}><dt><CheckCircle2 />{label}</dt><dd>{value}</dd></div>;
      })}
    </dl>
    <a className="resource-purchase-button" href={item.purchaseUrl} target={item.openInNewTab ? '_blank' : undefined} rel={item.openInNewTab ? 'noreferrer' : undefined}>
      <span>{item.buttonLabel || '前往购买'}</span><ArrowUpRight />
    </a>
  </article>;
};
