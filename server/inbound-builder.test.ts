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

test("unsupported combinations and incomplete TLS are rejected", () => {
  assert.throws(() => buildInbound({ protocol: "VLESS", transport: "gRPC", security: "Reality" }), /仅支持 VLESS \+ TCP/);
  assert.throws(() => buildInbound({ protocol: "VMess", transport: "TCP", security: "TLS", sni: "example.com" }), /面板返回的证书配置/);
  assert.throws(() => buildInbound({ protocol: "Shadowsocks", transport: "WebSocket", security: "None" }), /仅支持 TCP/);
});

test("subscription URL is returned only when enabled by the real panel", () => {
  assert.equal(buildSubscriptionUrl({ subEnable: true, subURI: "https://sub.example.com/sub/" }, "client-id"), "https://sub.example.com/sub/client-id");
  assert.equal(buildSubscriptionUrl({ subEnable: false, subURI: "https://sub.example.com/sub/" }, "client-id"), "");
});
