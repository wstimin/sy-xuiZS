import { createHash } from "node:crypto";
import { Client, ConnectConfig, ClientChannel } from "ssh2";
import { cleanHostInput, requiredString, validPort } from "./validation.js";

export interface SshInput {
  ipOrDomain: string;
  sshPort?: number;
  sshUser?: string;
  authType?: "password" | "privateKey";
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPrivateKeyPassphrase?: string;
}

export interface SshSession {
  client: Client;
  host: string;
  port: number;
  user: string;
  fingerprint: string;
  latencyMs: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildInstallCommand(params: {
  scriptUrl: string;
  username: string;
  password: string;
  panelPort: number;
  webBasePath: string;
  serverIp: string;
  sslMode: "none" | "domain" | "ip";
  domain?: string;
  useSudo: boolean;
  interactiveAnswers?: string[];
  configurePanelAfterInstall?: boolean;
}): string {
  const env: Record<string, string> = {
    XUI_NONINTERACTIVE: "1",
    XUI_USERNAME: params.username,
    XUI_PASSWORD: params.password,
    XUI_PANEL_PORT: String(params.panelPort),
    XUI_WEB_BASE_PATH: params.webBasePath.replace(/^\/+|\/+$/g, ""),
    XUI_SERVER_IP: params.serverIp,
    XUI_SSL_MODE: params.sslMode,
    XUI_DB_TYPE: "sqlite",
    XUI_ENABLE_FAIL2BAN: "true",
  };
  if (params.domain) env.XUI_DOMAIN = params.domain;

  const assignments = Object.entries(env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
  const installer = params.interactiveAnswers
    ? [
        "installer=$(mktemp)",
        "trap 'rm -f \"$installer\"' EXIT",
        `curl -fLsS ${shellQuote(params.scriptUrl)} -o "$installer"`,
        `printf '%s\\n' ${params.interactiveAnswers.map(shellQuote).join(" ")} | bash "$installer"`,
      ].join(" && ")
    : `curl -fLsS ${shellQuote(params.scriptUrl)} | bash`;
  const panelPath = params.webBasePath.replace(/^\/+|\/+$/g, "");
  const configurePanel = params.configurePanelAfterInstall
    ? [
        "/usr/local/x-ui/x-ui setting",
        `-username ${shellQuote(params.username)}`,
        `-password ${shellQuote(params.password)}`,
        `-port ${shellQuote(String(params.panelPort))}`,
        `-webBasePath ${shellQuote(panelPath)}`,
        "&& systemctl restart x-ui",
      ].join(" ")
    : "";
  const script = configurePanel ? `${installer} && ${configurePanel}` : installer;
  return `${params.useSudo ? "sudo -n " : ""}env ${assignments} bash -c ${shellQuote(script)}`;
}

export async function connectSsh(input: SshInput): Promise<SshSession> {
  const host = cleanHostInput(input.ipOrDomain);
  if (!host) throw new Error("请输入有效的服务器 IP 或域名");
  const port = validPort(input.sshPort, 22);
  const user = requiredString(input.sshUser || "root", "SSH 用户名");
  const authType = input.authType || "password";

  const config: ConnectConfig = {
    host,
    port,
    username: user,
    readyTimeout: 15_000,
    keepaliveInterval: 10_000,
    keepaliveCountMax: 3,
  };
  if (authType === "privateKey") {
    config.privateKey = requiredString(input.sshPrivateKey, "SSH 私钥");
    if (input.sshPrivateKeyPassphrase) config.passphrase = input.sshPrivateKeyPassphrase;
  } else {
    config.password = requiredString(input.sshPassword, "SSH 密码");
  }

  let fingerprint = "";
  config.hostVerifier = (key) => {
    fingerprint = `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
    return true;
  };

  const client = new Client();
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("SSH 连接超时"));
    }, 20_000);
    client.once("ready", () => {
      clearTimeout(timer);
      resolve({ client, host, port, user, fingerprint, latencyMs: Date.now() - startedAt });
    });
    client.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`SSH 连接失败: ${error.message}`));
    });
    client.connect(config);
  });
}

export function execSsh(
  client: Client,
  command: string,
  options: { timeoutMs?: number; onStdout?: (text: string) => void; onStderr?: (text: string) => void } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let stream: ClientChannel | undefined;
    const timer = setTimeout(() => {
      stream?.close();
      reject(new Error("远程命令执行超时"));
    }, options.timeoutMs ?? 30_000);

    client.exec(command, (error, channel) => {
      if (error) {
        clearTimeout(timer);
        reject(new Error(`无法执行远程命令: ${error.message}`));
        return;
      }
      stream = channel;
      channel.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        options.onStdout?.(text);
      });
      channel.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        options.onStderr?.(text);
      });
      channel.once("close", (code: number | null) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 0 });
      });
      channel.once("error", (streamError: Error) => {
        clearTimeout(timer);
        reject(new Error(`远程命令失败: ${streamError.message}`));
      });
    });
  });
}

export async function inspectServer(session: SshSession) {
  const command = [
    "printf '__OS__='; . /etc/os-release 2>/dev/null; printf '%s %s' \"${PRETTY_NAME:-Linux}\" \"$(uname -m)\"; echo",
    "printf '__ARCH__='; uname -m",
    "printf '__KERNEL__='; uname -sr",
    "printf '__GLIBC__='; (ldd --version 2>/dev/null | head -n1 || true)",
    "printf '__SYSTEMD__='; (systemctl --version 2>/dev/null | head -n1 || echo unavailable)",
    "printf '__RAM_KB__='; awk '/MemTotal/{print $2}' /proc/meminfo",
    "printf '__FREE_KB__='; awk '/MemAvailable/{print $2}' /proc/meminfo",
    "printf '__CPU__='; (nproc 2>/dev/null || echo 1)",
    "printf '__UID__='; id -u",
    "printf '__USER__='; id -un",
    "printf '__CURL__='; command -v curl >/dev/null && echo yes || echo no",
  ].join("; ");
  const result = await execSsh(session.client, command);
  if (result.code !== 0) throw new Error(result.stderr || "无法读取服务器环境");
  const values = new Map<string, string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^__([A-Z_]+)__=(.*)$/);
    if (match) values.set(match[1], match[2].trim());
  }
  const isRoot = values.get("UID") === "0";
  const warnings: string[] = [];
  if (!isRoot) warnings.push("当前用户不是 root，部署时要求具备免密 sudo 权限。");
  if (values.get("CURL") !== "yes") warnings.push("服务器尚未安装 curl，官方安装脚本可能无法启动。");
  const totalRamMb = Math.round(Number(values.get("RAM_KB") || 0) / 1024);
  if (totalRamMb && totalRamMb < 512) warnings.push("服务器内存低于 512MB，建议先配置 Swap。");
  return {
    targetHost: session.host,
    sshPort: session.port,
    sshUser: session.user,
    latencyMs: session.latencyMs,
    hostKeyFingerprint: session.fingerprint,
    osName: values.get("OS") || "Linux",
    arch: values.get("ARCH") || "unknown",
    kernel: values.get("KERNEL") || "unknown",
    glibcVersion: values.get("GLIBC") || "unknown",
    systemdVersion: values.get("SYSTEMD") || "unknown",
    totalRamMb,
    freeRamMb: Math.round(Number(values.get("FREE_KB") || 0) / 1024),
    cpuCores: Number(values.get("CPU") || 1),
    isRoot,
    hasCurl: values.get("CURL") === "yes",
    warnings,
    status: values.get("SYSTEMD") === "unavailable" ? "incompatible" : warnings.length ? "warning" : "compatible",
  };
}
