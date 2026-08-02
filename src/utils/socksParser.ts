import { SocksItem } from '../types';

export function parseSocksInput(rawText: string): SocksItem[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  const items: SocksItem[] = [];

  lines.forEach((line, index) => {
    let clean = line;
    let user: string | undefined;
    let pass: string | undefined;
    let address = '';
    let port = 1080;
    let valid = false;

    try {
      // Remove socks5:// or socks:// prefix
      if (clean.startsWith('socks5://') || clean.startsWith('socks://')) {
        clean = clean.replace(/^socks(5)?:\/\//, '');
      }

      // Format: user:pass@ip:port
      if (clean && clean.includes('@')) {
        const [authPart = '', hostPart = ''] = clean.split('@');
        if (authPart && authPart.includes(':')) {
          const [u, p] = authPart.split(':');
          user = u;
          pass = p;
        } else if (authPart) {
          user = authPart;
        }

        if (hostPart && hostPart.includes(':')) {
          const [h, p] = hostPart.split(':');
          address = h;
          port = parseInt(p, 10) || 1080;
          valid = !!address && !isNaN(port);
        }
      } else if (clean) {
        // Formats: ip:port:user:pass OR ip:port
        const parts = clean.split(':');
        if (parts.length === 4) {
          address = parts[0];
          port = parseInt(parts[1], 10) || 1080;
          user = parts[2];
          pass = parts[3];
          valid = !!address && !isNaN(port);
        } else if (parts.length === 2) {
          address = parts[0];
          port = parseInt(parts[1], 10) || 1080;
          valid = !!address && !isNaN(port);
        } else if (parts.length === 3) {
          address = parts[0];
          port = parseInt(parts[1], 10) || 1080;
          user = parts[2];
          valid = !!address && !isNaN(port);
        }
      }

      if (valid) {
        items.push({
          id: `socks-${index + 1}-${Date.now()}`,
          raw: line,
          address,
          port,
          user,
          pass,
          valid: true,
          tag: `socks-out-${index + 1}`
        });
      }
    } catch {
      // Invalid line, skip or mark invalid
    }
  });

  return items;
}

export function generateSocksXrayConfig(
  socksList: SocksItem[],
  nodeTag: string = 'inbound-new-node',
  enableLoadBalance: boolean = false
) {
  if (socksList.length === 0) {
    return {
      outbounds: [],
      routingRules: [],
      explanation: '未填写或未检测到有效的 SOCKS 代理。'
    };
  }

  const outbounds = socksList.map((s, idx) => {
    const outboundObj: any = {
      tag: s.tag,
      protocol: 'socks',
      settings: {
        servers: [
          {
            address: s.address,
            port: s.port,
            users: s.user && s.pass ? [{ user: s.user, pass: s.pass }] : []
          }
        ]
      }
    };
    return outboundObj;
  });

  let routingRules: any[] = [];
  let explanation = '';

  if (enableLoadBalance && socksList.length > 1) {
    const outboundTags = socksList.map(s => s.tag);
    routingRules = [
      {
        type: 'field',
        inboundTag: [nodeTag],
        balancerTag: 'socks-balancer',
        comment: '3-xui: 自动注入 - 将该节点流量负载均衡分发至 SOCKS 代理池'
      }
    ];

    explanation = `已为 节点【${nodeTag}】自动生成 ${socksList.length} 个 SOCKS 出站 (Outbound)，并绑定负载均衡器 (socks-balancer)，实现多 SOCKS 链式轮询出口。`;
  } else {
    // Direct routing to the first / all socks
    const primaryTag = socksList[0].tag;
    routingRules = [
      {
        type: 'field',
        inboundTag: [nodeTag],
        outboundTag: primaryTag,
        comment: `3-xui: 自动注入 - 将节点流量强制经由 SOCKS 出站(${primaryTag})转发`
      }
    ];

    if (socksList.length > 1) {
      explanation = `已为节点【${nodeTag}】配置主出站 ${primaryTag} (${socksList[0].address}:${socksList[0].port})。另外 ${socksList.length - 1} 个 SOCKS 已备用写入出站列表。`;
    } else {
      explanation = `已为节点【${nodeTag}】注入单链式 SOCKS 出站 (${socksList[0].address}:${socksList[0].port})，节点所有流量将经过该 SOCKS 5 代理中继落地。`;
    }
  }

  return {
    outbounds,
    routingRules,
    explanation
  };
}
