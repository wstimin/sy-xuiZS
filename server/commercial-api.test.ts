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

    const basePlan = store.listPlans()[0];
    const quarterlyPlanResponse = await fetch(`${base}/admin/plans`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ ...basePlan, name: "API 季度套餐", durationUnit: "quarters", durationValue: 1, homepageVisible: false }),
    });
    assert.equal(quarterlyPlanResponse.status, 201);
    const quarterlyPlan = (await quarterlyPlanResponse.json() as any).plan;
    assert.equal(quarterlyPlan.durationUnit, "quarters");
    assert.equal(quarterlyPlan.homepageVisible, false);

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

    const deletableUser = store.createUser("deletable-user", "deletable-password");
    const deletableOrder = store.createOrder(deletableUser.id, store.listPlans()[0].id, "manual");
    store.createPaymentAttempt(deletableOrder.id, "manual", "", { source: "delete-test" });
    store.recordPaymentNotification("manual", "manual", deletableOrder.orderNo, "accepted", { source: "delete-test" });
    store.markOrderPaid(deletableOrder.id, "manual", "DELETE-TEST-TRADE");

    const deleteResponse = await fetch(`${base}/admin/users/${deletableUser.id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    assert.equal(deleteResponse.status, 200);
    const deleted = (await deleteResponse.json() as any).deleted;
    assert.equal(deleted.username, "deletable-user");
    assert.equal(deleted.orders, 1);
    assert.equal(deleted.entitlements, 1);
    assert.equal(store.getUserById(deletableUser.id), null);
    assert.equal(store.getOrder(deletableOrder.id), undefined);
    assert.deepEqual(store.listEntitlements(deletableUser.id), []);
    assert.deepEqual(store.listPaymentAttempts(deletableOrder.id), []);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS count FROM payment_notifications WHERE order_no = ?").get(deletableOrder.orderNo) as any).count, 0);

    const deletedDetailResponse = await fetch(`${base}/admin/users/${deletableUser.id}/detail`, { headers: { cookie: adminCookie } });
    assert.equal(deletedDetailResponse.status, 404);
    const deleteAudit = store.listAdminAuditLogs()[0] as any;
    assert.equal(deleteAudit.action, "永久删除客户");
    assert.equal(deleteAudit.targetId, deletableUser.id);

    const currentAdmin = store.listAdministrators()[0];
    const deleteSelfResponse = await fetch(`${base}/admin/users/${currentAdmin.id}`, {
      method: "DELETE",
      headers: { cookie: adminCookie },
    });
    assert.equal(deleteSelfResponse.status, 400);
    assert.match((await deleteSelfResponse.json() as any).error, /不能删除当前登录/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("admin order detail and entitlement repair endpoints are protected and audited", async () => {
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
      body: JSON.stringify({ username: "repair-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);
    const registration = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "repair-user", email: "repair@example.com", password: "user-password" }),
    });
    const userCookie = sessionCookie(registration);
    const user = (await registration.json() as any).user;
    const order = store.createOrder(user.id, store.listPlans()[0].id, "manual");
    const timestamp = new Date().toISOString();
    store.db.prepare("UPDATE orders SET status = 'paid', payment_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?")
      .run("api-missing-entitlement", timestamp, timestamp, order.id);

    const forbiddenDetail = await fetch(`${base}/admin/orders/${order.id}/detail`, { headers: { cookie: userCookie } });
    assert.equal(forbiddenDetail.status, 401);
    const forbiddenRepair = await fetch(`${base}/admin/orders/${order.id}/repair-entitlement`, { method: "POST", headers: { cookie: userCookie } });
    assert.equal(forbiddenRepair.status, 401);

    const detailResponse = await fetch(`${base}/admin/orders/${order.id}/detail`, { headers: { cookie: adminCookie } });
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as any;
    assert.equal(detail.order.email, "repair@example.com");
    assert.equal(detail.diagnosis.processingStatus, "paid_missing_entitlement");
    assert.equal(detail.diagnosis.canRepairEntitlement, true);

    const repairResponse = await fetch(`${base}/admin/orders/${order.id}/repair-entitlement`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
    });
    assert.equal(repairResponse.status, 200);
    const repaired = await repairResponse.json() as any;
    assert.equal(repaired.success, true);
    assert.equal(repaired.detail.diagnosis.processingStatus, "completed");
    assert.equal(store.listEntitlements(user.id).length, 1);

    const duplicateRepair = await fetch(`${base}/admin/orders/${order.id}/repair-entitlement`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
    });
    assert.equal(duplicateRepair.status, 400);
    assert.equal(store.listEntitlements(user.id).length, 1);
    const audit = (store.listAdminAuditLogs() as any[]).find(item => item.targetId === order.id);
    assert.equal(audit?.action, "补发订单权益");

    const missingDetail = await fetch(`${base}/admin/orders/missing-order/detail`, { headers: { cookie: adminCookie } });
    assert.equal(missingDetail.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("admin operations expose diagnoses, payment checks and guarded database restore", async () => {
  const store = new CommercialStore(":memory:");
  const app = express();
  app.use(express.json());
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;
  const sqliteHeaders = { "content-type": "application/vnd.sqlite3" };

  try {
    const bootstrap = await fetch(`${base}/auth/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "operations-admin", password: "admin-password" }),
    });
    const adminCookie = sessionCookie(bootstrap);
    const registration = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "operations-user", email: "operations@example.com", password: "user-password" }),
    });
    const userCookie = sessionCookie(registration);
    const user = (await registration.json() as any).user;

    const unauthorizedRequests = await Promise.all([
      fetch(`${base}/admin/exceptions`),
      fetch(`${base}/admin/payment-methods/manual/check`, { method: "POST", headers: { cookie: userCookie } }),
      fetch(`${base}/admin/database/backup`, { headers: { cookie: userCookie } }),
      fetch(`${base}/admin/database/validate`, { method: "POST", headers: { ...sqliteHeaders, cookie: userCookie }, body: Buffer.alloc(128) }),
    ]);
    assert.deepEqual(unauthorizedRequests.map(response => response.status), [401, 401, 401, 401]);

    const order = store.createOrder(user.id, store.listPlans()[0].id, "manual");
    const timestamp = new Date().toISOString();
    store.db.prepare("UPDATE orders SET status = 'paid', payment_trade_no = ?, paid_at = ?, updated_at = ? WHERE id = ?")
      .run("api-exception-trade", timestamp, timestamp, order.id);

    const ordersResponse = await fetch(`${base}/admin/orders`, { headers: { cookie: adminCookie } });
    assert.equal(ordersResponse.status, 200);
    const orders = (await ordersResponse.json() as any).orders;
    assert.equal(orders.find((item: any) => item.id === order.id).diagnosis.processingStatus, "paid_missing_entitlement");

    const exceptionsResponse = await fetch(`${base}/admin/exceptions`, { headers: { cookie: adminCookie } });
    assert.equal(exceptionsResponse.status, 200);
    const exceptions = await exceptionsResponse.json() as any;
    assert.equal(exceptions.summary.total, 1);
    assert.equal(exceptions.items[0].targetId, order.id);

    store.setPaymentMethods([
      {
        id: "disabled-manual", name: "Disabled manual", type: "manual", provider: "manual", enabled: false,
        instructions: "", paymentUrl: "", sortOrder: 10,
      },
      {
        id: "enabled-manual", name: "Enabled manual", type: "manual", provider: "manual", enabled: true,
        instructions: "Contact support", paymentUrl: "", sortOrder: 20,
      },
      {
        id: "local-epay", name: "Local EPay", type: "epay", provider: "epay", enabled: true,
        instructions: "Online", paymentUrl: "", gatewayUrl: "http://127.0.0.1/pay", merchantId: "1001",
        merchantSecret: "secret", enabledChannels: ["alipay"], sortOrder: 30,
      },
    ]);

    const disabledCheck = await fetch(`${base}/admin/payment-methods/disabled-manual/check`, { method: "POST", headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(disabledCheck.result.status, "disabled");
    const manualCheck = await fetch(`${base}/admin/payment-methods/enabled-manual/check`, { method: "POST", headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(manualCheck.result.status, "ready");
    const localCheck = await fetch(`${base}/admin/payment-methods/local-epay/check`, { method: "POST", headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.equal(localCheck.result.status, "invalid");

    const backupResponse = await fetch(`${base}/admin/database/backup`, { headers: { cookie: adminCookie } });
    assert.equal(backupResponse.status, 200);
    assert.equal(backupResponse.headers.get("content-type"), "application/vnd.sqlite3");
    assert.match(backupResponse.headers.get("content-disposition") || "", /attachment; filename="xui-backup-.*\.db"/);
    const backup = Buffer.from(await backupResponse.arrayBuffer());
    assert.equal((store.validateDatabaseBackup(backup) as any).valid, true);

    const validateResponse = await fetch(`${base}/admin/database/validate`, {
      method: "POST",
      headers: { ...sqliteHeaders, cookie: adminCookie },
      body: backup,
    });
    assert.equal(validateResponse.status, 200);
    assert.equal(((await validateResponse.json() as any).validation.valid), true);

    const missingConfirmation = await fetch(`${base}/admin/database/restore`, {
      method: "POST",
      headers: { ...sqliteHeaders, cookie: adminCookie },
      body: backup,
    });
    assert.equal(missingConfirmation.status, 400);

    const restoreResponse = await fetch(`${base}/admin/database/restore`, {
      method: "POST",
      headers: { ...sqliteHeaders, cookie: adminCookie, "x-restore-confirmation": "RESTORE" },
      body: backup,
    });
    assert.equal(restoreResponse.status, 200);
    assert.equal((await restoreResponse.json() as any).success, true);
    const clearedCookies = restoreResponse.headers.get("set-cookie") || "";
    assert.match(clearedCookies, /xui_admin_session=;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.match(clearedCookies, /xui_user_session=;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.equal((await fetch(`${base}/admin/exceptions`, { headers: { cookie: adminCookie } })).status, 401);
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

test("contact methods are independent, limited, migrated and publicly readable", async () => {
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
    assert.deepEqual(initial.contact.methods, []);

    const unauthorizedUpload = await fetch(`${base}/admin/contact-methods/wechat/qr`, {
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
    const method = (id: string, type: string, sortOrder: number, enabled = true) => ({
      id,
      type,
      enabled,
      name: `${type}-${id}`,
      value: `account-${id}`,
      contactUrl: type === "email" ? `mailto:${id}@example.com` : type === "phone" ? "tel:+8613800000000" : `https://example.test/${id}`,
      qrCodeUrl: `https://cdn.example.test/${id}.png`,
      sortOrder,
    });
    const wechat = method("wechat", "wechat", 20);
    const email = method("email", "email", 10);
    const hidden = method("hidden", "qq", 5, false);
    const saved = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        contact: {
          enabled: true,
          buttonLabel: "联系售后",
          title: "联系运营支持",
          description: "每天 09:00 至 22:00 在线",
          methods: [wechat, email, hidden],
        },
      }),
    });
    assert.equal(saved.status, 200);

    const publicSettings = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(publicSettings.contact.enabled, true);
    assert.equal(publicSettings.contact.buttonLabel, "联系售后");
    assert.deepEqual(publicSettings.contact.methods.map((entry: any) => entry.id), ["email", "wechat"]);
    assert.equal(publicSettings.contact.methods[0].contactUrl, "mailto:email@example.com");
    assert.equal(publicSettings.contact.methods[0].qrCodeUploaded, false);

    const adminSettings = await fetch(`${base}/admin/settings`, { headers: { cookie: adminCookie } }).then(response => response.json()) as any;
    assert.deepEqual(adminSettings.settings.contact.methods.map((entry: any) => entry.id), ["hidden", "email", "wechat"]);

    const unsafeUrl = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ contact: { methods: [{ ...wechat, contactUrl: "javascript:alert(1)" }] } }),
    });
    assert.equal(unsafeUrl.status, 400);

    const duplicateIds = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ contact: { methods: [wechat, { ...email, id: wechat.id }] } }),
    });
    assert.equal(duplicateIds.status, 400);

    const tooMany = await fetch(`${base}/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ contact: { methods: Array.from({ length: 11 }, (_value, index) => method(`contact-${index}`, "custom", index)) } }),
    });
    assert.equal(tooMany.status, 400);

    const formats = [
      ["image/png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
      ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff])],
      ["image/webp", Buffer.from("RIFF0000WEBP", "ascii")],
    ] as const;
    for (const [mimeType, image] of formats) {
      const upload = await fetch(`${base}/admin/contact-methods/wechat/qr`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ dataUrl: `data:${mimeType};base64,${image.toString("base64")}` }),
      });
      assert.equal(upload.status, 200);
      const publicQr = await fetch(`${base}/contact-methods/wechat/qr`);
      assert.equal(publicQr.status, 200);
      assert.equal(publicQr.headers.get("content-type"), mimeType);
      assert.deepEqual(Buffer.from(await publicQr.arrayBuffer()), image);
    }

    const invalidImage = await fetch(`${base}/admin/contact-methods/wechat/qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${Buffer.from("not an image").toString("base64")}` }),
    });
    assert.equal(invalidImage.status, 400);

    const invalidBase64 = await fetch(`${base}/admin/contact-methods/wechat/qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: "data:image/png;base64,iVBORw0KGgo" }),
    });
    assert.equal(invalidBase64.status, 400);

    const oversizedImage = Buffer.alloc(1024 * 1024 + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversizedImage);
    const oversizedUpload = await fetch(`${base}/admin/contact-methods/wechat/qr`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${oversizedImage.toString("base64")}` }),
    });
    assert.equal(oversizedUpload.status, 400);

    const afterUpload = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(afterUpload.contact.methods.find((entry: any) => entry.id === "wechat").qrCodeUploaded, true);
    const adminQr = await fetch(`${base}/admin/contact-methods/wechat/qr`, { headers: { cookie: adminCookie } });
    assert.equal(adminQr.status, 200);

    const unauthorizedDelete = await fetch(`${base}/admin/contact-methods/wechat/qr`, { method: "DELETE" });
    assert.equal(unauthorizedDelete.status, 401);
    const deleted = await fetch(`${base}/admin/contact-methods/wechat/qr`, { method: "DELETE", headers: { cookie: adminCookie } });
    assert.equal(deleted.status, 200);

    const afterDelete = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(afterDelete.contact.methods.find((entry: any) => entry.id === "wechat").qrCodeUploaded, false);
    assert.equal((await fetch(`${base}/contact-methods/wechat/qr`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    store.close();
  }
});

test("legacy contact settings migrate into one independent contact method", async () => {
  const store = new CommercialStore(":memory:");
  store.setSetting("contact_enabled", "true");
  store.setSetting("contact_text", "微信：legacy-account");
  store.setSetting("contact_url", "https://example.test/legacy");
  store.setSetting("contact_qr_url", "https://cdn.example.test/legacy.png");
  store.setSetting("contact_qr_mime", "image/png");
  store.setSetting("contact_qr_data", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"));
  const app = express();
  app.use(express.json());
  app.use("/api", attachCommercialUser(store));
  app.use("/api", createCommercialRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}/api`;

  try {
    const settings = await fetch(`${base}/contact-settings`).then(response => response.json()) as any;
    assert.equal(settings.contact.methods.length, 1);
    assert.equal(settings.contact.methods[0].id, "legacy-contact");
    assert.equal(settings.contact.methods[0].value, "微信：legacy-account");
    assert.equal(settings.contact.methods[0].qrCodeUploaded, true);
    assert.match(store.getSetting("contact_methods", ""), /legacy-contact/);
    const qr = await fetch(`${base}/contact-methods/legacy-contact/qr`);
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get("content-type"), "image/png");
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

    const maximumLogo = Buffer.alloc(1024 * 1024);
    png.copy(maximumLogo);
    const uploaded = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${maximumLogo.toString("base64")}` }),
    });
    assert.equal(uploaded.status, 200);

    const oversizedLogo = Buffer.alloc(1024 * 1024 + 1);
    png.copy(oversizedLogo);
    const oversizedUpload = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ dataUrl: `data:image/png;base64,${oversizedLogo.toString("base64")}` }),
    });
    assert.equal(oversizedUpload.status, 400);
    assert.match((await oversizedUpload.json() as any).error, /1MB/);

    const publicLogo = await fetch(`${base}/resource-recommendations/server-one/logo`, { headers: { cookie: userCookie } });
    assert.equal(publicLogo.status, 200);
    assert.equal(publicLogo.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await publicLogo.arrayBuffer()), maximumLogo);

    const adminLogo = await fetch(`${base}/admin/resource-recommendations/server-one/logo`, { headers: { cookie: adminCookie } });
    assert.equal(adminLogo.status, 200);
    assert.deepEqual(Buffer.from(await adminLogo.arrayBuffer()), maximumLogo);

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
