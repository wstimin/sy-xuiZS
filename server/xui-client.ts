import { Agent } from "undici";
import { normalizeWebPath, optionalString, requiredString, validPort } from "./validation.js";

interface XuiResponse<T> {
  success: boolean;
  msg?: string;
  obj?: T;
}

export interface XuiClientOptions {
  panelAddress: string;
  panelPort?: string | number;
  panelPath?: string;
  panelProtocol?: "http" | "https";
  panelUser?: string;
  panelPass?: string;
  panelToken?: string;
  allowInsecureTls?: boolean;
  signal?: AbortSignal;
}

export interface XrayTemplateResponse {
  xraySetting: Record<string, unknown>;
  outboundTestUrl: string;
}

type FetchImplementation = typeof fetch;

export class PanelRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanelRequestTimeoutError";
  }
}

export function findInboundRecord(
  inbounds: any[],
  expected: { tag: string; protocol: string; port: number },
): any | undefined {
  return inbounds.find(item => item?.tag === expected.tag)
    || inbounds.find(item => (
      String(item?.protocol || "").toLowerCase() === expected.protocol.toLowerCase()
      && Number(item?.port) === expected.port
    ));
}

function cleanApiToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim().replace(/^['"]|['"]$/g, "");
  if (!token || /^(?:null|undefined|none|<nil>)$/i.test(token)) return "";
  return token;
}

export function parseApiTokenResponse(raw: unknown): string {
  if (typeof raw === "string") {
    const token = cleanApiToken(raw);
    if (token && !/[\r\n]/.test(token)) return token;
    throw new Error("3x-ui 没有返回有效的 API Token");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("3x-ui 没有返回有效的 API Token");
  }

  const result = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(result)) {
    if (!["token", "apitoken", "accesstoken"].includes(key.replace(/[_-]/g, "").toLowerCase())) continue;
    const token = cleanApiToken(value);
    if (token) return token;
  }
  for (const key of ["data", "obj", "result"]) {
    if (!(key in result)) continue;
    try {
      return parseApiTokenResponse(result[key]);
    } catch {
      // Try the remaining known wrapper fields.
    }
  }
  throw new Error("3x-ui 没有返回有效的 API Token");
}

