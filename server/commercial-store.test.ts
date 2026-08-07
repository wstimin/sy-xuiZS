import assert from "node:assert/strict";
import test from "node:test";
import { CommercialStore } from "./commercial-store.js";
import { createEpayUrl, epaySign, verifyEpaySignature } from "./payment-service.js";

test("only one initial administrator can be bootstrapped", () => {
  const store = new CommercialStore(":memory:");
  try {
    const admin = store.bootstrapAdmin("first-admin", "strong-password");
    const duplicate = store.bootstrapAdmin("second-admin", "strong-password");

    assert.equal(admin?.role, "admin");
    assert.equal(duplicate, null);
    assert.equal(store.listUsers().length, 1);
  } finally {
    store.close();
  }
});

function createStore() {
  return new CommercialStore(":memory:");
}

test("email accounts are unique and can still use legacy username login", () => {
  const store = createStore();
  try {
    const user = store.createUser("email-user", "strong-password", "user", "Buyer@Example.com");
    assert.equal(user.email, "buyer@example.com");
    assert.equal(store.authenticate("buyer@example.com", "strong-password").id, user.id);
    assert.equal(store.authenticate("email-user", "strong-password").id, user.id);
    assert.throws(() => store.createUser("another-user", "strong-password", "user", "buyer@example.com"), /邮箱已经注册/);
  } finally {
    store.close();
  }
});

test("administrator username and management path can be updated safely", () => {
  const store = createStore();
  try {
    const admin = store.bootstrapAdmin("admin", "strong-password")!;
    store.createUser("existing-user", "strong-password");

    const updated = store.updateUsername(admin.id, "operations-admin");
    assert.equal(updated.username, "operations-admin");
    assert.equal(store.authenticate("operations-admin", "strong-password").id, admin.id);
    assert.throws(() => store.authenticate("admin", "strong-password"), /错误/);
    assert.throws(() => store.updateUsername(admin.id, "existing-user"), /用户名已经存在/);
    assert.throws(() => store.updateUsername(admin.id, "bad name"), /用户名必须/);

    assert.equal(store.getAdminPath(), "admin");
    assert.equal(store.setAdminPath("/control-center/"), "control-center");
    assert.equal(store.getAdminPath(), "control-center");
    assert.throws(() => store.setAdminPath("api"), /系统保留路径/);
    assert.throws(() => store.setAdminPath("-invalid"), /入口后缀必须/);
  } finally {
    store.close();
  }
});

test("server maintenance can list administrators and reset credentials", () => {
  const store = new CommercialStore(":memory:");
  try {
    const admin = store.bootstrapAdmin("admin", "strong-password")!;
    const session = store.createSession(admin.id);
    assert.equal(store.listAdministrators()[0].username, "admin");

    const updated = store.updateAdministratorCredentials("admin", "operations-admin", "new-strong-password");
    assert.equal(updated.username, "operations-admin");
    assert.equal(store.getSessionUser(session), null);
    assert.throws(() => store.authenticate("admin", "strong-password"), /错误/);
    assert.equal(store.authenticate("operations-admin", "new-strong-password").id, admin.id);
    assert.throws(() => store.updateAdministratorCredentials("missing-admin", "next-admin"), /不存在/);
  } finally {
    store.close();
  }
});

test("orders persist an enabled payment method and reject disabled methods", () => {
  const store = createStore();
  try {
    const user = store.createUser("payment-user", "strong-password");
    const plan = store.listPlans()[0];
    store.setPaymentMethods([
      { id: "alipay", name: "支付宝", type: "alipay", enabled: true, instructions: "付款后备注订单号", paymentUrl: "https://pay.example.test", sortOrder: 10 },
      { id: "wechat", name: "微信支付", type: "wechat", enabled: false, instructions: "", paymentUrl: "", sortOrder: 20 },
    ]);
    const order = store.createOrder(user.id, plan.id, "alipay");
    assert.equal(order.paymentProvider, "alipay");
    assert.throws(() => store.createOrder(user.id, plan.id, "wechat"), /不存在或已停用/);
  } finally {
    store.close();
  }
});

