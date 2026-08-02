import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { randomBytes } from "node:crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { buildInbound, buildSubscriptionUrl, InboundInput } from "./server/inbound-builder.js";
import { buildInstallCommand, connectSsh, execSsh, inspectServer, SshInput } from "./server/ssh.js";
import { assertHttpsUrl, cleanHostInput, normalizeWebPath, optionalString, randomToken, validPort } from "./server/validation.js";
import { XuiClient, XuiClientOptions } from "./server/xui-client.js";
import { injectSocksRouting, parseSocksInput } from "./server/xray-template.js";

const RECOMMENDED_INSTALLER = "https://raw.githubusercontent.com/wstimin/mogai-3xui/main/install.sh";
const OFFICIAL_INSTALLER = "https://raw.githubusercontent.com/MHSanaei/3x-ui/master/install.sh";

function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.APP_AUTH_TOKEN;
  if (!expected) return next();
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = bearer || req.header("x-app-token");
  if (supplied !== expected) return res.status(401).json({ error: "部署助手认证失败" });
  next();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendError(res: Response, error: unknown, status = 400) {
  if (!res.headersSent) res.status(status).json({ success: false, error: errorMessage(error) });
}

function xuiOptions(body: Record<string, any>): XuiClientOptions {
  return {
    panelAddress: body.panelAddress,
    panelPort: body.panelPort,
    panelPath: body.panelPath,
    panelProtocol: body.panelProtocol === "https" ? "https" : "http",
    panelUser: body.panelUser,
    panelPass: body.panelPass,
    panelToken: body.panelToken,
    allowInsecureTls: body.allowInsecureTls === true,
  };
}

