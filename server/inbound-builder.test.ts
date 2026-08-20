import assert from "node:assert/strict";
import test from "node:test";
import { buildInbound, buildSubscriptionUrl, REALITY_TARGETS, selectRealityTarget } from "./inbound-builder.js";

test("buildInbound creates a valid VLESS TCP Reality payload and share link", () => {
  const built = buildInbound({
    nodeName: "reality-node",
    protocol: "VLESS",
    transport: "TCP",
    security: "Reality",
    inboundPort: 443,
    sni: "www.microsoft.com",
    shortId: "a1b2c3d4",
  }, { privateKey: "private-key", publicKey: "public-key" });

  assert.equal(built.payload.protocol, "vless");
  assert.equal(built.payload.streamSettings.realitySettings.privateKey, "private-key");
  assert.equal(built.payload.settings.clients[0].flow, "xtls-rprx-vision");
  const link = built.shareLink("node.example.com", "public-key");
  assert.match(link, /^vless:\/\//);
  assert.match(link, /pbk=public-key/);
  assert.match(link, /sid=a1b2c3d4/);
  assert.match(link, /sni=www.microsoft.com/);
});

test("Reality blank SNI follows the automatic target list used by the 3x-ui panel", () => {
  assert.deepEqual(selectRealityTarget(() => 0), REALITY_TARGETS[0]);
  assert.deepEqual(selectRealityTarget(() => 0.999), REALITY_TARGETS.at(-1));

  const built = buildInbound({ protocol: "VLESS", transport: "TCP", security: "Reality" }, {
    privateKey: "private-key",
    publicKey: "public-key",
  });
  const settings = built.payload.streamSettings.realitySettings;
  assert.ok(REALITY_TARGETS.some(item => item.target === settings.target && item.sni === settings.serverNames[0]));
  assert.match(built.shareLink("node.example.com", "public-key"), new RegExp(`sni=${settings.serverNames[0].replaceAll(".", "\\.")}`));
});

test("official Reality inbound requires client version 1.0.0 while other panels remain unchanged", () => {
  const reality = { privateKey: "private-key", publicKey: "public-key" };
  const official = buildInbound({
    protocol: "VLESS",
    transport: "TCP",
    security: "Reality",
    panelFlavor: "official",
  }, reality);
  const recommended = buildInbound({
    protocol: "VLESS",
    transport: "TCP",
    security: "Reality",
    panelFlavor: "mogai",
  }, reality);

  assert.equal(official.payload.streamSettings.realitySettings.minClientVer, "1.0.0");
  assert.equal(recommended.payload.streamSettings.realitySettings.minClientVer, "");
});

test("TLS inbound uses certificate paths obtained from the panel", () => {
  const built = buildInbound({
    protocol: "VMess",
    transport: "WebSocket",
    security: "TLS",
    inboundPort: 8443,
    sni: "panel.example.com",
    tlsCertFile: "/root/cert/panel/fullchain.pem",
    tlsKeyFile: "/root/cert/panel/privkey.pem",
    pathOrServiceName: "/ws",
  });
  const certificate = built.payload.streamSettings.tlsSettings.certificates[0];
  assert.equal(certificate.certificateFile, "/root/cert/panel/fullchain.pem");
  assert.equal(certificate.keyFile, "/root/cert/panel/privkey.pem");
  assert.equal(built.payload.streamSettings.wsSettings.path, "/ws/");
});

test("Shadowsocks 2022 share link combines the server and client keys", () => {
  for (const panelFlavor of ["mogai", "official", "compatible"] as const) {
    const built = buildInbound({
      nodeName: `ss-${panelFlavor}`,
      protocol: "Shadowsocks",
      transport: "TCP",
      security: "None",
      inboundPort: 8388,
      panelFlavor,
    });
    const settings = built.payload.settings;
    const encoded = built.shareLink("node.example.com").match(/^ss:\/\/([^@]+)@/)?.[1];
    assert.equal(settings.method, "2022-blake3-aes-256-gcm");
    assert.equal(Buffer.from(settings.password, "base64").length, 32);
    assert.equal(Buffer.from(settings.clients[0].password, "base64").length, 32);
    assert.ok(encoded);
    assert.equal(
      Buffer.from(encoded, "base64url").toString(),
      `${settings.method}:${settings.password}:${settings.clients[0].password}`,
    );
  }
});

test("common protocol payloads match the panel's persisted defaults", () => {
  for (const protocol of ["VLESS", "VMess", "Trojan"] as const) {
    const built = buildInbound({
      protocol,
      transport: "TCP",
      security: "None",
      panelFlavor: "mogai",
    });
    assert.equal(built.payload.up, 0);
    assert.equal(built.payload.down, 0);
    assert.equal(built.payload.trafficReset, "never");
    assert.equal(built.payload.lastTrafficResetTime, 0);
    assert.equal("fallbacks" in built.payload.settings, false);
    assert.equal("ipsExcluded" in built.payload.sniffing, false);
    assert.equal("domainsExcluded" in built.payload.sniffing, false);
  }
});

test("gRPC payload omits fields not serialized by mogai 2.9.4 and 2.9.5", () => {
  const built = buildInbound({
    protocol: "VMess",
    transport: "gRPC",
    security: "None",
    panelFlavor: "mogai",
    pathOrServiceName: "/service",
  });
  assert.deepEqual(built.payload.streamSettings.grpcSettings, {
    serviceName: "service",
    authority: "",
    multiMode: false,
  });
});

test("mKCP and WebSocket links preserve the server transport parameters", () => {
  const kcp = buildInbound({
    protocol: "VLESS",
    transport: "mKCP",
    security: "None",
    inboundPort: 24444,
  });
  assert.equal(kcp.payload.streamSettings.kcpSettings.tti, 20);
  const kcpLink = new URL(kcp.shareLink("node.example.com"));
  assert.equal(kcpLink.searchParams.get("mtu"), "1350");
  assert.equal(kcpLink.searchParams.get("tti"), "20");

  const ws = buildInbound({
    protocol: "VLESS",
    transport: "WebSocket",
    security: "None",
    inboundPort: 25555,
    sni: "cdn.example.com",
    pathOrServiceName: "/ws",
  });
  const wsLink = new URL(ws.shareLink("node.example.com"));
  assert.equal(wsLink.searchParams.get("path"), "/ws/");
  assert.equal(wsLink.searchParams.get("host"), "cdn.example.com");
});

test("unsupported combinations and incomplete TLS are rejected", () => {
  assert.throws(() => buildInbound({ protocol: "VLESS", transport: "gRPC", security: "Reality" }), /仅支持 VLESS \+ TCP/);
  assert.throws(() => buildInbound({ protocol: "VMess", transport: "TCP", security: "TLS", sni: "example.com" }), /面板返回的证书配置/);
  assert.throws(() => buildInbound({ protocol: "Shadowsocks", transport: "WebSocket", security: "None" }), /仅支持 TCP/);
  assert.throws(() => buildInbound({ protocol: "VMess", transport: "mKCP", security: "TLS" }), /mKCP 不支持 TLS/);
});

test("subscription URL is returned only when enabled by the real panel", () => {
  assert.equal(buildSubscriptionUrl({ subEnable: true, subURI: "https://sub.example.com/sub/" }, "client-id"), "https://sub.example.com/sub/client-id");
  assert.equal(buildSubscriptionUrl({ subEnable: false, subURI: "https://sub.example.com/sub/" }, "client-id"), "");
});