test("all online payment methods can be disabled while remaining editable by administrators", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([
      { id: "alipay", name: "支付宝", type: "alipay", enabled: false, instructions: "", paymentUrl: "", sortOrder: 10 },
      { id: "wechat", name: "微信支付", type: "wechat", enabled: false, instructions: "", paymentUrl: "", sortOrder: 20 },
    ]);
    assert.deepEqual(store.getPaymentMethods(), []);
    assert.deepEqual(store.getPaymentMethods(true).map(method => ({ id: method.id, enabled: method.enabled })), [
      { id: "alipay", enabled: false },
      { id: "wechat", enabled: false },
    ]);
  } finally {
    store.close();
  }
});

test("paid order grants the exact plan snapshot", () => {
  const store = createStore();
  const user = store.createUser("buyer", "strong-password");
  const plan = store.createPlan({
    name: "测试年卡",
    priceCents: 9900,
    durationUnit: "years",
    durationValue: 1,
    panelMode: "limited",
    panelLimit: 8,
    nodeMode: "limited",
    nodeLimit: 80,
    dailyPanelLimit: 2,
    dailyNodeLimit: 10,
    concurrencyLimit: 1,
    enabled: true,
    sortOrder: 1,
  });
  const order = store.createOrder(user.id, plan.id);
  store.updatePlan(plan.id, { ...plan, name: "修改后的年卡", panelLimit: 1, nodeLimit: 1 });
  store.markOrderPaid(order.id, "test", "trade-1");
  const [entitlement]: any[] = store.listEntitlements(user.id);
  assert.equal(entitlement.planName, "测试年卡");
  assert.equal(entitlement.panelRemaining, 8);
  assert.equal(entitlement.nodeRemaining, 80);
  store.close();
});

test("redeem codes store only hashes and grant their plan once", () => {
  const store = createStore();
  try {
    const user = store.createUser("redeem-user", "strong-password");
    const plan = store.createPlan({
      name: "卡密月卡", priceCents: 2900, durationUnit: "months", durationValue: 1,
      panelMode: "limited", panelLimit: 2, nodeMode: "limited", nodeLimit: 8,
      dailyPanelLimit: 1, dailyNodeLimit: 4, concurrencyLimit: 1, enabled: true, sortOrder: 1,
    });
    const [created]: any[] = store.createRedeemCodes({ planId: plan.id, quantity: 1, note: "测试批次" });
    assert.match(created.code, /^XUI-/);
    assert.equal(store.listRedeemCodes()[0].codeMasked, created.codeMasked);
    assert.equal(JSON.stringify(store.listRedeemCodes()).includes(created.code), false);

    const result = store.redeemCode(user.id, created.code.toLowerCase(), plan.id);
    assert.equal(result.planName, "卡密月卡");
    assert.equal(result.order?.status, "paid");
    assert.equal(result.order?.paymentProvider, "redeem_code");
    assert.equal(result.order?.planId, plan.id);
    assert.equal(store.listOrders(user.id).length, 1);
    const [entitlement]: any[] = store.listEntitlements(user.id);
    assert.equal(entitlement.panelRemaining, 2);
    assert.equal(entitlement.nodeRemaining, 8);
    assert.equal(entitlement.sourceOrderId, result.orderId);
    assert.equal(store.listRedeemCodes()[0].status, "redeemed");
    assert.equal(store.listRedeemCodes()[0].orderId, result.orderId);
    assert.throws(() => store.refundOrder(result.orderId, "测试退款", "REFUND-CODE"), /卡密兑换订单不支持/);
    assert.throws(() => store.redeemCode(user.id, created.code), /已经兑换/);
  } finally {
    store.close();
  }
});

test("redeem codes must match the selected plan without being consumed on mismatch", () => {
  const store = createStore();
  try {
    const user = store.createUser("plan-bound-redeem-user", "strong-password");
    const [firstPlan, secondPlan] = store.listPlans();
    const otherPlan = secondPlan || store.createPlan({
      name: "其他套餐", priceCents: 4900, durationUnit: "months", durationValue: 1,
      panelMode: "limited", panelLimit: 3, nodeMode: "limited", nodeLimit: 10,
      dailyPanelLimit: 1, dailyNodeLimit: 5, concurrencyLimit: 1, enabled: true, sortOrder: 2,
    });
    const [created]: any[] = store.createRedeemCodes({ planId: firstPlan.id, quantity: 1 });

    assert.throws(() => store.redeemCode(user.id, created.code, otherPlan.id), /不适用于当前选择的套餐/);
    assert.equal(store.listRedeemCodes()[0].status, "active");
    assert.equal(store.listOrders(user.id).length, 0);
    assert.equal(store.listEntitlements(user.id).length, 0);

    const result = store.redeemCode(user.id, created.code, firstPlan.id);
    assert.equal(result.planId, firstPlan.id);
    assert.equal(store.listOrders(user.id).length, 1);
    assert.equal(store.listEntitlements(user.id).length, 1);
  } finally {
    store.close();
  }
});

