import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AddressInfo } from "node:net";
import { attachCommercialUser, createCommercialRouter } from "./commercial-api.js";
import { CommercialStore } from "./commercial-store.js";

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie") || "";
  return header.split(";")[0];
}

test("HTTP commercial flow bootstraps admin, sells a plan and grants quotas", async () => {
  const store = new CommercialStore(":memory:");
  const app = express();
  app.use(express.json());
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  try {
    const bootstrapStatus = await fetch(`${base}/auth/bootstrap-status`).then(response => response.json()) as any;
    assert.equal(bootstrapStatus.required, true);

    const adminResponse = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-password" }),
    });
    assert.equal(adminResponse.status, 200);
    const adminCookie = sessionCookie(adminResponse);

    const userResponse = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "buyer", password: "buyer-password" }),
    });
    assert.equal(userResponse.status, 200);
    const userCookie = sessionCookie(userResponse);

    const plans = await fetch(`${base}/plans`).then(response => response.json()) as any;
    const singleUse = plans.plans.find((plan: any) => plan.name === "单次搭建");
    assert.ok(singleUse);

    const orderResponse = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ planId: singleUse.id }),
    });
    assert.equal(orderResponse.status, 201);
    const order = (await orderResponse.json() as any).order;

    const forbidden = await fetch(`${base}/admin/orders`, { headers: { cookie: userCookie } });
    assert.equal(forbidden.status, 403);

    const paidResponse = await fetch(`${base}/admin/orders/${order.id}/mark-paid`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ tradeNo: "manual-test-1" }),
    });
    assert.equal(paidResponse.status, 200);

    const accountResponse = await fetch(`${base}/account`, { headers: { cookie: userCookie } });
    assert.equal(accountResponse.status, 200);
    const account = await accountResponse.json() as any;
    assert.equal(account.orders[0].status, "paid");
    assert.equal(account.entitlements[0].panelRemaining, 1);
    assert.equal(account.entitlements[0].nodeRemaining, 3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});
