import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AddressInfo } from "node:net";
import { attachCommercialUser, createCommercialRouter } from "./commercial-api.js";
import { CommercialStore } from "./commercial-store.js";

function sessionCookie(response: Response) {
  return (response.headers.get("set-cookie") || "").split(";")[0];
}

test("configured third-party card API grants a plan once without exposing its secret", async () => {
  let authorization = "";
  let requestId = "";
  const providerApp = express();
  providerApp.use(express.json());
  providerApp.post("/redeem", (req, res) => {
    authorization = req.header("authorization") || "";
    requestId = req.header("x-idempotency-key") || "";
    res.json({ success: true, amountCents: 1200, tradeNo: "provider-trade-1" });
  });
  const providerServer = providerApp.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => providerServer.once("listening", resolve));
  const providerPort = (providerServer.address() as AddressInfo).port;

  const store = new CommercialStore(":memory:");
  const plan = store.createPlan({
    name: "第三方卡密套餐", description: "测试", priceCents: 990,
    durationUnit: "lifetime", durationValue: 0,
    panelMode: "limited", panelLimit: 1, nodeMode: "limited", nodeLimit: 2,
    dailyPanelLimit: 0, dailyNodeLimit: 0, concurrencyLimit: 1,
    enabled: true, homepageVisible: true, sortOrder: 1,
  });
  const app = express();
  app.use(express.json());
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  try {
    const adminResponse = await fetch(`${base}/auth/bootstrap`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(adminResponse);
    const userResponse = await fetch(`${base}/auth/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "buyer", email: "buyer@example.com", password: "buyer-password" }),
    });
    const userCookie = sessionCookie(userResponse);
    const registered = await userResponse.json() as any;

    const saved = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ externalRedeem: {
        enabled: true,
        name: "合作卡站",
        apiUrl: `http://127.0.0.1:${providerPort}/redeem`,
        apiKey: "provider-secret",
        authMode: "bearer",
        amountUnit: "cents",
        timeoutSeconds: 5,
        allowPrivateNetwork: true,
      } }),
    });
    assert.equal(saved.status, 200);

    const settings = await fetch(`${base}/admin/settings`, { headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(settings.settings.externalRedeem.apiKeyConfigured, true);
    assert.equal(settings.settings.externalRedeem.apiKey, undefined);

    const redeemedResponse = await fetch(`${base}/redeem-codes/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ code: "ThirdParty-Card-001", planId: plan.id }),
    });
    assert.equal(redeemedResponse.status, 200);
    const redeemed = await redeemedResponse.json() as any;
    assert.equal(redeemed.order.paymentProvider, "external_redeem");
    assert.equal(redeemed.order.paymentChannel, "合作卡站");
    assert.equal(redeemed.balanceCents, 210);
    assert.equal(authorization, "Bearer provider-secret");
    assert.match(requestId, /^xui-[a-f0-9]{40}$/);

    const repeated = await fetch(`${base}/redeem-codes/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ code: "ThirdParty-Card-001", planId: plan.id }),
    });
    assert.equal(repeated.status, 400);
    assert.match(String((await repeated.json() as any).error), /已经在本系统入账/);
    assert.equal(store.listEntitlements(registered.user.id).length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await new Promise<void>((resolve, reject) => providerServer.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});
