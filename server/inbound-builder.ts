import { randomBytes, randomUUID } from "node:crypto";
import { normalizeWebPath, optionalString, randomToken, validPort } from "./validation.js";

export type Protocol = "VLESS" | "VMess" | "Trojan" | "Shadowsocks";
export type Transport = "TCP" | "WebSocket" | "gRPC" | "mKCP";
export type Security = "None" | "TLS" | "Reality";

export interface InboundInput {
  nodeName?: string;
  protocol?: Protocol;
  transport?: Transport;
  security?: Security;
  inboundPort?: string | number;
  trafficLimitGb?: number;
  expireDays?: number;
  sni?: string;
  shortId?: string;
  tlsCertFile?: string;
  tlsKeyFile?: string;
  pathOrServiceName?: string;
}

export interface BuiltInbound {
  payload: Record<string, any>;
  credential: string;
  clientSubId: string;
  tag: string;
  port: number;
  shareLink: (address: string, realityPublicKey?: string) => string;
}

export const REALITY_TARGETS = [
  { target: "www.amazon.com:443", sni: "www.amazon.com" },
  { target: "aws.amazon.com:443", sni: "aws.amazon.com" },
  { target: "www.oracle.com:443", sni: "www.oracle.com" },
  { target: "www.nvidia.com:443", sni: "www.nvidia.com" },
  { target: "www.amd.com:443", sni: "www.amd.com" },
  { target: "www.intel.com:443", sni: "www.intel.com" },
  { target: "www.sony.com:443", sni: "www.sony.com" },
] as const;

export function selectRealityTarget(random = Math.random): { target: string; sni: string } {
  const index = Math.min(Math.floor(random() * REALITY_TARGETS.length), REALITY_TARGETS.length - 1);
  return { ...REALITY_TARGETS[Math.max(0, index)] };
}

const transportMap: Record<Transport, string> = {
  TCP: "tcp",
  WebSocket: "ws",
  gRPC: "grpc",
  mKCP: "kcp",
};