function parseInstallerResult(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^__XUI_([A-Z_]+)__=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

async function startServer() {
  const app = express();
  const port = validPort(process.env.PORT, 1888);

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  app.use("/api", noStore);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "real-api", timestamp: new Date().toISOString() });
  });

  app.use("/api", requireAppAuth);

  app.get("/api/download-zip", (_req, res) => {
    res.status(404).json({ error: "源码导出接口已禁用，避免意外打包凭据、证书或数据库。" });
  });

  app.post("/api/test-ssh", async (req, res) => {
    let session;
    try {
      session = await connectSsh(req.body as SshInput);
      const details = await inspectServer(session);
      res.json({ success: true, message: "SSH 连接及系统环境检测成功", details });
    } catch (error) {
      sendError(res, error);
    } finally {
      session?.client.end();
    }
  });

  app.post("/api/deploy-panel", async (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.flushHeaders();
    const write = (event: Record<string, unknown>) => res.write(`${JSON.stringify(event)}\n`);
    let session;

    try {
      const body = req.body as Record<string, any> & SshInput;
      const host = cleanHostInput(body.ipOrDomain);
      if (!host) throw new Error("请输入有效的服务器 IP 或域名");
      const panelPort = body.panelPort ? validPort(body.panelPort) : 20_000 + Math.floor(Math.random() * 30_000);
      const panelPath = normalizeWebPath(body.panelPath || `/xui_${randomToken(3)}`);
      const domain = cleanHostInput(body.domain);
      const scriptType = ["recommended", "official", "custom"].includes(body.scriptType)
        ? body.scriptType
        : "recommended";
      const sslMode: "none" | "domain" | "ip" = scriptType === "recommended" || body.autoSSL
        ? (domain ? "domain" : "ip")
        : "none";
      let scriptUrl = scriptType === "official" ? OFFICIAL_INSTALLER : RECOMMENDED_INSTALLER;
      if (scriptType === "custom") scriptUrl = assertHttpsUrl(optionalString(body.customScriptUrl), "自定义脚本地址");
      const username = `admin_${randomToken(3)}`;
      const password = `Xui_${randomBytes(12).toString("base64url")}`;

      write({ type: "log", step: 1, message: `[SSH] 正在连接 ${host}:${body.sshPort || 22}` });
      session = await connectSsh(body);
      write({ type: "log", step: 1, message: `[SSH] 连接成功，主机密钥指纹 ${session.fingerprint}` });

      const systemInfo = await inspectServer(session);
      write({ type: "log", step: 2, message: `[OS] ${systemInfo.osName} / ${systemInfo.arch}` });
      if (systemInfo.status === "incompatible") throw new Error("服务器没有可用的 systemd，无法安装 3x-ui 服务");
      if (!systemInfo.isRoot) {
        const sudo = await execSsh(session.client, "sudo -n true", { timeoutMs: 10_000 });
        if (sudo.code !== 0) throw new Error("当前 SSH 用户不是 root，且没有免密 sudo 权限");
      }

      const scriptLabel = scriptType === "recommended" ? "推荐兼容脚本" : scriptType === "official" ? "官方脚本" : "自定义脚本";
      write({ type: "log", step: 3, message: `[ENV] 环境检查完成，准备执行${scriptLabel}` });
      const command = buildInstallCommand({
        scriptUrl,
        username,
        password,
        panelPort,
        webBasePath: panelPath,
        serverIp: host,
        sslMode,
        domain: domain || undefined,
        useSudo: !systemInfo.isRoot,
        interactiveAnswers: scriptType === "recommended"
          ? sslMode === "domain"
            ? ["y", String(panelPort), "1", domain, "", "n", "y"]
            : ["y", String(panelPort), "2", "", ""]
          : undefined,
        configurePanelAfterInstall: scriptType === "recommended",
      });
      let buffered = "";
      const relay = (prefix: string) => (text: string) => {
        buffered += text;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() || "";
        for (const line of lines) if (line.trim()) write({ type: "log", step: 4, message: `${prefix} ${line}` });
      };
      const install = await execSsh(session.client, command, {
        timeoutMs: 20 * 60_000,
        onStdout: relay("[3X-UI]"),
        onStderr: relay("[3X-UI]"),
      });
      if (buffered.trim()) write({ type: "log", step: 4, message: `[3X-UI] ${buffered}` });
      if (install.code !== 0) throw new Error(`3x-ui 安装脚本退出码 ${install.code}`);

      write({ type: "log", step: 7, message: "[VERIFY] 正在验证服务和读取安装结果" });
      const sudo = systemInfo.isRoot ? "" : "sudo -n ";
      const verifyCommand = `${sudo}systemctl is-active x-ui && ${sudo}bash -c 'if [ -r /etc/x-ui/install-result.env ]; then . /etc/x-ui/install-result.env; printf "__XUI_USERNAME__=%s\\n__XUI_PASSWORD__=%s\\n__XUI_PANEL_PORT__=%s\\n__XUI_WEB_BASE_PATH__=%s\\n__XUI_ACCESS_URL__=%s\\n__XUI_API_TOKEN__=%s\\n" "$XUI_USERNAME" "$XUI_PASSWORD" "$XUI_PANEL_PORT" "$XUI_WEB_BASE_PATH" "$XUI_ACCESS_URL" "$XUI_API_TOKEN"; fi; if [ -x /usr/local/x-ui/x-ui ]; then cert_output=$(/usr/local/x-ui/x-ui setting -getCert true 2>/dev/null || true); web_cert=$(printf "%s\\n" "$cert_output" | awk -F": *" "/^[[:space:]]*cert:/{print \\$2; exit}"); web_key=$(printf "%s\\n" "$cert_output" | awk -F": *" "/^[[:space:]]*key:/{print \\$2; exit}"); printf "__XUI_WEB_CERT_FILE__=%s\\n__XUI_WEB_KEY_FILE__=%s\\n" "$web_cert" "$web_key"; fi'`;
      const verify = await execSsh(session.client, verifyCommand, { timeoutMs: 30_000 });
      if (verify.code !== 0 || !verify.stdout.startsWith("active")) throw new Error(verify.stderr || "x-ui 服务没有成功启动");
      const installed = parseInstallerResult(verify.stdout);
      const installedPort = installed.PANEL_PORT || String(panelPort);
      const installedPath = normalizeWebPath(installed.WEB_BASE_PATH || panelPath);
      const recommendedTlsReady = Boolean(installed.WEB_CERT_FILE && installed.WEB_KEY_FILE);
      const fallbackProtocol = scriptType === "recommended"
        ? recommendedTlsReady ? "https" : "http"
        : sslMode === "none" ? "http" : "https";
      const accessUrl = installed.ACCESS_URL || `${fallbackProtocol}://${domain || host}:${installedPort}${installedPath}`;

      let apiToken = installed.API_TOKEN || undefined;
      if (!apiToken) {
        try {
          const tokenClient = new XuiClient({
            panelAddress: domain || host,
            panelPort: installedPort,
            panelPath: installedPath,
            panelProtocol: accessUrl.startsWith("https://") ? "https" : "http",
            panelUser: installed.USERNAME || username,
            panelPass: installed.PASSWORD || password,
            allowInsecureTls: true,
          });
          await tokenClient.authenticate();
          apiToken = await tokenClient.createApiToken(`xui-assistant-${Date.now().toString(36)}`);
          write({ type: "log", step: 8, message: "[TOKEN] 已创建面板 API Token" });
        } catch (error) {
          write({ type: "log", step: 8, message: `[TOKEN] 面板未自动返回 Token，可部署后在节点页面重新获取：${errorMessage(error)}` });
        }
      }

      const result = {
        id: `panel-${Date.now()}`,
        createdAt: new Date().toLocaleString("zh-CN"),
        accessUrl,
        protocol: accessUrl.startsWith("https://") ? "https" : "http",
        host: domain || host,
        port: installedPort,
        path: installedPath,
        username: installed.USERNAME || username,
        password: installed.PASSWORD || password,
        apiToken,
        sslEnabled: accessUrl.startsWith("https://"),
        installCommand: "已通过 SSH 安全执行，命令包含敏感凭据，未回传到浏览器。",
        scriptType,
        scriptUrl,
        systemInfo,
      };
      write({ type: "log", step: 9, message: "[SUCCESS] 3x-ui 服务已启动，安装结果验证通过" });
      write({ type: "result", result });
    } catch (error) {
      write({ type: "error", error: errorMessage(error) });
    } finally {
      session?.client.end();
      res.end();
    }
  });

  app.post("/api/get-panel-token", async (req, res) => {
    try {
      const client = new XuiClient(xuiOptions(req.body));
      await client.authenticate();
      const token = await client.createApiToken(`xui-assistant-${Date.now().toString(36)}`);
      res.json({ success: true, message: "已由 3x-ui 创建新的 API Token；该 Token 只显示一次", token, details: { accessUrl: client.baseUrl } });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/get-panel-tls", async (req, res) => {
    try {
      const client = new XuiClient(xuiOptions(req.body));
      await client.authenticate();
      const files = await client.getWebCertFiles();
      res.json({ success: true, files, sni: cleanHostInput(req.body.panelAddress) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/deploy-node", async (req, res) => {
    let client: XuiClient | undefined;
    let inboundId = 0;
    let originalXrayTemplate: { config: unknown; outboundTestUrl: string } | undefined;
    let xrayTemplateUpdated = false;
    try {
      const body = req.body as Record<string, any> & InboundInput;
      client = new XuiClient(xuiOptions(body));
      await client.authenticate();
      const reality = body.security === "Reality" ? await client.getRealityKeyPair() : undefined;
      const tlsFiles = body.security === "TLS" ? await client.getWebCertFiles() : undefined;
      const inboundInput = tlsFiles ? {
        ...body,
        sni: optionalString(body.sni) || cleanHostInput(body.panelAddress),
        tlsCertFile: tlsFiles.webCertFile,
        tlsKeyFile: tlsFiles.webKeyFile,
      } : body;
      const built = buildInbound(inboundInput, reality);
      const created = await client.addInbound(built.payload);
      inboundId = Number(created?.id || 0);
      if (!inboundId) {
        const list = await client.request<any[]>("panel/api/inbounds/list");
        inboundId = Number(list.find((item) => item?.tag === built.tag)?.id || 0);
      }
      if (!inboundId) throw new Error("3x-ui 已返回创建成功，但无法确认新入站 ID");

      const parsedSocks = parseSocksInput(body.socksRawInput);
      let socksList = parsedSocks;
      let outbounds: any[] = [];
      let rules: any[] = [];
      let socksConfigured = false;
      let socksExplanation = "未配置 SOCKS 出站，入站流量使用面板默认路由。";
      if (body.autoOutbound && parsedSocks.length) {
        const current = await client.getXrayTemplate();
        const config = current.xraySetting;
        originalXrayTemplate = { config, outboundTestUrl: current.outboundTestUrl || "" };
        const injected = injectSocksRouting(config, parsedSocks, built.tag, body.autoRouting !== false, body.enableLoadBalance === true);
        await client.updateXrayTemplate(injected.config, current.outboundTestUrl || "");
        xrayTemplateUpdated = true;
        socksList = injected.proxies;
        outbounds = injected.outbounds;
        rules = injected.rules;
        socksConfigured = true;
        socksExplanation = injected.balancer
          ? `已向 3x-ui 全局 Xray 模板写入 ${socksList.length} 个 SOCKS 出站，并为该入站绑定随机负载均衡器。`
          : `已向 3x-ui 全局 Xray 模板写入 ${socksList.length} 个 SOCKS 出站，并绑定该入站路由。`;
      }

      const settings = await client.getSettings();
      const address = cleanHostInput(body.panelAddress);
      const result = {
        id: `node-${Date.now()}`,
        inboundId,
        inboundTag: built.tag,
        createdAt: new Date().toLocaleString("zh-CN"),
        nodeName: optionalString(body.nodeName) || `node-${built.port}`,
        protocol: body.protocol || "VLESS",
        transport: body.transport || "TCP",
        security: body.security || "Reality",
        shareLink: built.shareLink(address, reality?.publicKey),
        subscriptionUrl: buildSubscriptionUrl(settings, built.clientSubId),
        inboundPort: built.port,
        uuid: built.credential,
        socksConfigured,
        socksList,
        xrayOutboundsJson: JSON.stringify(outbounds, null, 2),
        xrayRoutingJson: JSON.stringify(rules, null, 2),
        socksExplanation,
        realityParamsUsed: reality ? {
          sni: optionalString(body.sni) || "www.microsoft.com",
          publicKey: reality.publicKey,
          shortId: built.payload.streamSettings.realitySettings.shortIds[0],
          autoGenerated: true,
        } : null,
      };
      res.json({ success: true, result });
    } catch (error) {
      if (client && xrayTemplateUpdated && originalXrayTemplate) {
        try {
          await client.updateXrayTemplate(originalXrayTemplate.config, originalXrayTemplate.outboundTestUrl);
        } catch {
          // Preserve the original failure and continue with inbound rollback.
        }
      }
      if (client && inboundId) {
        try {
          await client.deleteInbound(inboundId);
        } catch {
          // Preserve the original failure; the response warns about rollback below.
        }
      }
      sendError(res, error);
    }
  });

  app.post("/api/validate-socks", (req, res) => {
    const items = parseSocksInput(req.body?.rawInput);
    res.json({ success: true, count: items.length, items });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, allowedHosts: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const certPath = process.env.SSL_CERT || "/etc/3xui-assistant/ssl/cert.pem";
  const keyPath = process.env.SSL_KEY || "/etc/3xui-assistant/ssl/key.pem";
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app)
      .listen(port, "0.0.0.0", () => console.log(`[HTTPS] 3x-ui 部署助手: https://0.0.0.0:${port}`));
  } else {
    app.listen(port, "0.0.0.0", () => console.log(`[HTTP] 3x-ui 部署助手: http://0.0.0.0:${port}`));
  }
}

startServer().catch((error) => {
  console.error("服务启动失败:", error);
  process.exitCode = 1;
});