export function parseApiTokenFromOutput(output: string): string {
  const plain = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  const patterns = [
    /^\s*(?:API\s*Token|apiToken|XUI_API_TOKEN)\s*[:=]\s*([^\s'"`]+)\s*$/gim,
    /^\s*__XUI_API_TOKEN__=([^\s'"`]+)\s*$/gim,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(plain))) {
      const token = cleanApiToken(match[1]);
      if (token) return token;
    }
  }
  return "";
}

export function parseXrayTemplateResponse(raw: unknown): XrayTemplateResponse {
  if (typeof raw !== "string") {
    throw new Error("3x-ui 返回的 Xray 模板格式无效：预期为 JSON 字符串");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("3x-ui 返回的 Xray 模板不是有效 JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("3x-ui 返回的 Xray 模板结构无效");
  }
  const result = parsed as Record<string, unknown>;
  const xraySetting = result.xraySetting;
  if (!xraySetting || typeof xraySetting !== "object" || Array.isArray(xraySetting)) {
    throw new Error("3x-ui 返回的 Xray 模板缺少 xraySetting 配置");
  }

  return {
    xraySetting: xraySetting as Record<string, unknown>,
    outboundTestUrl: optionalString(result.outboundTestUrl) || "",
  };
}

export function mergeCookieHeader(current: string, setCookieValues: string[]): string {
  const cookies = new Map<string, string>();
  for (const item of current.split(/;\s*/)) {
    const separator = item.indexOf("=");
    if (separator > 0) cookies.set(item.slice(0, separator), item.slice(separator + 1));
  }
  for (const value of setCookieValues) {
    const pair = value.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const cookieValue = pair.slice(separator + 1).trim();
    if (cookieValue) cookies.set(name, cookieValue);
    else cookies.delete(name);
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function parseWebCertFiles(raw: unknown): { webCertFile: string; webKeyFile: string } {
  const files = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const webCertFile = optionalString(files.defaultCert) || optionalString(files.webCertFile);
  const webKeyFile = optionalString(files.defaultKey) || optionalString(files.webKeyFile);
  if (!webCertFile || !webKeyFile) {
    throw new Error("目标 3x-ui 面板尚未配置可复用的 Web TLS 证书，请先在面板中申请或安装证书");
  }
  return { webCertFile, webKeyFile };
}

export function serializeInboundPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result = { ...payload };
  for (const field of ["settings", "streamSettings", "sniffing"] as const) {
    const value = result[field];
    if (value !== undefined && typeof value !== "string") result[field] = JSON.stringify(value);
  }
  return result;
}

export function normalizePanelBaseUrl(options: XuiClientOptions): string {
  const raw = requiredString(options.panelAddress, "面板地址");
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `${options.panelProtocol || "http"}://${raw}`);
  } catch {
    throw new Error("面板地址格式无效");
  }
  if (!parsed.hostname) throw new Error("面板地址格式无效");
  const port = options.panelPort ? validPort(options.panelPort) : Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  const protocol = options.panelProtocol || (parsed.protocol.replace(":", "") as "http" | "https");
  const path = normalizeWebPath(options.panelPath || parsed.pathname || "/");
  return `${protocol}://${parsed.hostname}:${port}${path}`;
}

export class XuiClient {
  readonly baseUrl: string;
  private readonly options: XuiClientOptions;
  private cookie = "";
  private csrfToken = "";
  private apiToken = "";
  private sessionAuthenticated = false;
  private readonly dispatcher?: Agent;
  private readonly fetchImpl: FetchImplementation;

  constructor(options: XuiClientOptions, fetchImpl: FetchImplementation = fetch) {
    this.options = options;
    this.fetchImpl = fetchImpl;
    this.apiToken = optionalString(options.panelToken);
    this.baseUrl = normalizePanelBaseUrl(options);
    if (this.baseUrl.startsWith("https://") && options.allowInsecureTls) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  async authenticate(): Promise<void> {
    if (this.sessionAuthenticated) return;
    if (optionalString(this.options.panelToken) && !this.hasSessionCredentials()) return;
    await this.authenticateSession();
  }

  private async authenticateSession(): Promise<void> {
    if (this.sessionAuthenticated) return;
    const username = requiredString(this.options.panelUser, "面板用户名");
    const password = requiredString(this.options.panelPass, "面板密码");
    const login = () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.csrfToken) headers["X-CSRF-Token"] = this.csrfToken;
      return this.rawRequest("login", {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password }),
      }, false);
    };

    // Legacy and recommended 2.9.4-based panels accept the saved credentials
    // directly. Current panels answer 403 quickly and then need one CSRF retry.
    let response = await login();
    if (response.status === 403) {
      await this.refreshCsrfToken();
      response = await login();
    }
    const data = await this.parseResponse<unknown>(response, "面板登录");
    if (!data.success) throw new Error(data.msg || "面板用户名或密码错误");
    if (!this.cookie) throw new Error("面板登录成功但没有返回会话 Cookie，请检查面板路径和版本");
    this.sessionAuthenticated = true;
  }

  async request<T>(apiPath: string, init: RequestInit = {}, timeoutMs = 15_000, timeoutMessage?: string): Promise<T> {
    let response = await this.rawRequest(apiPath, init, true, false, timeoutMs, timeoutMessage);
    if (response.status === 403 && !optionalString(this.options.panelToken) && !this.isSafeMethod(init.method)) {
      await this.refreshCsrfToken();
      response = await this.rawRequest(apiPath, init, true, false, timeoutMs, timeoutMessage);
    }
    const data = await this.parseResponse<T>(response, apiPath);
    if (!data.success) throw new Error(data.msg || `3x-ui API 调用失败: ${apiPath}`);
    return data.obj as T;
  }

  async getApiToken(): Promise<string> {
    const result = await this.sessionRequest<unknown>("panel/setting/getApiToken", { method: "GET" });
    this.apiToken = parseApiTokenResponse(result);
    return this.apiToken;
  }

  async addInbound(payload: Record<string, unknown>, protocol = "节点", timeoutMs = 20_000): Promise<any> {
    return this.request("panel/api/inbounds/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeInboundPayload(payload)),
    }, timeoutMs, `3x-ui 创建 ${protocol} 入站超时，面板的 Xray 热加载未及时返回`);
  }

  async listInbounds(timeoutMs = 5_000): Promise<any[]> {
    return this.request<any[]>(
      "panel/api/inbounds/list",
      {},
      timeoutMs,
      "读取 3x-ui 入站列表超时",
    );
  }

  async deleteInbound(id: number): Promise<void> {
    await this.request(`panel/api/inbounds/del/${id}`, { method: "POST" });
  }

  async getRealityKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    const pair = await this.request<{ privateKey: string; publicKey: string }>("panel/api/server/getNewX25519Cert");
    if (!pair?.privateKey || !pair?.publicKey) throw new Error("3x-ui 未返回完整 Reality 密钥对");
    return pair;
  }

  async getWebCertFiles(): Promise<{ webCertFile: string; webKeyFile: string }> {
    const files = await this.sessionRequest<Record<string, unknown>>("panel/setting/defaultSettings", { method: "POST" });
    return parseWebCertFiles(files);
  }

  async getSettings(timeoutMs = 15_000): Promise<Record<string, any>> {
    return this.sessionRequest("panel/setting/defaultSettings", { method: "POST" }, timeoutMs);
  }

  async getXrayTemplate(): Promise<XrayTemplateResponse> {
    const raw = await this.sessionRequest<string>("panel/xray/", { method: "POST" });
    return parseXrayTemplateResponse(raw);
  }

  async updateXrayTemplate(config: unknown, outboundTestUrl = ""): Promise<void> {
    const body = new URLSearchParams({ xraySetting: JSON.stringify(config), outboundTestUrl });
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    };
    await this.sessionRequest("panel/xray/update", init);
  }

  async restartXray(timeoutMs = 20_000): Promise<void> {
    await this.sessionRequest(
      "panel/api/server/restartXrayService",
      { method: "POST" },
      timeoutMs,
      "SOCKS 路由已保存，但 Xray 重载超时",
    );
  }

  private async sessionRequest<T>(
    apiPath: string,
    init: RequestInit = {},
    timeoutMs = 15_000,
    timeoutMessage?: string,
  ): Promise<T> {
    await this.authenticateSession();
    let response = await this.rawRequest(apiPath, init, true, true, timeoutMs, timeoutMessage);
    if (response.status === 403 && !this.isSafeMethod(init.method)) {
      await this.refreshCsrfToken();
      response = await this.rawRequest(apiPath, init, true, true, timeoutMs, timeoutMessage);
    }
    const data = await this.parseResponse<T>(response, apiPath);
    if (!data.success) throw new Error(data.msg || `3x-ui API 调用失败: ${apiPath}`);
    return data.obj as T;
  }

  private async rawRequest(
    apiPath: string,
    init: RequestInit,
    authenticated: boolean,
    forceSession = false,
    timeoutMs = 15_000,
    timeoutMessage?: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = this.apiToken;
    if (authenticated && token && !forceSession) {
      headers.set("Authorization", `Bearer ${token}`);
    } else if (this.cookie) {
      headers.set("Cookie", this.cookie);
      if (authenticated && !this.isSafeMethod(init.method) && this.csrfToken) {
        headers.set("X-CSRF-Token", this.csrfToken);
      }
    }
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (this.options.signal?.aborted) controller.abort();
    else this.options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(apiPath.replace(/^\/+/, ""), this.baseUrl), {
        ...init,
        headers,
        signal: controller.signal,
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      } as RequestInit);
      this.captureCookies(response);
      return response;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        if (this.options.signal?.aborted) throw new Error("节点创建已终止");
        throw new PanelRequestTimeoutError(timeoutMessage || "连接 3x-ui 面板超时");
      }
      const hint = this.baseUrl.startsWith("https://")
        ? "；如面板使用自签名证书，请显式开启“允许自签名证书”"
        : "";
      throw new Error(`无法连接 3x-ui 面板: ${error?.message || String(error)}${hint}`);
    } finally {
      clearTimeout(timer);
      this.options.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  private async refreshCsrfToken(): Promise<void> {
    const response = await this.rawRequest("csrf-token", { method: "GET" }, false);
    const data = await this.parseResponse<string>(response, "获取面板 CSRF Token");
    if (!data.success || typeof data.obj !== "string" || !data.obj) {
      throw new Error(data.msg || "3x-ui 没有返回有效的 CSRF Token");
    }
    this.csrfToken = data.obj;
  }

  private captureCookies(response: Response): void {
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
    this.cookie = mergeCookieHeader(this.cookie, setCookies.filter(Boolean));
  }

  private isSafeMethod(method?: string): boolean {
    return ["GET", "HEAD", "OPTIONS", "TRACE"].includes((method || "GET").toUpperCase());
  }

  private hasSessionCredentials(): boolean {
    return Boolean(optionalString(this.options.panelUser) && optionalString(this.options.panelPass));
  }

  private async parseResponse<T>(response: Response, operation: string): Promise<XuiResponse<T>> {
    const text = await response.text();
    let data: XuiResponse<T>;
    try {
      data = JSON.parse(text);
    } catch {
      const htmlHint = /^\s*</.test(text) ? "（收到 HTML，通常是面板路径填写错误）" : "";
      throw new Error(`${operation} 返回了非 JSON 响应${htmlHint}`);
    }
    if (!response.ok) throw new Error(data.msg || `${operation} 请求失败，HTTP ${response.status}`);
    return data;
  }
}
