import assert from "node:assert/strict";
import test from "node:test";
import {
  findInboundRecord,
  mergeCookieHeader,
  parseApiTokenFromOutput,
  parseApiTokenResponse,
  parseWebCertFiles,
  parseXrayTemplateResponse,
  serializeInboundForm,
  serializeInboundPayload,
  XuiClient,
} from "./xui-client.js";

test("findInboundRecord supports panel-generated tags", () => {
  const list = [
    { id: 11, tag: "inbound-443", protocol: "vless", port: 443 },
    { id: 12, tag: "inbound-8388", protocol: "shadowsocks", port: 8388 },
  ];
  assert.equal(findInboundRecord(list, { tag: "local-tag", protocol: "Shadowsocks", port: 8388 })?.id, 12);
  assert.equal(findInboundRecord(list, { tag: "inbound-443", protocol: "Trojan", port: 9999 })?.id, 11);
  assert.equal(findInboundRecord(list, { tag: "missing", protocol: "VMess", port: 2053 }), undefined);
});

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

test("serializeInboundForm matches the native 3x-ui inbound form model", () => {
  const form = serializeInboundForm({
    port: 443,
    enable: true,
    settings: { clients: [{ id: "uuid" }] },
    streamSettings: { network: "tcp" },
    sniffing: { enabled: true },
    clientStats: [{ id: 1 }],
    nodeId: 99,
  });
  assert.equal(form.get("port"), "443");
  assert.equal(form.get("enable"), "true");
  assert.deepEqual(JSON.parse(form.get("settings") || ""), { clients: [{ id: "uuid" }] });
  assert.deepEqual(JSON.parse(form.get("streamSettings") || ""), { network: "tcp" });
  assert.deepEqual(JSON.parse(form.get("sniffing") || ""), { enabled: true });
  assert.equal(form.has("clientStats"), false);
  assert.equal(form.has("nodeId"), false);
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
    if (url.pathname === "/base/panel/csrf-token") {
      return Response.json({ success: true, obj: "authenticated-csrf" });
    }
    if (url.pathname === "/base/panel/setting/getApiToken") {
      return Response.json({ success: true, obj: "panel-api-token" });
    }
    if (url.pathname === "/base/panel/setting/all") {
      return Response.json({
        success: true,
        obj: { webCertFile: "/cert/fullchain.pem", webKeyFile: "/cert/privkey.pem" },
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
    ["GET", "/base/csrf-token"],
    ["POST", "/base/login"],
    ["GET", "/base/panel/csrf-token"],
    ["GET", "/base/panel/setting/getApiToken"],
    ["POST", "/base/panel/setting/all"],
    ["POST", "/base/panel/api/inbounds/add"],
  ]);
  assert.equal(calls[0].headers.get("Cookie"), null);
  assert.equal(calls[0].headers.get("X-CSRF-Token"), null);
  assert.equal(calls[1].headers.get("Cookie"), "3x-ui=anonymous");
  assert.equal(calls[1].headers.get("X-CSRF-Token"), "csrf-value");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[1].body)), { username: "admin", password: "password" });
  assert.equal(calls[2].headers.get("Cookie"), "3x-ui=logged-in");
  assert.equal(calls[3].headers.get("Cookie"), "3x-ui=logged-in");
  assert.equal(calls[3].headers.get("Authorization"), null);
  assert.equal(calls[4].headers.get("Cookie"), "3x-ui=logged-in");
  assert.equal(calls[4].headers.get("X-CSRF-Token"), "authenticated-csrf");
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

    if (url.pathname === "/base/csrf-token" || url.pathname === "/base/panel/csrf-token") {
      return new Response(null, { status: 404 });
    }
    if (url.pathname === "/base/login") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=legacy-session; Path=/base/; HttpOnly" },
      });
    }
    if (url.pathname === "/base/panel/setting/all") {
      return new Response(null, { status: 404 });
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
    "/base/csrf-token",
    "/base/login",
    "/base/panel/csrf-token",
    "/base/panel/setting/all",
    "/base/panel/setting/defaultSettings",
  ]);
  assert.equal(calls[1].headers.get("X-CSRF-Token"), null);
  assert.equal(calls[4].headers.get("Cookie"), "3x-ui=legacy-session");
});

