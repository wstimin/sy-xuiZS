import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac } from "node:crypto";
import { externalRedeemRequestId, inspectExternalCard, redeemExternalCard } from "./external-redeem-service.js";

test("external redeem adapter sends authenticated idempotent JSON and normalizes yuan", async () => {
  let received: { url: string; init?: RequestInit } | null = null;
  const result = await redeemExternalCard({
    enabled: true,
    name: "测试卡密",
    apiUrl: "http://127.0.0.1/redeem",
    apiKey: "secret-key",
    authMode: "bearer",
    amountUnit: "yuan",
    timeoutSeconds: 5,
    allowPrivateNetwork: true,
  }, {
    code: "Case-Sensitive-Card",
    userId: "user-1",
    username: "buyer",
    planId: "plan-1",
  }, async (input, init) => {
    received = { url: String(input), init };
    return new Response(JSON.stringify({ success: true, data: { amount: "12.50", tradeNo: "trade-1" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(result.amountCents, 1250);
  assert.equal(result.tradeNo, "trade-1");
  assert.equal(result.requestId, externalRedeemRequestId("Case-Sensitive-Card"));
  assert.equal(received?.url, "http://127.0.0.1/redeem");
  assert.equal(new Headers(received?.init?.headers).get("authorization"), "Bearer secret-key");
  assert.equal(new Headers(received?.init?.headers).get("x-idempotency-key"), result.requestId);
  assert.deepEqual(JSON.parse(String(received?.init?.body)), {
    code: "Case-Sensitive-Card",
    requestId: result.requestId,
    userId: "user-1",
    username: "buyer",
    planId: "plan-1",
  });
});

test("external redeem adapter rejects unsuccessful and malformed responses", async () => {
  const config = {
    enabled: true,
    name: "测试卡密",
    apiUrl: "http://127.0.0.1/redeem",
    apiKey: "secret-key",
    authMode: "x-api-key" as const,
    amountUnit: "cents" as const,
    timeoutSeconds: 5,
    allowPrivateNetwork: true,
  };
  await assert.rejects(
    redeemExternalCard(config, { code: "CARD-001", userId: "u", username: "buyer" }, async () => new Response(JSON.stringify({ success: false, message: "卡密已使用" }), { status: 200 })),
    /卡密已使用/,
  );
  await assert.rejects(
    redeemExternalCard(config, { code: "CARD-002", userId: "u", username: "buyer" }, async () => new Response(JSON.stringify({ success: true, amountCents: 100 }), { status: 200 })),
    /tradeNo/,
  );
  await assert.rejects(
    redeemExternalCard(config, { code: "CARD-003", userId: "u", username: "buyer" }, async () => new Response("x".repeat(256 * 1024 + 1), { status: 200 })),
    /响应过大/,
  );
});

test("Shiyeka adapter signs activate requests and converts money cards to cents", async () => {
  let received: { url: string; init?: RequestInit } | null = null;
  const result = await redeemExternalCard({
    provider: "shiyeka",
    enabled: true,
    name: "十夜卡密",
    apiUrl: "http://127.0.0.1:1111",
    appKey: "APPKEY123",
    apiKey: "app-secret-value",
    authMode: "none",
    amountUnit: "cents",
    timeoutSeconds: 5,
    allowPrivateNetwork: true,
  }, { code: "sy-card-001", userId: "u", username: "buyer" }, async (input, init) => {
    received = { url: String(input), init };
    return new Response(JSON.stringify({ code: 0, message: "ok", data: { type: "money", card: "SY-CARD-001", amount: 12.5, project_id: 1 } }));
  });

  assert.equal(result.amountCents, 1250);
  assert.match(result.tradeNo, /^shiyeka-[a-f0-9]{40}$/);
  assert.equal(received?.url, "http://127.0.0.1:1111/api/v1/card/activate");
  const headers = new Headers(received?.init?.headers);
  assert.equal(headers.get("x-app-key"), "APPKEY123");
  const raw = String(received?.init?.body);
  assert.equal(raw, JSON.stringify({ card: "SY-CARD-001" }));
  const expected = createHmac("sha256", "app-secret-value")
    .update(`APPKEY123\n${headers.get("x-timestamp")}\n${headers.get("x-nonce")}\n${createHash("sha256").update(raw).digest("hex")}`)
    .digest("hex");
  assert.equal(headers.get("x-sign"), expected);
});

test("Shiyeka adapter recovers a same-project activation through query", async () => {
  const paths: string[] = [];
  const result = await redeemExternalCard({
    provider: "shiyeka",
    enabled: true,
    name: "十夜卡密",
    apiUrl: "http://127.0.0.1:1111/",
    appKey: "APPKEY123",
    apiKey: "app-secret-value",
    authMode: "none",
    amountUnit: "cents",
    timeoutSeconds: 5,
    allowPrivateNetwork: true,
  }, { code: "SY-CARD-USED", userId: "u", username: "buyer" }, async input => {
    paths.push(new URL(String(input)).pathname);
    if (paths.length === 1) return new Response(JSON.stringify({ code: 2002, message: "卡密已被使用", data: null }));
    return new Response(JSON.stringify({ code: 0, message: "ok", data: { kind: "money", card: "SY-CARD-USED", remaining_amount: 9.9 } }));
  });
  assert.deepEqual(paths, ["/api/v1/card/activate", "/api/v1/card/query"]);
  assert.equal(result.amountCents, 990);
  assert.equal(result.recovered, true);
});

test("Shiyeka card inspection uses verify without consuming the card", async () => {
  let receivedPath = "";
  const result = await inspectExternalCard({
    provider: "shiyeka",
    enabled: false,
    name: "十夜卡密",
    apiUrl: "http://127.0.0.1:1111",
    appKey: "APPKEY123",
    apiKey: "app-secret-value",
    authMode: "none",
    amountUnit: "cents",
    timeoutSeconds: 5,
    allowPrivateNetwork: true,
  }, "sy23456789abcdefgh", async input => {
    receivedPath = new URL(String(input)).pathname;
    return new Response(JSON.stringify({ code: 0, message: "ok", data: { valid: true, type: "money", remaining_amount: 19.9 } }));
  });
  assert.equal(receivedPath, "/api/v1/card/verify");
  assert.deepEqual(result, { valid: true, kind: "money", amountCents: 1990 });
});