test("disabled and expired redeem codes cannot be used", () => {
  const store = createStore();
  try {
    const user = store.createUser("blocked-redeem-user", "strong-password");
    const plan = store.listPlans()[0];
    const [disabled]: any[] = store.createRedeemCodes({ planId: plan.id, quantity: 1 });
    store.updateRedeemCodeStatus(disabled.id, "disabled");
    assert.throws(() => store.redeemCode(user.id, disabled.code), /已经停用/);
    assert.throws(() => store.createRedeemCodes({ planId: plan.id, quantity: 1, expiresAt: new Date(Date.now() - 1000).toISOString() }), /晚于当前时间/);
  } finally {
    store.close();
  }
});

test("refunding an order revokes the entitlement granted by that order", () => {
  const store = createStore();
  const user = store.createUser("refund-buyer", "strong-password");
  const plan = store.listPlans()[0];
  const order = store.createOrder(user.id, plan.id);
  store.markOrderPaid(order.id, "test", "refund-trade-1");

  store.refundOrder(order.id, "测试退款", "REFUND-1");

  const refunded: any = store.getOrder(order.id);
  const [entitlement]: any[] = store.listEntitlements(user.id);
  assert.equal(refunded.status, "refunded");
  assert.equal(entitlement.status, "revoked");
  assert.throws(() => store.reserveDeployment(user.id, "panel", "after-refund"), /没有可用的面板安装权益/);
  store.close();
});

test("administrators can adjust limited entitlement quotas and limits", () => {
  const store = createStore();
  const user = store.createUser("adjust-user", "strong-password");
  const entitlementId = store.grantEntitlement(user.id, {
    name: "可调整权益",
    durationUnit: "months",
    durationValue: 1,
    panelMode: "limited",
    panelLimit: 1,
    nodeMode: "limited",
    nodeLimit: 2,
  });

  store.adjustEntitlement(entitlementId, {
    panelRemaining: 5,
    nodeRemaining: 12,
    dailyPanelLimit: 2,
    dailyNodeLimit: 6,
    concurrencyLimit: 2,
  });

  const [entitlement]: any[] = store.listEntitlements(user.id);
  assert.equal(entitlement.panelRemaining, 5);
  assert.equal(entitlement.panelTotal, 5);
  assert.equal(entitlement.nodeRemaining, 12);
  assert.equal(entitlement.nodeTotal, 12);
  assert.equal(entitlement.dailyPanelLimit, 2);
  assert.equal(entitlement.dailyNodeLimit, 6);
  assert.equal(entitlement.concurrencyLimit, 2);
  store.close();
});

test("panel and node quotas are reserved, consumed and released independently", () => {
  const store = createStore();
  const user = store.createUser("quota-user", "strong-password");
  store.grantEntitlement(user.id, {
    name: "次数包",
    durationUnit: "days",
    durationValue: 7,
    panelMode: "limited",
    panelLimit: 1,
    nodeMode: "limited",
    nodeLimit: 2,
  });

  const panel = store.reserveDeployment(user.id, "panel", "panel-1");
  store.markDeploymentRunning(panel.deploymentId);
  store.succeedDeployment(panel.deploymentId);
  const node = store.reserveDeployment(user.id, "node", "node-1");
  store.failDeployment(node.deploymentId, "expected failure");

  const [entitlement]: any[] = store.listEntitlements(user.id);
  assert.equal(entitlement.panelRemaining, 0);
  assert.equal(entitlement.panelUsed, 1);
  assert.equal(entitlement.nodeRemaining, 2);
  assert.equal(entitlement.nodeUsed, 0);
  store.close();
});

