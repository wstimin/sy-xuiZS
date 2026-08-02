import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCookieHeader,
  parseApiTokenFromOutput,
  parseApiTokenResponse,
  parseWebCertFiles,
  parseXrayTemplateResponse,
  serializeInboundPayload,
  XuiClient,
} from "./xui-client.js";

test("mergeCookieHeader preserves the CSRF session and replaces updated cookies", () => {
  const cookie = mergeCookieHeader(
    "session=old; locale=zh-CN",
    ["session=new; Path=/; HttpOnly", "csrf=token; Path=/; SameSite=Strict"],
  );
  assert.equal(cookie, "session=new; locale=zh-CN; csrf=token");
});

test("parseApiTokenResponse accepts token response variants", () => {
  assert.equal(parseApiTokenResponse({ token: "token-a" }), "token-a");
  assert.equal(parseApiTokenResponse({ apiToken: "token-b" }), "token-b");
  assert.equal(parseApiTokenResponse({ data: { access_token: "token-c" } }), "token-c");
  assert.equal(parseApiTokenResponse("token-d"), "token-d");
});

test("parseApiTokenResponse rejects empty token responses", () => {
  assert.throws(() => parseApiTokenResponse({ token: "" }), /没有返回有效的 API Token/);
});

test("parseWebCertFiles accepts current and legacy TLS field names", () => {
  assert.deepEqual(parseWebCertFiles({
    defaultCert: "/root/cert/fullchain.pem",
    defaultKey: "/root/cert/privkey.pem",
  }), {
    webCertFile: "/root/cert/fullchain.pem",
    webKeyFile: "/root/cert/privkey.pem",
  });
  assert.deepEqual(parseWebCertFiles({
    webCertFile: "/legacy/fullchain.pem",
    webKeyFile: "/legacy/privkey.pem",
  }), {
    webCertFile: "/legacy/fullchain.pem",
    webKeyFile: "/legacy/privkey.pem",
  });
  assert.throws(() => parseWebCertFiles({ defaultCert: "" }), /尚未配置可复用的 Web TLS 证书/);
});

test("serializeInboundPayload encodes the JSON string fields expected by 3x-ui", () => {
  const payload = serializeInboundPayload({
    port: 443,
    settings: { clients: [{ id: "uuid" }] },
    streamSettings: { network: "tcp" },
    sniffing: { enabled: true },
  });
  assert.equal(payload.port, 443);
  assert.equal(payload.settings, '{"clients":[{"id":"uuid"}]}');
  assert.equal(payload.streamSettings, '{"network":"tcp"}');
  assert.equal(payload.sniffing, '{"enabled":true}');
});

test("parseApiTokenFromOutput extracts installer tokens and strips ANSI colors", () => {
  assert.equal(parseApiTokenFromOutput("\u001b[32mAPI Token: token-from-installer\u001b[0m\n"), "token-from-installer");
  assert.equal(parseApiTokenFromOutput("apiToken: token-from-cli\n"), "token-from-cli");
  assert.equal(parseApiTokenFromOutput("installation complete\n"), "");
});

test("parseXrayTemplateResponse parses the JSON string returned by 3x-ui", () => {
  const result = parseXrayTemplateResponse(JSON.stringify({
    xraySetting: {
      outbounds: [{ tag: "direct", protocol: "freedom" }],
      routing: { rules: [] },
    },
    inboundTags: ["api"],
    outboundTestUrl: "https://www.google.com/generate_204",
  }));

  assert.deepEqual(result.xraySetting, {
    outbounds: [{ tag: "direct", protocol: "freedom" }],
    routing: { rules: [] },
  });
  assert.equal(result.outboundTestUrl, "https://www.google.com/generate_204");
});

test("parseXrayTemplateResponse rejects malformed JSON", () => {
  assert.throws(
    () => parseXrayTemplateResponse("{not-json"),
    /不是有效 JSON/,
  );
});

test("parseXrayTemplateResponse rejects responses without xraySetting", () => {
  assert.throws(
    () => parseXrayTemplateResponse(JSON.stringify({ outboundTestUrl: "" })),
    /缺少 xraySetting/,
  );
});

test("parseXrayTemplateResponse rejects an already-decoded object", () => {
  assert.throws(
    () => parseXrayTemplateResponse({ xraySetting: {} }),
    /预期为 JSON 字符串/,
  );
});