function makeStreamSettings(input: InboundInput, reality?: { privateKey: string; publicKey: string }) {
  const transport = input.transport || "TCP";
  const security = input.security || "Reality";
  const network = transportMap[transport];
  const path = normalizeWebPath(input.pathOrServiceName || "/xui-node");
  const stream: Record<string, any> = { network, security: security.toLowerCase() };

  if (network === "tcp") stream.tcpSettings = { acceptProxyProtocol: false, header: { type: "none" } };
  if (network === "ws") stream.wsSettings = { acceptProxyProtocol: false, path, host: optionalString(input.sni), headers: {}, heartbeatPeriod: 0 };
  if (network === "grpc") stream.grpcSettings = { serviceName: path.replace(/^\//, ""), authority: "", multiMode: false, user_agent: "" };
  if (network === "kcp") stream.kcpSettings = { mtu: 1350, tti: 20, uplinkCapacity: 5, downlinkCapacity: 20, cwndMultiplier: 1, maxSendingWindow: 2_097_152 };

  if (security === "Reality") {
    if (input.protocol !== "VLESS" || transport !== "TCP") throw new Error("当前稳定实现仅支持 VLESS + TCP + Reality");
    if (!reality) throw new Error("缺少 Reality 密钥对");
    const automaticTarget = selectRealityTarget();
    const sni = optionalString(input.sni) || automaticTarget.sni;
    const target = optionalString(input.sni) ? `${sni}:443` : automaticTarget.target;
    const shortId = optionalString(input.shortId) || randomBytes(4).toString("hex");
    if (!/^[0-9a-fA-F]{2,16}$/.test(shortId) || shortId.length % 2 !== 0) throw new Error("Reality Short ID 必须是 2-16 位偶数长度十六进制字符串");
    stream.realitySettings = {
      show: false,
      xver: 0,
      target,
      serverNames: [sni],
      privateKey: reality.privateKey,
      minClientVer: "",
      maxClientVer: "",
      maxTimediff: 0,
      shortIds: [shortId],
      mldsa65Seed: "",
      settings: { publicKey: reality.publicKey, fingerprint: "chrome", serverName: "", spiderX: "/", mldsa65Verify: "" },
    };
  }

  if (security === "TLS") {
    const sni = optionalString(input.sni);
    const certificateFile = optionalString(input.tlsCertFile);
    const keyFile = optionalString(input.tlsKeyFile);
    if (!sni || !certificateFile || !keyFile) throw new Error("TLS 入站缺少 SNI 或面板返回的证书配置");
    stream.tlsSettings = {
      serverName: sni,
      minVersion: "1.2",
      maxVersion: "1.3",
      cipherSuites: "",
      rejectUnknownSni: false,
      disableSystemRoot: false,
      enableSessionResumption: false,
      certificates: [{ certificateFile, keyFile, oneTimeLoading: false, usage: "encipherment", buildChain: false }],
      alpn: ["h2", "http/1.1"],
      echServerKeys: "",
      settings: { fingerprint: "chrome", echConfigList: "" },
    };
  }
  return stream;
}

export function buildInbound(input: InboundInput, reality?: { privateKey: string; publicKey: string }): BuiltInbound {
  const protocol = input.protocol || "VLESS";
  const transport = input.transport || "TCP";
  const security = input.security || "Reality";
  if (protocol === "Shadowsocks" && (transport !== "TCP" || security !== "None")) throw new Error("Shadowsocks 当前仅支持 TCP + None");
  if (transport === "mKCP" && security !== "None") throw new Error("mKCP 不支持 TLS 或 Reality，请使用 None");
  if (security === "Reality" && (protocol !== "VLESS" || transport !== "TCP")) throw new Error("Reality 当前仅支持 VLESS + TCP");

  const port = input.inboundPort ? validPort(input.inboundPort) : 15_000 + Math.floor(Math.random() * 40_000);
  const name = optionalString(input.nodeName) || `node-${port}`;
  const tag = `in-${protocol.toLowerCase()}-${port}-${randomToken(3)}`;
  const email = `${name.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32)}-${randomToken(3)}`;
  const subId = randomToken(8);
  const expiryTime = input.expireDays && input.expireDays > 0 ? Date.now() + input.expireDays * 86_400_000 : 0;
  const totalGB = input.trafficLimitGb && input.trafficLimitGb > 0 ? Math.round(input.trafficLimitGb * 1024 ** 3) : 0;
  let credential: string = randomUUID();
  let shadowsocksServerPassword = "";
  let settings: Record<string, any>;

  const commonClient = { email, limitIp: 0, totalGB, expiryTime, enable: true, tgId: 0, subId, comment: "", reset: 0 };
  if (protocol === "VLESS") settings = { clients: [{ id: credential, flow: security === "Reality" ? "xtls-rprx-vision" : "", ...commonClient }], decryption: "none", encryption: "none", fallbacks: [] };
  else if (protocol === "VMess") settings = { clients: [{ id: credential, security: "auto", ...commonClient }] };
  else if (protocol === "Trojan") {
    credential = randomToken(16);
    settings = { clients: [{ password: credential, ...commonClient }], fallbacks: [] };
  } else {
    credential = randomBytes(16).toString("base64");
    shadowsocksServerPassword = randomBytes(16).toString("base64");
    settings = { method: "2022-blake3-aes-128-gcm", password: shadowsocksServerPassword, network: "tcp,udp", clients: [{ method: "", password: credential, ...commonClient }], ivCheck: false };
  }

  const streamSettings = makeStreamSettings({ ...input, protocol, transport, security }, reality);
  const payload = {
    enable: true,
    remark: name,
    listen: "",
    port,
    protocol: protocol.toLowerCase(),
    expiryTime: 0,
    total: 0,
    tag,
    settings,
    streamSettings,
    sniffing: { enabled: true, destOverride: ["http", "tls", "quic", "fakedns"], metadataOnly: false, routeOnly: false, ipsExcluded: [], domainsExcluded: [] },
  };

  return {
    payload,
    credential,
    clientSubId: subId,
    tag,
    port,
    shareLink: (address, realityPublicKey) => buildShareLink({ input: { ...input, protocol, transport, security }, address, port, name, credential, shadowsocksServerPassword, streamSettings, realityPublicKey }),
  };
}

function buildShareLink(args: { input: InboundInput & { protocol: Protocol; transport: Transport; security: Security }; address: string; port: number; name: string; credential: string; shadowsocksServerPassword?: string; streamSettings: any; realityPublicKey?: string }) {
  const { input, address, port, name, credential, shadowsocksServerPassword, streamSettings } = args;
  const label = encodeURIComponent(name);
  const type = transportMap[input.transport];
  if (input.protocol === "Shadowsocks") {
    if (!shadowsocksServerPassword) throw new Error("Shadowsocks 2022 缺少服务器主密钥");
    const auth = Buffer.from(`2022-blake3-aes-128-gcm:${shadowsocksServerPassword}:${credential}`).toString("base64url");
    return `ss://${auth}@${address}:${port}#${label}`;
  }
  if (input.protocol === "VMess") {
    return `vmess://${Buffer.from(JSON.stringify({ v: "2", ps: name, add: address, port: String(port), id: credential, aid: "0", scy: "auto", net: type, type: "none", host: optionalString(input.sni), path: streamSettings.wsSettings?.path || streamSettings.grpcSettings?.serviceName || "", mtu: streamSettings.kcpSettings?.mtu, tti: streamSettings.kcpSettings?.tti, tls: input.security === "TLS" ? "tls" : "", sni: optionalString(input.sni) })).toString("base64")}`;
  }
  const params = new URLSearchParams({ type, security: input.security.toLowerCase() });
  if (type === "ws") {
    params.set("path", streamSettings.wsSettings.path);
    const host = optionalString(streamSettings.wsSettings.host);
    if (host) params.set("host", host);
  }
  if (type === "grpc") params.set("serviceName", streamSettings.grpcSettings.serviceName);
  if (type === "kcp") {
    params.set("mtu", String(streamSettings.kcpSettings.mtu));
    params.set("tti", String(streamSettings.kcpSettings.tti));
  }
  const effectiveSni = input.security === "Reality"
    ? streamSettings.realitySettings?.serverNames?.[0]
    : optionalString(input.sni);
  if (effectiveSni) params.set("sni", effectiveSni);
  if (input.security === "TLS") params.set("fp", "chrome");
  if (input.security === "Reality") {
    params.set("pbk", args.realityPublicKey || "");
    params.set("fp", "chrome");
    params.set("sid", streamSettings.realitySettings.shortIds[0]);
    params.set("flow", "xtls-rprx-vision");
  }
  const scheme = input.protocol === "Trojan" ? "trojan" : "vless";
  return `${scheme}://${credential}@${address}:${port}?${params.toString()}#${label}`;
}

export function buildSubscriptionUrl(settings: Record<string, any>, subId: string): string {
  return settings?.subEnable && typeof settings.subURI === "string" && settings.subURI.trim()
    ? `${settings.subURI}${subId}`
    : "";
}