test("concurrent requests cannot consume the same final quota", () => {
  const store = createStore();
  const user = store.createUser("parallel-user", "strong-password");
  store.grantEntitlement(user.id, {
    name: "单次",
    durationUnit: "days",
    durationValue: 1,
    panelMode: "limited",
    panelLimit: 1,
    nodeMode: "none",
    nodeLimit: 0,
  });
  store.reserveDeployment(user.id, "panel", "first");
  assert.throws(() => store.reserveDeployment(user.id, "panel", "second"), /没有可用的面板安装权益|同时执行/);
  store.close();
});

test("duplicate request ids never create a second deployment", () => {
  const store = createStore();
  const user = store.createUser("retry-user", "strong-password");
  store.grantEntitlement(user.id, {
    name: "节点包",
    durationUnit: "days",
    durationValue: 1,
    panelMode: "none",
    panelLimit: 0,
    nodeMode: "limited",
    nodeLimit: 2,
  });
  store.reserveDeployment(user.id, "node", "same-request");
  assert.throws(() => store.reserveDeployment(user.id, "node", "same-request"), /已经提交/);
  assert.equal(store.listDeployments(user.id).length, 1);
  store.close();
});

test("unlimited membership can still enforce daily and concurrency limits", () => {
  const store = createStore();
  const user = store.createUser("member", "strong-password");
  store.grantEntitlement(user.id, {
    name: "会员",
    durationUnit: "months",
    durationValue: 1,
    panelMode: "unlimited",
    panelLimit: 0,
    nodeMode: "unlimited",
    nodeLimit: 0,
    dailyPanelLimit: 1,
    dailyNodeLimit: 2,
    concurrencyLimit: 1,
  });
  const first = store.reserveDeployment(user.id, "panel", "unlimited-1");
  store.succeedDeployment(first.deploymentId);
  assert.throws(() => store.reserveDeployment(user.id, "panel", "unlimited-2"), /今日面板安装次数/);
  store.close();
});

test("expired entitlements cannot reserve a deployment", () => {
  const store = createStore();
  const user = store.createUser("expired-user", "strong-password");
  const entitlementId = store.grantEntitlement(user.id, {
    name: "已过期",
    durationUnit: "days",
    durationValue: 1,
    panelMode: "limited",
    panelLimit: 1,
    nodeMode: "none",
    nodeLimit: 0,
  });
  store.db.prepare("UPDATE entitlements SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", entitlementId);
  assert.throws(() => store.reserveDeployment(user.id, "panel", "expired-request"), /没有可用的面板安装权益/);
  store.close();
});

test("uncertain deployments keep quota reserved until an admin resolves them", () => {
  const store = createStore();
  const user = store.createUser("uncertain-user", "strong-password");
  store.grantEntitlement(user.id, {
    name: "待确认测试",
    durationUnit: "days",
    durationValue: 1,
    panelMode: "limited",
    panelLimit: 1,
    nodeMode: "none",
    nodeLimit: 0,
  });
  const deployment = store.reserveDeployment(user.id, "panel", "uncertain-request");
  store.markDeploymentRunning(deployment.deploymentId);
  store.markDeploymentUncertain(deployment.deploymentId, "connection lost");
  let [entitlement]: any[] = store.listEntitlements(user.id);
  assert.equal(entitlement.panelRemaining, 0);
  assert.equal(entitlement.panelReserved, 1);
  store.resolveUncertain(deployment.deploymentId, "failed");
  [entitlement] = store.listEntitlements(user.id) as any[];
  assert.equal(entitlement.panelRemaining, 1);
  assert.equal(entitlement.panelReserved, 0);
  store.close();
});

test("dashboard statistics are derived from persisted operational data", () => {
  const store = createStore();
  try {
    store.bootstrapAdmin("stats-admin", "strong-password");
    const activeUser = store.createUser("stats-active", "strong-password");
    const disabledUser = store.createUser("stats-disabled", "strong-password");
    store.updateUserStatus(disabledUser.id, "disabled");

    const plan = store.listPlans()[0];
    const pendingOrder = store.createOrder(activeUser.id, plan.id);
    const paidOrder = store.createOrder(activeUser.id, plan.id);
    store.markOrderPaid(paidOrder.id, "test", "stats-trade");

    const entitlementId = store.grantEntitlement(activeUser.id, {
      name: "expired entitlement",
      durationUnit: "days",
      durationValue: 1,
      panelMode: "limited",
      panelLimit: 1,
      nodeMode: "none",
      nodeLimit: 0,
    });
    store.db.prepare("UPDATE entitlements SET expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", entitlementId);

    const deployment = store.reserveDeployment(activeUser.id, "panel", "stats-deployment");
    store.succeedDeployment(deployment.deploymentId);

    const stats = store.getDashboardStats();
    assert.equal(stats.users, 2);
    assert.equal(stats.activeUsers, 1);
    assert.equal(stats.disabledUsers, 1);
    assert.equal(stats.admins, 1);
    assert.equal(stats.orders, 2);
    assert.equal(stats.pendingOrders, 1);
    assert.equal(stats.paidOrders, 1);
    assert.equal(stats.revenueCents, paidOrder.amountCents);
    assert.equal(stats.entitlements, 2);
    assert.equal(stats.activeEntitlements, 1);
    assert.equal(stats.expiredEntitlements, 1);
    assert.equal(stats.deployments, 1);
    assert.equal(stats.succeeded, 1);
    assert.equal(pendingOrder.status, "pending");
  } finally {
    store.close();
  }
});

