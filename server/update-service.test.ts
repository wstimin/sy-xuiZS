import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareVersions, UpdateService } from "./update-service.js";

test("version comparison handles upgrades and prereleases", () => {
  assert.equal(compareVersions("3.1.0", "3.0.7"), 1);
  assert.equal(compareVersions("3.0.7", "3.0.7"), 0);
  assert.equal(compareVersions("3.0.7-beta.1", "3.0.7"), -1);
  assert.equal(compareVersions("3.0.7", "3.0.7-beta.1"), 1);
});

test("update checks use the fixed version feed and report unsupported environments safely", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-update-test-"));
  try {
    const service = new UpdateService({
      currentVersion: "3.0.7",
      databasePath: path.join(directory, "app.db"),
      rootDirectory: directory,
      platform: "win32",
      fetchImpl: async () => new Response(JSON.stringify({ version: "3.1.0" }), { status: 200 }),
    });
    const initial = service.status();
    assert.equal(initial.currentVersion, "3.0.7");
    assert.equal(initial.latestVersion, null);
    assert.equal(initial.canAutoUpdate, false);
    const checked = await service.check(true);
    assert.equal(checked.latestVersion, "3.1.0");
    assert.equal(checked.updateAvailable, true);
    await assert.rejects(() => service.startUpdate(), /不是 Linux/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("managed Linux updates launch only the bundled detached runner", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-managed-update-test-"));
  try {
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(directory, "install.sh"), "#!/usr/bin/env bash\n", "utf8");
    fs.writeFileSync(path.join(directory, "dist", "update-runner.cjs"), "", "utf8");
    let invocation: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
    const service = new UpdateService({
      currentVersion: "3.0.7",
      databasePath: path.join(directory, "data", "app.db"),
      rootDirectory: directory,
      platform: "linux",
      isRoot: true,
      fetchImpl: async () => new Response(JSON.stringify({ version: "3.1.0" }), { status: 200 }),
      spawnImpl: ((command: string, args: string[], options: Record<string, unknown>) => {
        invocation = { command, args, options };
        return { unref() {} };
      }) as any,
    });
    const checked = await service.check(true);
    assert.equal(checked.state, "idle");
    assert.equal(checked.updateAvailable, true);
    assert.equal(invocation, null, "checking the version must never launch the updater");
    const status = await service.startUpdate();
    assert.equal(status.state, "scheduled");
    assert.equal(status.progress, 5);
    assert.equal(status.targetVersion, "3.1.0");
    assert.equal(invocation?.command, process.execPath);
    assert.deepEqual(invocation?.args, [
      path.join(directory, "dist", "update-runner.cjs"),
      "managed-linux",
      path.join(directory, "install.sh"),
      path.join(directory, "data", "update-status.json"),
      "3.1.0",
    ]);
    assert.equal(invocation?.options.detached, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("1Panel website deployments launch the portable updater without root", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-1panel-update-test-"));
  try {
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.mkdirSync(path.join(directory, "data"), { recursive: true });
    fs.writeFileSync(path.join(directory, "dist", "update-runner.cjs"), "", "utf8");
    let invocation: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
    const service = new UpdateService({
      currentVersion: "3.0.10",
      databasePath: path.join(directory, "data", "app.db"),
      rootDirectory: directory,
      platform: "linux",
      isRoot: false,
      fetchImpl: async () => new Response(JSON.stringify({ version: "3.0.11" }), { status: 200 }),
      spawnImpl: ((command: string, args: string[], options: Record<string, unknown>) => {
        invocation = { command, args, options };
        return { unref() {} };
      }) as any,
    });
    assert.equal(service.status().deploymentMode, "1panel");
    assert.equal(service.status().canAutoUpdate, true);
    const status = await service.startUpdate();
    assert.equal(status.state, "scheduled");
    assert.equal(status.progress, 5);
    assert.deepEqual(invocation?.args, [
      path.join(directory, "dist", "update-runner.cjs"),
      "1panel",
      directory,
      path.join(directory, "data", "update-status.json"),
      "3.0.11",
      String(process.pid),
    ]);
    assert.equal(invocation?.options.detached, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("stale legacy update states are unlocked instead of disabling updates forever", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-stale-update-test-"));
  try {
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.mkdirSync(path.join(directory, "data"), { recursive: true });
    fs.writeFileSync(path.join(directory, "start.cjs"), "", "utf8");
    fs.writeFileSync(path.join(directory, "dist", "update-runner.cjs"), "", "utf8");
    fs.writeFileSync(path.join(directory, "data", "update-status.json"), JSON.stringify({
      state: "running",
      targetVersion: "3.0.14",
      startedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
      message: "正在安装生产依赖并准备切换版本",
    }), "utf8");
    const service = new UpdateService({
      currentVersion: "3.0.13",
      databasePath: path.join(directory, "data", "app.db"),
      rootDirectory: directory,
      platform: "linux",
      isRoot: false,
    });
    const status = service.status();
    assert.equal(status.state, "failed");
    assert.equal(status.stage, "interrupted");
    assert.match(status.message || "", /解除更新锁/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy 1Panel packages without a runner explain the one-time manual bridge update", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-legacy-1panel-update-test-"));
  try {
    const service = new UpdateService({
      currentVersion: "3.0.9",
      databasePath: path.join(directory, "data", "app.db"),
      rootDirectory: directory,
      platform: "linux",
      isRoot: false,
    });
    const status = service.status();
    assert.equal(status.deploymentMode, "1panel");
    assert.equal(status.canAutoUpdate, false);
    assert.match(status.reason, /先手动升级/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("1Panel launcher takes precedence over a leftover managed installer", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xui-1panel-detection-test-"));
  try {
    fs.mkdirSync(path.join(directory, "dist"), { recursive: true });
    fs.writeFileSync(path.join(directory, "start.cjs"), "", "utf8");
    fs.writeFileSync(path.join(directory, "install.sh"), "", "utf8");
    fs.writeFileSync(path.join(directory, "dist", "update-runner.cjs"), "", "utf8");
    const service = new UpdateService({
      currentVersion: "3.0.11",
      databasePath: path.join(directory, "data", "app.db"),
      rootDirectory: directory,
      platform: "linux",
      isRoot: false,
    });
    assert.equal(service.status().deploymentMode, "1panel");
    assert.equal(service.status().canAutoUpdate, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
