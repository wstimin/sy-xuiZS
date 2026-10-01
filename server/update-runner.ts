import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [installScript, statusPath, targetVersion] = process.argv.slice(2);
if (!installScript || !statusPath || !targetVersion) process.exit(2);

const startedAt = new Date().toISOString();
const updateDirectory = path.join(path.dirname(statusPath), "updates");
fs.mkdirSync(updateDirectory, { recursive: true });
const logPath = path.join(updateDirectory, `update-${startedAt.replace(/[:.]/g, "-")}.log`);

function writeStatus(state: "running" | "succeeded" | "failed", message: string) {
  fs.writeFileSync(statusPath, JSON.stringify({
    state,
    targetVersion,
    startedAt,
    finishedAt: state === "running" ? undefined : new Date().toISOString(),
    message,
  }), { encoding: "utf8", mode: 0o600 });
}

writeStatus("running", "正在下载、校验并安装官方发布包");
const log = fs.openSync(logPath, "a", 0o600);
try {
  const result = spawnSync("bash", [installScript, "install"], {
    cwd: path.dirname(installScript),
    env: { ...process.env },
    stdio: ["ignore", log, log],
    timeout: 15 * 60_000,
  });
  if (result.status === 0) writeStatus("succeeded", `已安装 v${targetVersion}，服务正在重新启动`);
  else writeStatus("failed", `更新失败，安装器退出码 ${result.status ?? "unknown"}；日志 ${path.basename(logPath)}`);
} catch (error) {
  writeStatus("failed", `更新器异常：${error instanceof Error ? error.message : String(error)}`);
} finally {
  fs.closeSync(log);
}