test("XuiClient explains the generic 3x-ui login error without requiring 2FA", async () => {
  const mockFetch = (async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/csrf-token") {
      return new Response(JSON.stringify({ success: true, obj: "csrf-value" }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=anonymous; Path=/; HttpOnly" },
      });
    }
    if (url.pathname === "/login") {
      return Response.json({ success: false, msg: "Invalid username or password or two-factor code." });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelUser: "admin",
    panelPass: "wrong-password",
  }, mockFetch);

  await assert.rejects(
    client.authenticate(),
    /不代表必须填写 2FA.*5 次.*15 分钟登录锁定/,
  );
});

test("XuiClient uses Bearer Token and native form encoding for management APIs", async () => {
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
  assert.match(calls[1].headers.get("Content-Type") || "", /^application\/x-www-form-urlencoded/);
  const body = new URLSearchParams(calls[1].body);
  assert.equal(body.get("settings"), '{"clients":[]}');
  assert.equal(body.get("streamSettings"), '{"network":"tcp"}');
  assert.equal(body.get("sniffing"), '{"enabled":true}');
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

test("XuiClient reports the inbound creation stage when add times out", async () => {
  const mockFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof fetch;

  const client = new XuiClient({ panelAddress: "panel.example", panelToken: "bearer-token" }, mockFetch);
  await assert.rejects(
    client.addInbound({ port: 8388 }, "Shadowsocks", 10),
    /3x-ui 创建 Shadowsocks 入站超时，面板的 Xray 热加载未及时返回/,
  );
});

test("XuiClient timeout covers a response body that never completes", async () => {
  const mockFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"success":true,"obj":'));
        signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    });
    return new Response(body, { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  const client = new XuiClient({ panelAddress: "panel.example", panelToken: "bearer-token" }, mockFetch);
  await assert.rejects(
    client.addInbound({ port: 8388 }, "Shadowsocks", 10),
    /3x-ui 创建 Shadowsocks 入站超时/,
  );
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
    if (url.pathname === "/base/panel/csrf-token") {
      return Response.json({ success: true, obj: "authenticated-csrf" });
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
    if (url.pathname === "/base/panel/api/server/restartXrayService") {
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
  await client.restartXray();

  assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
    ["GET", "/base/csrf-token"],
    ["POST", "/base/login"],
    ["GET", "/base/panel/csrf-token"],
    ["GET", "/base/panel/api/inbounds/list"],
    ["POST", "/base/panel/api/inbounds/del/31"],
    ["POST", "/base/panel/xray/"],
    ["POST", "/base/panel/xray/update"],
    ["POST", "/base/panel/api/server/restartXrayService"],
  ]);

  for (const call of calls.slice(3, 5)) {
    assert.equal(call.headers.get("Authorization"), "Bearer bearer-token");
    assert.equal(call.headers.get("Cookie"), null);
    assert.equal(call.headers.get("X-CSRF-Token"), null);
  }
  for (const call of calls.slice(5)) {
    assert.equal(call.headers.get("Authorization"), null);
    assert.equal(call.headers.get("Cookie"), "3x-ui=logged-in");
    assert.equal(call.headers.get("X-CSRF-Token"), "authenticated-csrf");
    assert.equal(call.headers.get("X-Requested-With"), "XMLHttpRequest");
  }

  assert.match(calls[6].headers.get("Content-Type") || "", /^application\/x-www-form-urlencoded/);
  const updateBody = new URLSearchParams(calls[6].body);
  assert.deepEqual(JSON.parse(updateBody.get("xraySetting") || ""), {
    outbounds: [{ tag: "proxy", protocol: "socks" }],
    routing: { rules: [] },
  });
  assert.equal(updateBody.get("outboundTestUrl"), "https://example.net/generate_204");
});

test("XuiClient re-authenticates once when the official panel session expires", async () => {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  let loginCount = 0;
  let xrayCount = 0;
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });

    if (url.pathname === "/base/csrf-token") {
      return new Response(JSON.stringify({ success: true, obj: `public-csrf-${loginCount + 1}` }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": `3x-ui=anonymous-${loginCount + 1}; Path=/base/; HttpOnly` },
      });
    }
    if (url.pathname === "/base/login") {
      loginCount += 1;
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": `3x-ui=session-${loginCount}; Path=/base/; HttpOnly` },
      });
    }
    if (url.pathname === "/base/panel/csrf-token") {
      return Response.json({ success: true, obj: `session-csrf-${loginCount}` });
    }
    if (url.pathname === "/base/panel/xray/") {
      xrayCount += 1;
      if (xrayCount === 1) {
        return Response.json({ success: false, msg: "Please log in again" }, { status: 401 });
      }
      return Response.json({
        success: true,
        obj: JSON.stringify({
          xraySetting: { outbounds: [], routing: { rules: [] } },
          outboundTestUrl: "https://www.google.com/generate_204",
        }),
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

  assert.deepEqual(await client.getXrayTemplate(), {
    xraySetting: { outbounds: [], routing: { rules: [] } },
    outboundTestUrl: "https://www.google.com/generate_204",
  });
  assert.equal(loginCount, 2);
  assert.equal(xrayCount, 2);

  const xrayCalls = calls.filter(call => call.url.pathname === "/base/panel/xray/");
  assert.equal(xrayCalls[0].headers.get("Cookie"), "3x-ui=session-1");
  assert.equal(xrayCalls[1].headers.get("Cookie"), "3x-ui=session-2");
  assert.equal(xrayCalls[0].headers.get("X-Requested-With"), "XMLHttpRequest");
  assert.equal(xrayCalls[1].headers.get("X-Requested-With"), "XMLHttpRequest");
});

test("XuiClient re-authenticates when a panel redirects an expired session to HTML login", async () => {
  let loginCount = 0;
  let xrayCount = 0;
  const mockFetch = (async (input: URL | RequestInfo) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);

    if (url.pathname === "/base/csrf-token") {
      return Response.json({ success: true, obj: `public-csrf-${loginCount + 1}` });
    }
    if (url.pathname === "/base/login") {
      loginCount += 1;
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": `3x-ui=session-${loginCount}; Path=/base/; HttpOnly` },
      });
    }
    if (url.pathname === "/base/panel/csrf-token") {
      return Response.json({ success: true, obj: `session-csrf-${loginCount}` });
    }
    if (url.pathname === "/base/panel/xray/") {
      xrayCount += 1;
      if (xrayCount === 1) {
        const response = new Response("<!doctype html><title>Login</title>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
        Object.defineProperty(response, "redirected", { value: true });
        return response;
      }
      return Response.json({
        success: true,
        obj: JSON.stringify({
          xraySetting: { outbounds: [], routing: { rules: [] } },
          outboundTestUrl: "https://www.google.com/generate_204",
        }),
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

  await client.getXrayTemplate();
  assert.equal(loginCount, 2);
  assert.equal(xrayCount, 2);
});

test("XuiClient reports the Xray reload stage when restart times out", async () => {
  const mockFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/csrf-token" || url.pathname === "/panel/csrf-token") {
      return new Response(null, { status: 404 });
    }
    if (url.pathname === "/login") {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": "3x-ui=logged-in; Path=/; HttpOnly" },
      });
    }
    if (url.pathname === "/panel/api/server/restartXrayService") {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  }) as typeof fetch;

  const client = new XuiClient({
    panelAddress: "panel.example",
    panelUser: "admin",
    panelPass: "password",
    panelToken: "bearer-token",
  }, mockFetch);

  await assert.rejects(client.restartXray(10), /SOCKS 路由已保存，但 Xray 重载超时/);
});