test("XuiClient reads Token and TLS settings through Session routes", async () => {
  const calls: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method || "GET", headers, body: String(init?.body || "") });

    if (url.pathname === "/base/csrf-token") {
      return new Response(JSON.stringify({ success: true, obj: "csrf-value" }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=anonymous; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/login") {
      if (!headers.get("X-CSRF-Token")) return new Response(null, { status: 403 });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=logged-in; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/panel/setting/getApiToken") {
      return Response.json({ success: true, obj: "panel-api-token" });
    }
    if (url.pathname === "/base/panel/setting/defaultSettings") {
      return Response.json({
        success: true,
        obj: { defaultCert: "/cert/fullchain.pem", defaultKey: "/cert/privkey.pem", subEnable: true },
      });
    }
    if (url.pathname === "/base/panel/api/inbounds/add") {
      return Response.json({ success: true, obj: { id: 21 } });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelPort: 2053,
    panelPath: "/base/",
    panelUser: "admin",
    panelPass: "password",
  }, mockFetch);

  await client.authenticate();
  assert.equal(await client.getApiToken(), "panel-api-token");
  assert.deepEqual(await client.getWebCertFiles(), {
    webCertFile: "/cert/fullchain.pem",
    webKeyFile: "/cert/privkey.pem",
  });
  assert.deepEqual(await client.addInbound({
    port: 443,
    settings: { clients: [] },
    streamSettings: { network: "tcp" },
    sniffing: { enabled: true },
  }), { id: 21 });

  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
    ["POST", "/base/login"],
    ["GET", "/base/csrf-token"],
    ["POST", "/base/login"],
    ["GET", "/base/panel/setting/getApiToken"],
    ["POST", "/base/panel/setting/defaultSettings"],
    ["POST", "/base/panel/api/inbounds/add"],
  ]);
  assert.equal(calls[0].headers.get("Cookie"), null);
  assert.equal(calls[0].headers.get("X-CSRF-Token"), null);
  assert.equal(calls[2].headers.get("Cookie"), "3x-ui=anonymous");
  assert.equal(calls[2].headers.get("X-CSRF-Token"), "csrf-value");
  assert.deepEqual(JSON.parse(calls[2].body), { username: "admin", password: "password" });
  assert.equal(calls[3].headers.get("Cookie"), "3x-ui=logged-in");
  assert.equal(calls[3].headers.get("Authorization"), null);
  assert.equal(calls[4].headers.get("Cookie"), "3x-ui=logged-in");
  assert.equal(calls[4].headers.get("X-CSRF-Token"), "csrf-value");
  assert.equal(calls[4].headers.get("Authorization"), null);
  assert.equal(calls[5].headers.get("Authorization"), "Bearer panel-api-token");
  assert.equal(calls[5].headers.get("Cookie"), null);
  assert.equal(calls[5].headers.get("X-CSRF-Token"), null);
});

test("XuiClient reads TLS settings directly from legacy panels with saved credentials", async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });

    if (url.pathname === "/base/login") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=legacy-session; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/panel/setting/defaultSettings") {
      return Response.json({
        success: true,
        obj: { webCertFile: "/legacy/fullchain.pem", webKeyFile: "/legacy/privkey.pem" },
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelPath: "/base/",
    panelUser: "admin",
    panelPass: "password",
  }, mockFetch);

  assert.deepEqual(await client.getWebCertFiles(), {
    webCertFile: "/legacy/fullchain.pem",
    webKeyFile: "/legacy/privkey.pem",
  });
  assert.deepEqual(calls.map(call => call.url.pathname), [
    "/base/login",
    "/base/panel/setting/defaultSettings",
  ]);
  assert.equal(calls[0].headers.get("X-CSRF-Token"), null);
  assert.equal(calls[1].headers.get("Cookie"), "3x-ui=legacy-session");
});