test("admin ledger, audit and user detail are persisted from real operations", () => {
  const store = createStore();
  try {
    const admin = store.bootstrapAdmin("audit-admin", "strong-password")!;
    const user = store.createUser("detail-user", "strong-password");
    const entitlementId = store.grantEntitlement(user.id, {
      name: "管理测试权益",
      durationUnit: "months",
      durationValue: 1,
      panelMode: "limited",
      panelLimit: 2,
      nodeMode: "limited",
      nodeLimit: 3,
    });
    const deployment = store.reserveDeployment(user.id, "panel", "detail-request");
    store.succeedDeployment(deployment.deploymentId);
    store.adjustEntitlement(entitlementId, { panelRemaining: 4, nodeRemaining: 6 });
    store.recordAdminAction(admin.id, "调整权益额度", "entitlement", entitlementId, "test detail");

    const detail: any = store.getUserDetail(user.id);
    assert.equal(detail.user.username, "detail-user");
    assert.equal(detail.entitlements.length, 1);
    assert.equal(detail.deployments.length, 1);
    assert.equal(store.getUserDetail("missing-user"), null);

    const ledger: any[] = store.listUsageLedger();
    assert.ok(ledger.some(item => item.action === "grant" && item.capability === "panel"));
    assert.ok(ledger.some(item => item.action === "reserve"));
    assert.ok(ledger.some(item => item.action === "consume"));
    assert.ok(ledger.some(item => item.action === "adjust" && item.amount === 3));
    assert.ok(ledger.some(item => item.action === "adjust" && item.capability === "node" && item.amount === 3));

    const [audit]: any[] = store.listAdminAuditLogs();
    assert.equal(audit.adminUsername, "audit-admin");
    assert.equal(audit.targetType, "entitlement");
    assert.equal(audit.detail, "test detail");
  } finally {
    store.close();
  }
});

test("email verification codes expire, limit attempts and are consumed once", () => {
  const store = createStore();
  try {
    const issued = store.createEmailCode("verify@example.com", "register");
    assert.throws(() => store.verifyEmailCode(issued.email, "register", "000000"), /验证码错误/);
    assert.equal(store.verifyEmailCode(issued.email, "register", issued.code), true);
    assert.throws(() => store.verifyEmailCode(issued.email, "register", issued.code), /无效或已过期/);

    const expired = store.createEmailCode("expired@example.com", "reset_password");
    store.db.prepare("UPDATE email_verification_codes SET expires_at = ? WHERE email = ?").run("2000-01-01T00:00:00.000Z", expired.email);
    assert.throws(() => store.verifyEmailCode(expired.email, "reset_password", expired.code), /无效或已过期/);
  } finally {
    store.close();
  }
});

test("payment secrets are encrypted and excluded from public channel data", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([{ id: "epay-main", name: "在线支付", type: "epay", provider: "epay", enabled: true,
      instructions: "在线完成付款", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "top-secret", channel: "alipay", sortOrder: 10 }]);
    const publicMethod = store.getPaymentMethods()[0];
    assert.equal(publicMethod.gatewayUrl, undefined);
    assert.equal(publicMethod.merchantId, undefined);
    assert.equal(publicMethod.merchantSecret, undefined);
    const adminMethod = store.getPaymentMethods(true)[0];
    assert.equal(adminMethod.merchantSecretConfigured, true);
    assert.equal(adminMethod.merchantSecret, undefined);
    assert.equal(store.getPaymentMethods(true, true)[0].merchantSecret, "top-secret");
    const encrypted = (store.db.prepare("SELECT merchant_secret_encrypted AS value FROM payment_channels WHERE id = 'epay-main'").get() as any).value;
    assert.ok(encrypted.startsWith("v1."));
    assert.ok(!encrypted.includes("top-secret"));
  } finally {
    store.close();
  }
});

