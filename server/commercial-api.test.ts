import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { AddressInfo } from "node:net";
import { attachCommercialUser, createCommercialRouter } from "./commercial-api.js";
import { CommercialStore } from "./commercial-store.js";
import { epaySign } from "./payment-service.js";

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

    const missingRefundProof = await fetch(`${base}/admin/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: combinedCookie },
      body: JSON.stringify({}),
    });
    assert.equal(missingRefundProof.status, 400);

    const refundResponse = await fetch(`${base}/admin/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: combinedCookie },
      body: JSON.stringify({ reason: "用户申请退款", refundTradeNo: "REFUND-API-1" }),
    });
    assert.equal(refundResponse.status, 200);
    const refunded = (await refundResponse.json() as any).order;
    assert.equal(refunded.status, "refunded");
    assert.equal(refunded.refundTradeNo, "REFUND-API-1");
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

    const disableOnlinePayments = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        paymentMethods: [
          { id: "alipay", name: "支付宝", type: "alipay", enabled: false, instructions: "打开付款页完成付款", paymentUrl: "https://pay.example.test", sortOrder: 10 },
          { id: "wechat", name: "微信支付", type: "wechat", enabled: false, instructions: "", paymentUrl: "", sortOrder: 20 },
        ],
      }),
    });
    assert.equal(disableOnlinePayments.status, 200);
    const cardOnlyMethods = await fetch(`${base}/payment-methods`).then(response => response.json()) as any;
    assert.deepEqual(cardOnlyMethods.paymentMethods, []);
    const cardOnlyAccount = await fetch(`${base}/account`, { headers: { cookie: userCookie } }).then(response => response.json()) as any;
    assert.deepEqual(cardOnlyAccount.paymentMethods, []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("redeem code APIs issue plan benefits once and expose a validated purchase link", async () => {
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
    const bootstrap = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "code-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);

    const registration = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "code-user", email: "code-user@example.com", password: "buyer-password" }),
    });
    const userCookie = sessionCookie(registration);
    const user = (await registration.json() as any).user;
    const plan = store.listPlans()[0];

    const createResponse = await fetch(`${base}/admin/redeem-codes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ planId: plan.id, quantity: 1, note: "api batch" }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json() as any).redeemCodes[0];
    assert.match(created.code, /^XUI-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);

    const listResponse = await fetch(`${base}/admin/redeem-codes`, { headers: { cookie: adminCookie } });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as any;
    assert.equal(listed.redeemCodes[0].codeMasked, created.codeMasked);
    assert.equal("code" in listed.redeemCodes[0], false);
    assert.equal(JSON.stringify(listed).includes(created.code), false);

    const wrongPlan = store.createPlan({
      name: "API 其他套餐", priceCents: 9900, durationUnit: "months", durationValue: 1,
      panelMode: "limited", panelLimit: 1, nodeMode: "limited", nodeLimit: 1,
      dailyPanelLimit: 1, dailyNodeLimit: 1, concurrencyLimit: 1, enabled: true, sortOrder: 9,
    });
    const mismatched = await fetch(`${base}/redeem-codes/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ code: created.code, planId: wrongPlan.id }),
    });
    assert.equal(mismatched.status, 400);
    assert.equal(store.listRedeemCodes()[0].status, "active");
    assert.equal(store.listOrders(user.id).length, 0);

    const redeemResponse = await fetch(`${base}/redeem-codes/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ code: created.code.toLowerCase(), planId: plan.id }),
    });
    assert.equal(redeemResponse.status, 200);
    const redeemed = await redeemResponse.json() as any;
    assert.equal(redeemed.planName, plan.name);
    assert.equal(redeemed.order.status, "paid");
    assert.equal(redeemed.order.paymentProvider, "redeem_code");
    assert.equal(redeemed.orderNo, redeemed.order.orderNo);

    const accountAfterRedeem = await fetch(`${base}/account`, { headers: { cookie: userCookie } }).then(response => response.json()) as any;
    assert.equal(accountAfterRedeem.entitlements.length, 1);
    assert.equal(accountAfterRedeem.entitlements[0].planName, plan.name);
    assert.equal(accountAfterRedeem.entitlements[0].sourceOrderId, redeemed.orderId);
    assert.equal(accountAfterRedeem.orders.length, 1);
    assert.equal(accountAfterRedeem.orders[0].paymentProvider, "redeem_code");

    const repeated = await fetch(`${base}/redeem-codes/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ code: created.code }),
    });
    assert.equal(repeated.status, 400);
    assert.equal(store.listEntitlements(user.id).length, 1);

    const purchaseUrl = "https://shop.example.test/redeem-codes";
    const settingsResponse = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ redeemCodePurchaseUrl: purchaseUrl }),
    });
    assert.equal(settingsResponse.status, 200);
    const methodsWithLink = await fetch(`${base}/payment-methods`).then(response => response.json()) as any;
    assert.equal(methodsWithLink.redeemCodePurchaseUrl, purchaseUrl);
    const accountWithLink = await fetch(`${base}/account`, { headers: { cookie: userCookie } }).then(response => response.json()) as any;
    assert.equal(accountWithLink.redeemCodePurchaseUrl, purchaseUrl);

    const unsafeLink = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ redeemCodePurchaseUrl: "javascript:alert(1)" }),
    });
    assert.equal(unsafeLink.status, 400);
    assert.equal(store.getSetting("redeem_code_purchase_url", ""), purchaseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("online payment callbacks reject wrong amounts and grant benefits only once", async () => {
  const store = new CommercialStore(":memory:");
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  try {
    store.bootstrapAdmin("payment-admin", "strong-password");
    store.setPaymentMethods([{
      id: "epay-live", name: "在线支付", type: "epay", provider: "epay", enabled: true,
      instructions: "在线付款", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "callback-secret", channel: "alipay", enabledChannels: ["alipay", "wxpay"], sortOrder: 10,
    }]);
    const user = store.createUser("callback-user", "strong-password", "user", "callback@example.com");
    const login = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: user.email, password: "strong-password" }),
    });
    const userCookie = sessionCookie(login);
    const orderResponse = await fetch(`${base}/orders`, {
      method: "POST", headers: { "content-type": "application/json", cookie: userCookie },
      body: JSON.stringify({ planId: store.listPlans()[0].id, paymentProvider: "epay-live--wxpay" }),
    });
    assert.equal(orderResponse.status, 201);
    const createdOrder = await orderResponse.json() as any;
    const order = createdOrder.order;
    assert.equal(order.paymentProvider, "epay-live");
    assert.equal(order.paymentChannel, "wxpay");
    assert.match(createdOrder.payment.checkoutUrl, /[?&]type=wxpay(?:&|$)/);

    const directVisit = await fetch(`${base}/payment/epay/epay-live/notify`);
    assert.equal(directVisit.status, 200);
    assert.match(await directVisit.text(), /异步通知接口/);
    assert.equal(store.listPaymentNotifications().length, 0);

    const callback = (money: string, pid = "1001") => {
      const params: Record<string, string> = {
        pid, out_trade_no: order.orderNo, trade_no: "EPAY-TRADE-1",
        trade_status: "TRADE_SUCCESS", money, sign_type: "MD5",
      };
      params.sign = epaySign(params, "callback-secret");
      return fetch(`${base}/payment/epay/epay-live/notify?${new URLSearchParams(params)}`);
    };

    const wrongPid = await callback((order.amountCents / 100).toFixed(2), "2002");
    assert.equal(wrongPid.status, 400);
    assert.equal(store.getOrder(order.id).status, "pending");

    const wrongAmount = await callback("99.00");
    assert.equal(wrongAmount.status, 400);
    assert.equal(store.getOrder(order.id).status, "pending");
    assert.equal(store.listEntitlements(user.id).length, 0);

    const paid = await callback((order.amountCents / 100).toFixed(2));
    assert.equal(paid.status, 200);
    assert.equal(await paid.text(), "success");
    assert.equal(store.getOrder(order.id).status, "paid");
    assert.equal(store.listEntitlements(user.id).length, 1);

    const repeated = await callback((order.amountCents / 100).toFixed(2));
    assert.equal(repeated.status, 200);
    assert.equal(store.listEntitlements(user.id).length, 1);
    assert.equal(store.listPaymentNotifications().filter((item: any) => item.status === "accepted").length, 2);
    assert.equal(store.listPaymentNotifications().filter((item: any) => item.status === "rejected").length, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("gateway checkout failures keep the created order available for retry", async () => {
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
    store.bootstrapAdmin("gateway-admin", "strong-password");
    store.setPaymentMethods([{
      id: "tokenpay-down", name: "USDT", type: "tokenpay", provider: "tokenpay", enabled: true,
      instructions: "USDT 支付", paymentUrl: "", gatewayUrl: `http://127.0.0.1:${port}/unavailable/`,
      merchantSecret: "tokenpay-secret", currency: "USDT_TRC20", sortOrder: 10,
    }]);
    const user = store.createUser("gateway-user", "strong-password", "user", "gateway@example.com");
    const login = await fetch(`${base}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: user.email, password: "strong-password" }),
    });
    const response = await fetch(`${base}/orders`, {
      method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie(login) },
      body: JSON.stringify({ planId: store.listPlans()[0].id, paymentProvider: "tokenpay-down" }),
    });
    assert.equal(response.status, 201);
    const result = await response.json() as any;
    assert.equal(result.success, true);
    assert.equal(result.order.status, "pending");
    assert.equal(result.payment, null);
    assert.ok(result.paymentError);
    assert.equal((store.listPaymentAttempts(result.order.id)[0] as any).status, "failed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("contact settings and QR uploads are configurable, validated and publicly readable", async () => {
  const store = new CommercialStore(":memory:");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  try {
    const initial = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(initial.contact.enabled, false);
    assert.equal(initial.contact.buttonLabel, "立即咨询");
    assert.equal(initial.contact.title, "联系站长");
    assert.equal(initial.contact.qrCodeUploaded, false);

    const unauthorizedUpload = await fetch(`${base}/admin/contact-qr`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: "data:image/png;base64,iVBORw0KGgo=" }),
    });
    assert.equal(unauthorizedUpload.status, 401);

    const bootstrap = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "contact-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);
    const qrCodeUrl = "https://cdn.example.test/contact.png";
    const contactUrl = "https://t.me/example";
    const saved = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        contact: {
          enabled: true,
          buttonLabel: "联系售后",
          title: "联系运营支持",
          description: "每天 09:00 至 22:00 在线",
          contactText: "微信：example\n邮箱：support@example.com",
          contactUrl,
          qrCodeUrl,
        },
      }),
    });
    assert.equal(saved.status, 200);

    const publicSettings = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(publicSettings.contact.enabled, true);
    assert.equal(publicSettings.contact.buttonLabel, "联系售后");
    assert.equal(publicSettings.contact.contactUrl, contactUrl);
    assert.equal(publicSettings.contact.qrCodeUrl, qrCodeUrl);

    for (const unsafeField of ["contactUrl", "qrCodeUrl"] as const) {
      const invalid = await fetch(`${base}/admin/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ contact: { [unsafeField]: "javascript:alert(1)" } }),
      });
      assert.equal(invalid.status, 400);
    }
    const unchanged = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(unchanged.contact.contactUrl, contactUrl);
    assert.equal(unchanged.contact.qrCodeUrl, qrCodeUrl);

    const formats = [
      ["image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
      ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff])],
      ["image/webp", Buffer.from("RIFF0000WEBP", "ascii")],
    ] as const;
    for (const [mimeType, image] of formats) {
      const upload = await fetch(`${base}/admin/contact-qr`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ dataUrl: `data:${mimeType};base64,${image.toString("base64")}` }),
      });
      assert.equal(upload.status, 200);
      const publicQr = await fetch(`${base}/contact-qr`);
      assert.equal(publicQr.status, 200);
      assert.equal(publicQr.headers.get("content-type"), mimeType);
      assert.deepEqual(Buffer.from(await publicQr.arrayBuffer()), image);
    }

    const invalidImage = await fetch(`${base}/admin/contact-qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${Buffer.from("not an image").toString("base64")}` }),
    });
    assert.equal(invalidImage.status, 400);

    const invalidBase64 = await fetch(`${base}/admin/contact-qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: "data:image/png;base64,iVBORw0KGgo" }),
    });
    assert.equal(invalidBase64.status, 400);

    const oversizedImage = Buffer.alloc(1024 * 1024 + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedImage);
    const oversizedUpload = await fetch(`${base}/admin/contact-qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${oversizedImage.toString("base64")}` }),
    });
    assert.equal(oversizedUpload.status, 400);

    const afterUpload = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(afterUpload.contact.qrCodeUploaded, true);

    const unauthorizedDelete = await fetch(`${base}/admin/contact-qr`, { method: "DELETE" });
    assert.equal(unauthorizedDelete.status, 401);
    const deleted = await fetch(`${base}/admin/contact-qr`, { method: "DELETE", headers: { cookie: adminCookie } });
    assert.equal(deleted.status, 200);

    const afterDelete = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(afterDelete.contact.qrCodeUploaded, false);
    assert.equal(afterDelete.contact.qrCodeUrl, qrCodeUrl);
    assert.equal((await fetch(`${base}/contact-qr`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("resource recommendations enforce limits, filtering and protected logo access", async () => {
  const store = new CommercialStore(":memory:");
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  const item = (id: string, category: "server" | "residential_ip", sortOrder: number) => ({
    id,
    category,
    enabled: true,
    name: `Vendor ${id}`,
    description: "Recommended provider",
    logoUrl: "",
    badge: "Recommended",
    purchaseUrl: `https://example.test/${id}`,
    buttonLabel: "Learn more",
    openInNewTab: true,
    sortOrder,
  });

  try {
    assert.equal((await fetch(`${base}/resource-recommendations`)).status, 401);
    assert.equal((await fetch(`${base}/admin/resource-recommendations/server-one/logo`)).status, 401);

    const bootstrap = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "resource-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);
    const registration = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "resource-user", email: "resource@example.com", password: "user-password" }),
    });
    const userCookie = sessionCookie(registration);

    const serverItem = item("server-one", "server", 20);
    const residentialItem = item("residential-one", "residential_ip", 10);
    const saved = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ recommendations: { serverEnabled: true, residentialIpEnabled: true, items: [serverItem, residentialItem] } }),
    });
    assert.equal(saved.status, 200);

    const publicResponse = await fetch(`${base}/resource-recommendations`, { headers: { cookie: userCookie } });
    assert.equal(publicResponse.status, 200);
    const publicSettings = (await publicResponse.json() as any).recommendations;
    assert.deepEqual(publicSettings.items.map((entry: any) => entry.id), ["residential-one", "server-one"]);
    assert.equal(publicSettings.items[0].logoUploaded, false);
    assert.equal("referencePrice" in publicSettings.items[0], false);

    const adminSettings = await fetch(`${base}/admin/settings`, { headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(adminSettings.settings.recommendations.items.length, 2);

    const invalidUrl = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ recommendations: { serverEnabled: true, residentialIpEnabled: true, items: [{ ...serverItem, purchaseUrl: "javascript:alert(1)" }] } }),
    });
    assert.equal(invalidUrl.status, 400);

    const duplicateIds = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ recommendations: { serverEnabled: true, residentialIpEnabled: true, items: [serverItem, { ...residentialItem, id: serverItem.id }] } }),
    });
    assert.equal(duplicateIds.status, 400);

    const tooMany = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ recommendations: { serverEnabled: true, residentialIpEnabled: true, items: Array.from({ length: 21 }, (_value, index) => item(`server-${index}`, "server", index)) } }),
    });
    assert.equal(tooMany.status, 400);

    const hiddenCategory = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ recommendations: { serverEnabled: true, residentialIpEnabled: false, items: [serverItem, residentialItem] } }),
    });
    assert.equal(hiddenCategory.status, 200);
    const filtered = await fetch(`${base}/resource-recommendations`, { headers: { cookie: userCookie } }).then(response => response.json()) as any;
    assert.deepEqual(filtered.recommendations.items.map((entry: any) => entry.id), ["server-one"]);

    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const unauthorizedUpload = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${png.toString("base64")}` }),
    });
    assert.equal(unauthorizedUpload.status, 401);

    const blockedAutomaticFetch = await fetch(`${base}/admin/resource-recommendations/server-one/logo/fetch`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ websiteUrl: "http://127.0.0.1/internal" }),
    });
    assert.equal(blockedAutomaticFetch.status, 400);
    assert.match((await blockedAutomaticFetch.json() as any).error, /内网地址/);

    const uploaded = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${png.toString("base64")}` }),
    });
    assert.equal(uploaded.status, 200);

    const publicLogo = await fetch(`${base}/resource-recommendations/server-one/logo`, { headers: { cookie: userCookie } });
    assert.equal(publicLogo.status, 200);
    assert.equal(publicLogo.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await publicLogo.arrayBuffer()), png);

    const adminLogo = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, { headers: { cookie: adminCookie } });
    assert.equal(adminLogo.status, 200);
    assert.deepEqual(Buffer.from(await adminLogo.arrayBuffer()), png);

    const afterUpload = await fetch(`${base}/admin/settings`, { headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(afterUpload.settings.recommendations.items.find((entry: any) => entry.id === "server-one").logoUploaded, true);

    const deleted = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, { method: "DELETE", headers: { cookie: adminCookie } });
    assert.equal(deleted.status, 200);
    assert.equal((await fetch(`${base}/resource-recommendations/server-one/logo`, { headers: { cookie: userCookie } })).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});
