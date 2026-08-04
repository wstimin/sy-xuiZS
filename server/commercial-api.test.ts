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

    const prematureRegistration = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "too-early", password: "buyer-password" }),
    });
    assert.equal(prematureRegistration.status, 503);

    const adminResponse = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-password" }),
    });
    assert.equal(adminResponse.status, 200);
    const adminCookie = sessionCookie(adminResponse);
    assert.match(adminCookie, /^xui_admin_session=/);

    const userResponse = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "buyer", email: "buyer@example.com", password: "buyer-password" }),
    });
    assert.equal(userResponse.status, 200);
    const userCookie = sessionCookie(userResponse);
    assert.match(userCookie, /^xui_user_session=/);

    const combinedCookie = `${userCookie}; ${adminCookie}`;
    const userMe = await fetch(`${base}/auth/me`, { headers: { cookie: combinedCookie } }).then(response => response.json()) as any;
    const adminMe = await fetch(`${base}/admin/auth/me`, { headers: { cookie: combinedCookie } }).then(response => response.json()) as any;
    assert.equal(userMe.user.username, "buyer");
    assert.equal(userMe.user.email, "buyer@example.com");
    assert.equal(adminMe.user.username, "admin");

    const plans = await fetch(`${base}/plans`).then(response => response.json()) as any;
    const singleUse = plans.plans.find((plan: any) => plan.name === "单次搭建");
    assert.ok(singleUse);

    const orderResponse = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ planId: singleUse.id, paymentProvider: "manual" }),
    });
    assert.equal(orderResponse.status, 201);
    const order = (await orderResponse.json() as any).order;

    const forbidden = await fetch(`${base}/admin/orders`, { headers: { cookie: userCookie } });
    assert.equal(forbidden.status, 401);

    const paidResponse = await fetch(`${base}/admin/orders/${order.id}/mark-paid`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: combinedCookie },
      body: JSON.stringify({ tradeNo: "manual-test-1" }),
    });
    assert.equal(paidResponse.status, 200);

    const accountResponse = await fetch(`${base}/account`, { headers: { cookie: combinedCookie } });
    assert.equal(accountResponse.status, 200);
    const account = await accountResponse.json() as any;
    assert.equal(account.orders[0].status, "paid");
    assert.equal(account.orders[0].paymentProvider, "manual");
    assert.equal(account.entitlements[0].panelRemaining, 1);
    assert.equal(account.entitlements[0].nodeRemaining, 3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("admin management endpoints create users and expose protected operational records", async () => {
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
    const adminResponse = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "manager", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(adminResponse);

    const createResponse = await fetch(`${base}/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ username: "managed-user", password: "managed-password", role: "user" }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json() as any).user;

    const detailResponse = await fetch(`${base}/admin/users/${created.id}/detail`, { headers: { cookie: adminCookie } });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as any;
    assert.equal(detail.user.username, "managed-user");
    assert.deepEqual(detail.orders, []);

    const auditResponse = await fetch(`${base}/admin/audit-logs`, { headers: { cookie: adminCookie } });
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json() as any;
    assert.equal(audit.logs[0].action, "创建用户");
    assert.equal(audit.logs[0].targetId, created.id);

    const ledgerResponse = await fetch(`${base}/admin/usage-ledger`, { headers: { cookie: adminCookie } });
    assert.equal(ledgerResponse.status, 200);
    assert.deepEqual((await ledgerResponse.json() as any).entries, []);

    const userLogin = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "managed-user", password: "managed-password" }),
    });
    const userCookie = sessionCookie(userLogin);
    const forbidden = await fetch(`${base}/admin/audit-logs`, { headers: { cookie: userCookie } });
    assert.equal(forbidden.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("administrator can change own username and public management path", async () => {
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
    const initialRuntime = await fetch(`${base}/runtime-config`).then(response => response.json()) as any;
    assert.equal(initialRuntime.adminPath, "admin");

    const unauthorizedAccount = await fetch(`${base}/admin/account`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "blocked-admin" }),
    });
    assert.equal(unauthorizedAccount.status, 401);

    const bootstrap = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);

    const accountResponse = await fetch(`${base}/admin/account`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ username: "operations-admin" }),
    });
    assert.equal(accountResponse.status, 200);
    assert.equal((await accountResponse.json() as any).user.username, "operations-admin");

    const sessionAfterRename = await fetch(`${base}/admin/auth/me`, { headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(sessionAfterRename.user.username, "operations-admin");

    const oldLogin = await fetch(`${base}/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin-password" }),
    });
    assert.equal(oldLogin.status, 400);

    const newLogin = await fetch(`${base}/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "operations-admin", password: "admin-password" }),
    });
    assert.equal(newLogin.status, 200);

    const settingsResponse = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ adminPath: "control-center" }),
    });
    assert.equal(settingsResponse.status, 200);
    assert.equal((await settingsResponse.json() as any).adminPath, "control-center");

    const updatedRuntime = await fetch(`${base}/runtime-config`).then(response => response.json()) as any;
    assert.equal(updatedRuntime.adminPath, "control-center");

    const reservedPath = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ adminPath: "console" }),
    });
    assert.equal(reservedPath.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("email registration, payment settings and provider validation align across APIs", async () => {
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
    const adminResponse = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "payment-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(adminResponse);
    const settingsResponse = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        paymentInstructions: "请将订单号填写为付款备注。",
        paymentMethods: [
          { id: "alipay", name: "支付宝", type: "alipay", enabled: true, instructions: "打开付款页完成付款", paymentUrl: "https://pay.example.test", sortOrder: 10 },
          { id: "wechat", name: "微信支付", type: "wechat", enabled: false, instructions: "", paymentUrl: "", sortOrder: 20 },
        ],
      }),
    });
    assert.equal(settingsResponse.status, 200);

    const registerResponse = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new-user@example.com", password: "buyer-password" }),
    });
    assert.equal(registerResponse.status, 200);
    const registered = await registerResponse.json() as any;
    assert.equal(registered.user.email, "new-user@example.com");
    assert.ok(registered.user.username);
    const userCookie = sessionCookie(registerResponse);

    const loginResponse = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "new-user@example.com", password: "buyer-password" }),
    });
    assert.equal(loginResponse.status, 200);

    const publicMethods = await fetch(`${base}/payment-methods`).then(response => response.json()) as any;
    assert.deepEqual(publicMethods.paymentMethods.map((method: any) => method.id), ["alipay"]);

    const plan = store.listPlans()[0];
    const disabledOrder = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ planId: plan.id, paymentProvider: "wechat" }),
    });
    assert.equal(disabledOrder.status, 400);

    const orderResponse = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ planId: plan.id, paymentProvider: "alipay" }),
    });
    assert.equal(orderResponse.status, 201);
    assert.equal((await orderResponse.json() as any).order.paymentProvider, "alipay");

    const account = await fetch(`${base}/account`, { headers: { cookie: userCookie } }).then(response => response.json()) as any;
    assert.equal(account.paymentInstructions, "请将订单号填写为付款备注。");
    assert.equal(account.paymentMethods[0].id, "alipay");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});
