import assert from "node:assert/strict";
import test from "node:test";
import { CommercialStore } from "./commercial-store.js";

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
