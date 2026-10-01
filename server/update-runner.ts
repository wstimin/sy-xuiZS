import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

type UpdateState = "running" | "succeeded" | "failed";

const RELEASE_ROOT = "https://github.com/wstimin/sy-xuiZS/releases/download";
const PRESERVED_NAMES = new Set(["data", ".env", "start.cjs", ".npmrc"]);
const LEGACY_PROGRAM_NAMES = ["dist", "node_modules", "package.json", "package-lock.json", "VERSION", "install.sh", "ecosystem.config.cjs", ".env.example"];
const ONE_PANEL_IGNORED_NAMES = new Set(["install.sh", "ecosystem.config.cjs"]);

function writeStatus(
  statusPath: string,
  targetVersion: string,
  startedAt: string,
  state: UpdateState,
  message: string,
  progress: number,
  stage: string,
) {
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify({
    state,
    targetVersion,
    startedAt,
    finishedAt: state === "running" ? undefined : new Date().toISOString(),
    message,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    stage,
    runnerPid: state === "running" ? process.pid : undefined,
  }), { encoding: "utf8", mode: 0o600 });
}

function run(command: string, args: string[], options: Parameters<typeof spawnSync>[2] = {}) {
  const result = spawnSync(command, args, { ...options, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(`${command} 执行失败（退出码 ${result.status ?? "unknown"}）${detail ? `：${detail.slice(-600)}` : ""}`);
  }
  return result;
}

async function download(url: string, destination: string) {
  const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "xui-deploy-assistant-updater" }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}）`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
}

function sha256(filename: string) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function copyIfPresent(source: string, destination: string) {
  if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true, force: true, preserveTimestamps: true });
}

function moveIfPresent(source: string, destination: string) {
  if (!fs.existsSync(source)) return;
  try {
    fs.renameSync(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    fs.cpSync(source, destination, { recursive: true, force: true, preserveTimestamps: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
}

function isProcessAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isProcessAlive(pid)) await new Promise(resolve => setTimeout(resolve, 250));
}

async function healthVersion(port: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
      if (response.ok) {
        const payload = await response.json() as { version?: unknown };
        if (typeof payload.version === "string") return payload.version;
      }
    } catch { /* Service downtime is expected while the supervisor restarts it. */ }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  return null;
}

function validatePackage(packageDirectory: string, targetVersion: string) {
  for (const filename of ["VERSION", "package.json", "package-lock.json", path.join("dist", "server.cjs"), path.join("dist", "update-runner.cjs")]) {
    if (!fs.existsSync(path.join(packageDirectory, filename))) throw new Error(`发布包缺少 ${filename}`);
  }
  const packagedVersion = fs.readFileSync(path.join(packageDirectory, "VERSION"), "utf8").trim();
  if (packagedVersion !== targetVersion) throw new Error(`发布包版本 v${packagedVersion} 与目标 v${targetVersion} 不一致`);
  run(process.execPath, ["--check", path.join(packageDirectory, "dist", "server.cjs")]);
}

async function runManagedLinux(installScript: string, statusPath: string, targetVersion: string) {
  const startedAt = new Date().toISOString();
  const updateDirectory = path.join(path.dirname(statusPath), "updates");
  fs.mkdirSync(updateDirectory, { recursive: true });
  const logPath = path.join(updateDirectory, `update-${startedAt.replace(/[:.]/g, "-")}.log`);
  writeStatus(statusPath, targetVersion, startedAt, "running", "正在下载、校验并安装官方发布包", 15, "installing");
  const log = fs.openSync(logPath, "a", 0o600);
  try {
    const result = spawnSync("bash", [installScript, "install"], { cwd: path.dirname(installScript), env: { ...process.env }, stdio: ["ignore", log, log], timeout: 15 * 60_000 });
    if (result.status === 0) writeStatus(statusPath, targetVersion, startedAt, "succeeded", `已安装 v${targetVersion}，服务正在重新启动`, 100, "completed");
    else writeStatus(statusPath, targetVersion, startedAt, "failed", `更新失败，安装器退出码 ${result.status ?? "unknown"}；日志 ${path.basename(logPath)}`, 15, "failed");
  } catch (error) {
    writeStatus(statusPath, targetVersion, startedAt, "failed", `更新器异常：${error instanceof Error ? error.message : String(error)}`, 15, "failed");
  } finally { fs.closeSync(log); }
}

async function runOnePanel(rootInput: string, statusPath: string, targetVersion: string, parentPidInput: string) {
  const startedAt = new Date().toISOString();
  const rootDirectory = path.resolve(rootInput);
  const parentPid = Number(parentPidInput);
  const port = String(process.env.PORT || "1888");
  const updateDirectory = path.join(rootDirectory, "data", "updates");
  const workDirectory = path.join(updateDirectory, `work-${Date.now()}`);
  const packageDirectory = path.join(workDirectory, "package");
  const archiveName = `xui-zhushou-linux-v${targetVersion}.tar.gz`;
  const archivePath = path.join(workDirectory, archiveName);
  const checksumPath = path.join(workDirectory, "SHA256SUMS");
  const backupDirectory = path.join(updateDirectory, `program-backup-v${targetVersion}-${Date.now()}`);
  let incomingNames: string[] = [];
  let swapped = false;

  fs.mkdirSync(packageDirectory, { recursive: true });
  writeStatus(statusPath, targetVersion, startedAt, "running", `正在下载 v${targetVersion} 发布包`, 12, "downloading");
  try {
    const releaseUrl = `${RELEASE_ROOT}/v${targetVersion}`;
    await download(`${releaseUrl}/${archiveName}`, archivePath);
    await download(`${releaseUrl}/SHA256SUMS`, checksumPath);
    writeStatus(statusPath, targetVersion, startedAt, "running", "正在校验发布包完整性和版本", 28, "verifying");
    const expected = fs.readFileSync(checksumPath, "utf8").split(/\r?\n/).find(line => line.trim().endsWith(archiveName))?.trim().split(/\s+/)[0];
    if (!expected || expected.toLowerCase() !== sha256(archivePath).toLowerCase()) throw new Error("发布包 SHA-256 校验失败");
    run("tar", ["-xzf", archivePath, "-C", packageDirectory]);
    validatePackage(packageDirectory, targetVersion);
    copyIfPresent(path.join(rootDirectory, "start.cjs"), path.join(packageDirectory, "start.cjs"));
    copyIfPresent(path.join(rootDirectory, ".npmrc"), path.join(packageDirectory, ".npmrc"));

    writeStatus(statusPath, targetVersion, startedAt, "running", "正在安装生产依赖，此阶段通常需要 1–5 分钟", 45, "dependencies");
    run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: packageDirectory, env: { ...process.env, NODE_ENV: "production" }, timeout: 10 * 60_000, stdio: "pipe" });
    writeStatus(statusPath, targetVersion, startedAt, "running", "依赖安装完成，正在备份旧程序并切换文件", 68, "switching");
    fs.mkdirSync(backupDirectory, { recursive: true });
    incomingNames = fs.readdirSync(packageDirectory).filter(name => !PRESERVED_NAMES.has(name) && !ONE_PANEL_IGNORED_NAMES.has(name));
    const replaceNames = new Set([...LEGACY_PROGRAM_NAMES, ...incomingNames]);
    for (const name of replaceNames) moveIfPresent(path.join(rootDirectory, name), path.join(backupDirectory, name));
    for (const name of incomingNames) moveIfPresent(path.join(packageDirectory, name), path.join(rootDirectory, name));
    copyIfPresent(path.join(packageDirectory, "start.cjs"), path.join(rootDirectory, "start.cjs"));
    copyIfPresent(path.join(packageDirectory, ".npmrc"), path.join(rootDirectory, ".npmrc"));
    swapped = true;

    // Replace files before stopping the active process. Linux keeps the
    // already-loaded process alive, while a fast 1Panel supervisor restart
    // can only see the new release instead of racing back into the old one.
    if (Number.isInteger(parentPid) && parentPid > 1) {
      writeStatus(statusPath, targetVersion, startedAt, "running", "新版本文件已就位，正在重启 1Panel 运行进程", 82, "restarting");
      process.kill(parentPid, "SIGTERM");
      await waitForExit(parentPid, 10_000);
    }

    writeStatus(statusPath, targetVersion, startedAt, "running", `v${targetVersion} 已安装，正在等待健康检查`, 92, "health-check");
    let runningVersion = await healthVersion(port, 20_000);
    if (runningVersion !== targetVersion) {
      const launcher = fs.existsSync(path.join(rootDirectory, "start.cjs")) ? "start.cjs" : path.join("dist", "server.cjs");
      const child = spawn(process.execPath, [launcher], { cwd: rootDirectory, detached: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "production", APP_VERSION: targetVersion } });
      child.unref();
      runningVersion = await healthVersion(port, 45_000);
    }
    if (runningVersion !== targetVersion) throw new Error(`新版本未能通过健康检查（检测到 ${runningVersion || "服务未启动"}）`);
    try {
      fs.rmSync(backupDirectory, { recursive: true, force: true });
      fs.rmSync(workDirectory, { recursive: true, force: true });
    } catch { /* Cleanup failure does not invalidate a healthy updated service. */ }
    writeStatus(statusPath, targetVersion, startedAt, "succeeded", `1Panel 网站目录已更新到 v${targetVersion}；数据和环境配置已保留`, 100, "completed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (swapped && fs.existsSync(backupDirectory)) {
      try {
        for (const name of new Set([...LEGACY_PROGRAM_NAMES, ...incomingNames])) fs.rmSync(path.join(rootDirectory, name), { recursive: true, force: true });
        for (const name of fs.readdirSync(backupDirectory)) moveIfPresent(path.join(backupDirectory, name), path.join(rootDirectory, name));
        const launcher = fs.existsSync(path.join(rootDirectory, "start.cjs")) ? "start.cjs" : path.join("dist", "server.cjs");
        const child = spawn(process.execPath, [launcher], { cwd: rootDirectory, detached: true, stdio: "ignore", env: { ...process.env, NODE_ENV: "production" } });
        child.unref();
        writeStatus(statusPath, targetVersion, startedAt, "failed", `更新失败并已回滚：${message}`, 100, "rolled-back");
      } catch (rollbackError) {
        writeStatus(statusPath, targetVersion, startedAt, "failed", `更新失败且回滚异常：${message}；${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, 100, "rollback-failed");
      }
    } else writeStatus(statusPath, targetVersion, startedAt, "failed", `更新失败，当前版本未被替换：${message}`, 45, "failed");
  }
}

async function main() {
  const [mode, source, statusPath, targetVersion, parentPid] = process.argv.slice(2);
  if (!mode || !source || !statusPath || !targetVersion) process.exit(2);
  if (mode === "managed-linux") await runManagedLinux(source, statusPath, targetVersion);
  else if (mode === "1panel") await runOnePanel(source, statusPath, targetVersion, parentPid || "");
  else process.exit(2);
}

void main();
