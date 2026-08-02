import assert from "node:assert/strict";
import test from "node:test";
import { injectSocksRouting, parseSocksInput } from "./xray-template.js";

test("parseSocksInput accepts URL and colon formats", () => {
  const proxies = parseSocksInput("socks5://user:pass@127.0.0.1:1080\n192.0.2.2:2080:u:p");
  assert.equal(proxies.length, 2);
  assert.equal(proxies[0].user, "user");
  assert.equal(proxies[1].port, 2080);
});

test("injectSocksRouting preserves existing template and creates a balancer", () => {
  const original = {
    outbounds: [{ tag: "direct", protocol: "freedom" }],
    routing: { rules: [{ type: "field", outboundTag: "direct", network: "tcp" }] },
  };
  const proxies = parseSocksInput("127.0.0.1:1080\n127.0.0.2:1080");
  const result = injectSocksRouting(original, proxies, "in-vless-443", true, true);

  assert.equal(original.outbounds.length, 1);
  assert.equal(result.outbounds.length, 2);
  assert.equal(result.config.outbounds.length, 3);
  assert.equal(result.config.routing.balancers.length, 1);
  assert.equal(result.rules[0].inboundTag[0], "in-vless-443");
  assert.equal(result.rules[0].balancerTag, result.balancer?.tag);
});