test("payment currencies use supported selections and keep legacy TokenPay configurations", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([
      {
        id: "tokenpay-main", name: "TokenPay", type: "tokenpay", provider: "tokenpay", enabled: true,
        instructions: "数字货币支付", paymentUrl: "", gatewayUrl: "https://tokenpay.example.test",
        merchantSecret: "tokenpay-secret", currency: "USDT-ERC20", sortOrder: 10,
      },
      {
        id: "epusdt-main", name: "Epusdt", type: "epusdt", provider: "epusdt", enabled: true,
        instructions: "USDT 支付", paymentUrl: "", gatewayUrl: "https://epusdt.example.test/api/v1/order/create-transaction",
        merchantSecret: "epusdt-secret", currency: "USDT-TRC20", sortOrder: 20,
      },
    ]);
    const methods = store.getPaymentMethods(true);
    assert.equal(methods.find(method => method.id === "tokenpay-main")?.currency, "USDT_ERC20");
    assert.equal(methods.find(method => method.id === "epusdt-main")?.currency, "USDT-TRC20");

    store.setPaymentMethods([{
      id: "tokenpay-legacy", name: "旧 TokenPay", type: "tokenpay", provider: "tokenpay", enabled: true,
      instructions: "兼容旧配置", paymentUrl: "", gatewayUrl: "https://tokenpay.example.test",
      merchantId: "USDC_ERC20", merchantSecret: "tokenpay-secret", currency: "CNY", sortOrder: 10,
    }]);
    assert.equal(store.getPaymentMethods(true)[0].currency, "USDC_ERC20");

    assert.throws(() => store.setPaymentMethods([{
      id: "tokenpay-invalid", name: "错误币种", type: "tokenpay", provider: "tokenpay", enabled: true,
      instructions: "", paymentUrl: "", gatewayUrl: "https://tokenpay.example.test",
      merchantSecret: "tokenpay-secret", currency: "BTC", sortOrder: 10,
    }]), /TokenPay 币种无效/);
  } finally {
    store.close();
  }
});

test("one EPay merchant exposes independently enabled payment choices and snapshots the selection", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([{
      id: "epay-merchant", name: "聚合收款", type: "epay", provider: "epay", enabled: true,
      instructions: "在线付款", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "epay-secret", channel: "alipay", enabledChannels: ["alipay", "wxpay"], sortOrder: 10,
    }]);
    const publicMethods = store.getPaymentMethods();
    assert.deepEqual(publicMethods.map(method => ({ id: method.id, name: method.name, channel: method.channel })), [
      { id: "epay-merchant--alipay", name: "支付宝", channel: "alipay" },
      { id: "epay-merchant--wxpay", name: "微信支付", channel: "wxpay" },
    ]);
    const adminMethod = store.getPaymentMethods(true)[0];
    assert.deepEqual(adminMethod.enabledChannels, ["alipay", "wxpay"]);
    const user = store.createUser("epay-choice-user", "strong-password");
    const order = store.createOrder(user.id, store.listPlans()[0].id, "epay-merchant--wxpay");
    assert.equal(order.paymentProvider, "epay-merchant");
    assert.equal(order.paymentChannel, "wxpay");
    assert.equal(order.paymentOptionId, "epay-merchant--wxpay");
    assert.throws(() => store.setPaymentMethods([{
      id: "epay-merchant", name: "聚合收款", type: "epay", provider: "epay", enabled: true,
      instructions: "在线付款", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "epay-secret", enabledChannels: [], sortOrder: 10,
    }]), /至少选择一种支付方式/);
  } finally {
    store.close();
  }
});

