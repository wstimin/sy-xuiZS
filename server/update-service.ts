import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_VERSION_URL = "https://raw.githubusercontent.com/wstimin/sy-xuiZS/main/package.json";
const RELEASE_PAGE_URL = "https://github.com/wstimin/sy-xuiZS/releases/latest";
const CHECK_CACHE_MS = 5 * 60_000;

export type UpdateState = "idle" | "scheduled" | "running" | "succeeded" | "failed";

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
  canAutoUpdate: boolean;
  deploymentMode: "managed-linux" | "1panel" | "development";
  reason: string;
  releaseUrl: string;
  state: UpdateState;
  targetVersion?: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

type UpdateServiceOptions = {
  currentVersion: string;
  databasePath: string;
  rootDirectory?: string;
  platform?: NodeJS.Platform;
  versionUrl?: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: typeof spawn;
  isRoot?: boolean;
};

type PersistedUpdateState = Pick<UpdateStatus, "state" | "targetVersion" | "startedAt" | "finishedAt" | "message">;

function numericVersion(value: string) {
  const match = String(value || "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  return match ? { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] || "" } : null;
}

export function compareVersions(left: string, right: string) {
  const a = numericVersion(left);
  const b = numericVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] > b.parts[index] ? 1 : -1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, "en", { numeric: true }) > 0 ? 1 : -1;
}

function readPersistedState(statusPath: string): PersistedUpdateState {
  try {
    const value = JSON.parse(fs.readFileSync(statusPath, "utf8")) as PersistedUpdateState;
    return value && typeof value.state === "string" ? value : { state: "idle" };
  } catch {
    return { state: "idle" };
  }
}

export class UpdateService {
  private readonly currentVersion: string;
  private readonly rootDirectory: string;
  private readonly versionUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly spawnImpl: typeof spawn;
  private readonly statusPath: string;
  private readonly installScript: string;
  private readonly runnerPath: string;
  private readonly canAutoUpdate: boolean;
  private readonly deploymentMode: UpdateStatus["deploymentMode"];
  private readonly unsupportedReason: string;
  private latestVersion: string | null = null;
  private checkedAt: string | null = null;

  constructor(options: UpdateServiceOptions) {
    this.currentVersion = String(options.currentVersion || "development");
    this.rootDirectory = path.resolve(options.rootDirectory || process.cwd());
    this.versionUrl = options.versionUrl || DEFAULT_VERSION_URL;
    this.fetchImpl = options.fetchImpl || fetch;
    this.spawnImpl = options.spawnImpl || spawn;
    this.statusPath = path.join(path.dirname(path.resolve(options.databasePath)), "update-status.json");
    this.installScript = path.join(this.rootDirectory, "install.sh");
    this.runnerPath = path.join(this.rootDirectory, "dist", "update-runner.cjs");

    const platform = options.platform || process.platform;
    const isRoot = options.isRoot ?? (typeof process.getuid === "function" && process.getuid() === 0);
    const managedFiles = fs.existsSync(this.installScript) && fs.existsSync(this.runnerPath);
    if (platform !== "linux") {
      this.deploymentMode = "development";
      this.canAutoUpdate = false;
      this.unsupportedReason = "当前不是 Linux 正式部署环境，可检查版本但不能网页更新";
    } else if (!managedFiles) {
      this.deploymentMode = "1panel";
      this.canAutoUpdate = false;
      this.unsupportedReason = "当前为网站目录部署，请下载新版 1Panel 包覆盖程序文件";
    } else if (!isRoot) {
      this.deploymentMode = "managed-linux";
      this.canAutoUpdate = false;
      this.unsupportedReason = "服务进程没有更新所需的 root 权限";
    } else {
      this.deploymentMode = "managed-linux";
      this.canAutoUpdate = true;
      this.unsupportedReason = "可使用内置安装器自动备份、校验、更新和回滚";
    }
  }

  status(): UpdateStatus {
    const persisted = readPersistedState(this.statusPath);
    return {
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      updateAvailable: Boolean(this.latestVersion && compareVersions(this.latestVersion, this.currentVersion) > 0),
      checkedAt: this.checkedAt,
      canAutoUpdate: this.canAutoUpdate,
      deploymentMode: this.deploymentMode,
      reason: this.unsupportedReason,
      releaseUrl: RELEASE_PAGE_URL,
      ...persisted,
    };
  }

  async check(force = false): Promise<UpdateStatus> {
    if (!force && this.checkedAt && Date.now() - Date.parse(this.checkedAt) < CHECK_CACHE_MS) return this.status();
    const response = await this.fetchImpl(this.versionUrl, {
      headers: { Accept: "application/json", "User-Agent": "xui-deploy-assistant-update-check" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`);
    const payload = await response.json() as { version?: unknown };
    const latestVersion = String(payload.version || "").trim();
    if (!numericVersion(latestVersion)) throw new Error("官方版本信息格式无效");
    this.latestVersion = latestVersion;
    this.checkedAt = new Date().toISOString();
    return this.status();
  }

  async startUpdate(): Promise<UpdateStatus> {
    if (!this.canAutoUpdate) throw new Error(this.unsupportedReason);
    const currentState = readPersistedState(this.statusPath);
    if (currentState.state === "scheduled" || currentState.state === "running") throw new Error("系统更新已经在执行中");
    const checked = await this.check(true);
    if (!checked.updateAvailable || !checked.latestVersion) throw new Error("当前已经是最新版本");

    fs.mkdirSync(path.dirname(this.statusPath), { recursive: true });
    const scheduled: PersistedUpdateState = {
      state: "scheduled",
      targetVersion: checked.latestVersion,
      startedAt: new Date().toISOString(),
      message: "更新任务已提交，正在启动独立更新器",
    };
    fs.writeFileSync(this.statusPath, JSON.stringify(scheduled), { encoding: "utf8", mode: 0o600 });
    const child = this.spawnImpl(process.execPath, [this.runnerPath, this.installScript, this.statusPath, checked.latestVersion], {
      cwd: this.rootDirectory,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();
    return this.status();
  }
}
