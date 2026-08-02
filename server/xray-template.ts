export interface SocksProxy {
  id: string;
  raw: string;
  address: string;
  port: number;
  user?: string;
  pass?: string;
  valid: boolean;
  tag: string;
}

export function parseSocksInput(rawInput: unknown): SocksProxy[] {
  if (typeof rawInput !== "string" || !rawInput.trim()) return [];
  const items: SocksProxy[] = [];
  for (const [index, rawLine] of rawInput.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      const url = /^socks(5)?:\/\//i.test(line) ? new URL(line.replace(/^socks:\/\//i, "socks5://")) : null;
      let address = "";
      let port = 0;
      let user = "";
      let pass = "";
      if (url) {
        address = url.hostname;
        port = Number(url.port || 1080);
        user = decodeURIComponent(url.username);
        pass = decodeURIComponent(url.password);
      } else {
        const parts = line.split(":");
        if (parts.length !== 2 && parts.length !== 4) continue;
        [address] = parts;
        port = Number(parts[1]);
        user = parts[2] || "";
        pass = parts[3] || "";
      }
      if (!address || !Number.isInteger(port) || port < 1 || port > 65535) continue;
      items.push({ id: `socks-${index + 1}`, raw: line, address, port, user: user || undefined, pass: pass || undefined, valid: true, tag: `pending-${index + 1}` });
    } catch {
      continue;
    }
  }
  return items;
}

export function injectSocksRouting(config: any, proxies: SocksProxy[], inboundTag: string, enableRouting: boolean, enableLoadBalance: boolean) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("面板 Xray 模板不是有效 JSON 对象");
  const next = structuredClone(config);
  next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  next.routing = next.routing && typeof next.routing === "object" ? next.routing : {};
  next.routing.rules = Array.isArray(next.routing.rules) ? next.routing.rules : [];
  next.routing.balancers = Array.isArray(next.routing.balancers) ? next.routing.balancers : [];

  const prefix = `assistant-${inboundTag}`;
  const tags = proxies.map((proxy, index) => `${prefix}-socks-${index + 1}`);
  next.outbounds = next.outbounds.filter((outbound: any) => !String(outbound?.tag || "").startsWith(prefix));
  next.routing.rules = next.routing.rules.filter((rule: any) => !(Array.isArray(rule?.inboundTag) && rule.inboundTag.includes(inboundTag)));
  next.routing.balancers = next.routing.balancers.filter((balancer: any) => balancer?.tag !== `${prefix}-balancer`);

  const outbounds = proxies.map((proxy, index) => ({
    tag: tags[index],
    protocol: "socks",
    settings: { servers: [{ address: proxy.address, port: proxy.port, ...(proxy.user ? { users: [{ user: proxy.user, pass: proxy.pass || "" }] } : {}) }] },
  }));
  next.outbounds.push(...outbounds);

  let rule: any = null;
  let balancer: any = null;
  if (enableRouting && tags.length) {
    if (enableLoadBalance && tags.length > 1) {
      balancer = { tag: `${prefix}-balancer`, selector: tags, strategy: { type: "random" } };
      next.routing.balancers.push(balancer);
      rule = { type: "field", inboundTag: [inboundTag], balancerTag: balancer.tag };
    } else {
      rule = { type: "field", inboundTag: [inboundTag], outboundTag: tags[0] };
    }
    next.routing.rules.unshift(rule);
  }
  const decorated = proxies.map((proxy, index) => ({ ...proxy, tag: tags[index] }));
  return { config: next, proxies: decorated, outbounds, rules: rule ? [rule] : [], balancer };
}
