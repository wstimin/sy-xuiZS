import React from 'react';
import { ArrowUpRight, Building2, Globe2, Network, Server, Tag } from 'lucide-react';
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
        <p>这里整理了适合面板搭建、节点部署和网络需求的第三方服务商，点击即可前往了解。</p>
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
      description="适合需要服务器搭建面板或节点的用户。"
      items={servers}
    />}

    {residentialIps.length > 0 && <ResourceSection
      icon={Network}
      tone="emerald"
      title="住宅 IP 厂商推荐"
      description="适合需要住宅网络出口或地区覆盖的用户。"
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

  return <article className="resource-card">
    <div className="resource-card-top">
      <span className="resource-logo">{logo ? <img src={logo} alt={`${item.name} Logo`} /> : <Building2 />}</span>
      <div><h3>{item.name}</h3>{item.badge && <span className="resource-badge"><Tag />{item.badge}</span>}</div>
    </div>
    {item.description && <p className="resource-description">{item.description}</p>}
    <a className="resource-purchase-button" href={item.purchaseUrl} target={item.openInNewTab ? '_blank' : undefined} rel={item.openInNewTab ? 'noreferrer' : undefined}>
      <span>{item.buttonLabel || '了解详情'}</span><ArrowUpRight />
    </a>
  </article>;
};