test("official payment credentials are encrypted and only expose configured markers", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([
      {
        id: "alipay-official", name: "支付宝官方", type: "alipay", provider: "alipay_official", enabled: true,
        instructions: "扫码支付", paymentUrl: "", merchantId: "2026000000000000", privateKey: "alipay-private-key",
        publicKey: "alipay-public-key", sortOrder: 10,
      },
      {
        id: "wechat-official", name: "微信支付官方", type: "wechat", provider: "wechat_official", enabled: true,
        instructions: "扫码支付", paymentUrl: "", appId: "wx-app-id", merchantId: "1900000001",
        certificateSerial: "SERIAL1", privateKey: "wechat-private-key", publicKey: "wechat-platform-key",
        apiV3Key: "12345678901234567890123456789012", sortOrder: 20,
      },
    ]);
    const publicMethods = store.getPaymentMethods();
    assert.equal(publicMethods[0].privateKey, undefined);
    assert.equal(publicMethods[1].apiV3Key, undefined);
    const adminMethods = store.getPaymentMethods(true);
    assert.equal(adminMethods[0].privateKeyConfigured, true);
    assert.equal(adminMethods[1].privateKeyConfigured, true);
    assert.equal(adminMethods[1].apiV3KeyConfigured, true);
    assert.equal(adminMethods[0].privateKey, undefined);
    assert.equal(adminMethods[1].apiV3Key, undefined);
    const privateCiphertext = (store.db.prepare("SELECT private_key_encrypted AS value FROM payment_channels WHERE id = ?").get("alipay-official") as any).value;
    const apiV3Ciphertext = (store.db.prepare("SELECT api_v3_key_encrypted AS value FROM payment_channels WHERE id = ?").get("wechat-official") as any).value;
    assert.ok(privateCiphertext.startsWith("v1."));
    assert.ok(apiV3Ciphertext.startsWith("v1."));
    assert.ok(!privateCiphertext.includes("alipay-private-key"));
    assert.ok(!apiV3Ciphertext.includes("12345678901234567890123456789012"));
  } finally {
    store.close();
  }
});

test("channels referenced by historical orders are archived instead of deleting callback credentials", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([{
      id: "epay-history", name: "历史易支付", type: "epay", provider: "epay", enabled: true,
      instructions: "在线支付", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "history-secret", channel: "alipay", sortOrder: 10,
    }]);
    const user = store.createUser("history-user", "strong-password");
    store.createOrder(user.id, store.listPlans()[0].id, "epay-history");
    store.setPaymentMethods([{
      id: "manual", name: "人工收款", type: "manual", provider: "manual", enabled: true,
      instructions: "联系管理员", paymentUrl: "", sortOrder: 10,
    }]);
    assert.equal(store.getPaymentMethods(true).some(method => method.id === "epay-history"), false);
    const archived = store.getPaymentMethods(true, true, true).find(method => method.id === "epay-history");
    assert.ok(archived);
    assert.equal(archived.enabled, false);
    assert.equal(archived.merchantSecret, "history-secret");
  } finally {
    store.close();
  }
});

test("duplicate payment completion grants one entitlement and rejects another trade number", () => {
  const store = createStore();
  try {
    const user = store.createUser("idempotent-user", "strong-password");
    const order = store.createOrder(user.id, store.listPlans()[0].id, "manual");
    store.markOrderPaid(order.id, "manual", "trade-one");
    store.markOrderPaid(order.id, "manual", "trade-one");
    assert.equal(store.listEntitlements(user.id).length, 1);
    assert.throws(() => store.markOrderPaid(order.id, "manual", "trade-two"), /其他支付交易/);
    assert.equal(store.listEntitlements(user.id).length, 1);
  } finally {
    store.close();
  }
});

test("epay URLs and callback signatures use the documented MD5 scheme", () => {
  const params = { pid: "1001", out_trade_no: "ORDER1", money: "9.90", sign_type: "MD5" };
  const sign = epaySign(params, "secret");
  assert.equal(verifyEpaySignature({ ...params, sign }, "secret"), true);
  assert.equal(verifyEpaySignature({ ...params, sign }, "wrong"), false);
  const checkout = new URL(createEpayUrl({ gatewayUrl: "https://pay.example.test", merchantId: "1001", merchantSecret: "secret", channel: "alipay" }, {
    orderNo: "ORDER1", amountCents: 990, name: "网络服务", notifyUrl: "https://site.example/api/notify", returnUrl: "https://site.example/console",
  }));
  assert.equal(checkout.pathname, "/submit.php");
  assert.equal(checkout.searchParams.get("money"), "9.90");
  assert.ok(checkout.searchParams.get("sign"));
});