test("XuiClient uses Bearer Token for management APIs and serializes inbound fields", async () => {
  const calls: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    calls.push({
      url,
      method: init?.method || "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body || ""),
    });
    if (url.pathname === "/panel/api/server/getNewX25519Cert") {
      return Response.json({ success: true, obj: { privateKey: "private", publicKey: "public" } });
    }
    if (url.pathname === "/panel/api/inbounds/add") {
      return Response.json({ success: true, obj: { id: 12 } });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({ panelAddress: "panel.example", panelToken: "bearer-token" }, mockFetch);
  await client.authenticate();
  assert.deepEqual(await client.getRealityKeyPair(), { privateKey: "private", publicKey: "public" });
  assert.deepEqual(await client.addInbound({
    port: 443,
    settings: { clients: [] },
    streamSettings: { network: "tcp" },
    sniffing: { enabled: true },
  }), { id: 12 });

  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
    ["GET", "/panel/api/server/getNewX25519Cert"],
    ["POST", "/panel/api/inbounds/add"],
  ]);
  assert.equal(calls[0].headers.get("Authorization"), "Bearer bearer-token");
  assert.equal(calls[1].headers.get("Authorization"), "Bearer bearer-token");
  assert.equal(calls[1].headers.get("X-CSRF-Token"), null);
  const body = JSON.parse(calls[1].body);
  assert.equal(body.settings, '{"clients":[]}');
  assert.equal(body.streamSettings, '{"network":"tcp"}');
  assert.equal(body.sniffing, '{"enabled":true}');
});

test("XuiClient aborts an in-flight panel request when the parent signal is cancelled", async () => {
  const controller = new AbortController();
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => { requestStarted = resolve; });
  const mockFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestStarted();
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelToken: "bearer-token",
    signal: controller.signal,
  }, mockFetch);

  const request = client.getRealityKeyPair();
  await started;
  controller.abort();
  await assert.rejects(request, /节点创建已终止/);
});

test("XuiClient uses Bearer for inbound list/delete and Session for Xray settings", async () => {
  const calls: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    calls.push({
      url,
      method: init?.method || "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body || ""),
    });

    if (url.pathname === "/base/csrf-token") {
      return new Response(JSON.stringify({ success: true, obj: "csrf-value" }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=anonymous; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/login") {
      if (!new Headers(init?.headers).get("X-CSRF-Token")) return new Response(null, { status: 403 });
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=logged-in; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/panel/api/inbounds/list") {
      return Response.json({ success: true, obj: [{ id: 31, tag: "inbound-31" }] });
    }
    if (url.pathname === "/base/panel/api/inbounds/del/31") {
      return Response.json({ success: true });
    }
    if (url.pathname === "/base/panel/xray/") {
      return Response.json({
        success: true,
        obj: JSON.stringify({
          xraySetting: { outbounds: [], routing: { rules: [] } },
          outboundTestUrl: "https://example.com/generate_204",
        }),
      });
    }
    if (url.pathname === "/base/panel/xray/update") {
      return Response.json({ success: true });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelPath: "/base/",
    panelUser: "admin",
    panelPass: "password",
    panelToken: "bearer-token",
  }, mockFetch);

  await client.authenticate();
  assert.deepEqual(await client.request("panel/api/inbounds/list"), [{ id: 31, tag: "inbound-31" }]);
  await client.deleteInbound(31);
  assert.deepEqual(await client.getXrayTemplate(), {
    xraySetting: { outbounds: [], routing: { rules: [] } },
    outboundTestUrl: "https://example.com/generate_204",
  });
  await client.updateXrayTemplate(
    { outbounds: [{ tag: "proxy", protocol: "socks" }], routing: { rules: [] } },
    "https://example.net/generate_204",
  );

  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
    ["POST", "/base/login"],
    ["GET", "/base/csrf-token"],
    ["POST", "/base/login"],
    ["GET", "/base/panel/api/inbounds/list"],
    ["POST", "/base/panel/api/inbounds/del/31"],
    ["POST", "/base/panel/xray/"],
    ["POST", "/base/panel/xray/update"],
  ]);

  for (const call of calls.slice(3, 5)) {
    assert.equal(call.headers.get("Authorization"), "Bearer bearer-token");
    assert.equal(call.headers.get("Cookie"), null);
    assert.equal(call.headers.get("X-CSRF-Token"), null);
  }
  for (const call of calls.slice(5)) {
    assert.equal(call.headers.get("Authorization"), null);
    assert.equal(call.headers.get("Cookie"), "3x-ui=logged-in");
    assert.equal(call.headers.get("X-CSRF-Token"), "csrf-value");
  }

  assert.match(calls[6].headers.get("Content-Type") || "", /^application\/x-www-form-urlencoded/);
  const updateBody = new URLSearchParams(calls[6].body);
  assert.deepEqual(JSON.parse(updateBody.get("xraySetting") || ""), {
    outbounds: [{ tag: "proxy", protocol: "socks" }],
    routing: { rules: [] },
  });
  assert.equal(updateBody.get("outboundTestUrl"), "https://example.net/generate_204");
});