test("one EPay merchant can expose USDT, PayPal, Alipay, Wechat and QQ", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([{
      id: "epay-five", name: "易支付", type: "epay", provider: "epay", enabled: true,
      instructions: "在线支付", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "epay-secret", channel: "alipay",
      enabledChannels: ["alipay", "wxpay", "qqpay", "paypal", "usdt.trc20"], sortOrder: 10,
    }]);
    assert.deepEqual(store.getPaymentMethods().map(method => ({ name: method.name, channel: method.channel })), [
      { name: "支付宝", channel: "alipay" },
      { name: "微信支付", channel: "wxpay" },
      { name: "QQ 钱包", channel: "qqpay" },
      { name: "PayPal", channel: "paypal" },
      { name: "USDT", channel: "usdt.trc20" },
    ]);
  } finally {
    store.close();
  }
});

test("PayPal credentials are encrypted and provider order ids survive capture completion", () => {
  const store = createStore();
  try {
    store.setPaymentMethods([{
      id: "paypal-main", name: "PayPal", type: "paypal", provider: "paypal", enabled: true,
      instructions: "PayPal 支付", paymentUrl: "", merchantId: "client-id", merchantSecret: "client-secret",
      appId: "WEBHOOK-1", currency: "USD", sandbox: true, sortOrder: 10,
    }]);
    const admin = store.getPaymentMethods(true)[0];
    assert.equal(admin.currency, "CNY");
    assert.equal(admin.sandbox, true);
    assert.equal(admin.merchantSecretConfigured, true);
    assert.equal(admin.merchantSecret, undefined);
    assert.equal(store.getPaymentMethods(true, true)[0].merchantSecret, "client-secret");

    const user = store.createUser("paypal-user", "strong-password");
    const order = store.createOrder(user.id, store.listPlans()[0].id, "paypal-main");
    const attempt = store.createPaymentAttempt(order.id, "paypal-main", "https://paypal.test/checkout", {}, order.expiresAt, "PAYPAL-ORDER-1");
    assert.equal(attempt.providerOrderId, "PAYPAL-ORDER-1");
    store.completePaymentAttempt(order.id, "paypal-main", "CAPTURE-1", { status: "COMPLETED" });
    const found = store.getPaymentAttemptByProviderOrder("paypal-main", "PAYPAL-ORDER-1");
    assert.equal(found.id, attempt.id);
    assert.equal(store.getPaymentAttempt(attempt.id).providerTradeNo, "CAPTURE-1");
  } finally {
    store.close();
  }
});

test("verified online callbacks recover expired orders while manual payments cannot", () => {
  const store = createStore();
  try {
    const user = store.createUser("late-payment-user", "strong-password");
    const manualOrder = store.createOrder(user.id, store.listPlans()[0].id, "manual");
    store.setPaymentMethods([{
      id: "epay-late", name: "易支付", type: "epay", provider: "epay", enabled: true,
      instructions: "在线支付", paymentUrl: "", gatewayUrl: "https://pay.example.test", merchantId: "1001",
      merchantSecret: "epay-secret", channel: "alipay", enabledChannels: ["alipay"], sortOrder: 10,
    }]);
    const order = store.createOrder(user.id, store.listPlans()[0].id, "epay-late--alipay");
    const attempt = store.createPaymentAttempt(order.id, "epay-late", "https://pay.example.test/checkout", {}, order.expiresAt);
    assert.throws(() => store.cancelOrder(order.id, user.id), /进行中的在线支付/);
    store.db.prepare("UPDATE orders SET expires_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", order.id);
    store.expirePendingOrders();
    assert.equal(store.getOrder(order.id).status, "expired");
    assert.equal(store.getPaymentAttempt(attempt.id).status, "closed");
    store.completePaymentAttempt(order.id, "epay-late", "EPAY-LATE-1", { verified: true });
    assert.equal(store.getOrder(order.id).status, "paid");
    assert.equal(store.getPaymentAttempt(attempt.id).status, "paid");
    assert.equal(store.listEntitlements(user.id).length, 1);

    store.db.prepare("UPDATE orders SET status = 'expired' WHERE id = ?").run(manualOrder.id);
    assert.throws(() => store.markOrderPaid(manualOrder.id, "manual", "MANUAL-LATE-1", true), /待支付订单/);
  } finally {
    store.close();
  }
});
