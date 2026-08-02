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
}

export interface XrayTemplateResponse {
  xraySetting: Record<string, unknown>;
  outboundTestUrl: string;
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
  private readonly dispatcher?: Agent;

  constructor(options: XuiClientOptions) {
    this.options = options;
    this.baseUrl = normalizePanelBaseUrl(options);
    if (this.baseUrl.startsWith("https://") && options.allowInsecureTls) {
      this.dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  async authenticate(): Promise<void> {
    if (optionalString(this.options.panelToken)) return;
    const username = requiredString(this.options.panelUser, "面板用户名");
    const password = requiredString(this.options.panelPass, "面板密码");
    await this.refreshCsrfToken();
    const response = await this.rawRequest("login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": this.csrfToken,
      },
      body: JSON.stringify({ username, password }),
    }, false);
    const data = await this.parseResponse<unknown>(response, "面板登录");
    if (!data.success) throw new Error(data.msg || "面板用户名或密码错误");
    if (!this.cookie) throw new Error("面板登录成功但没有返回会话 Cookie，请检查面板路径和版本");
  }

  async request<T>(apiPath: string, init: RequestInit = {}): Promise<T> {
    let response = await this.rawRequest(apiPath, init, true);
    if (response.status === 403 && !optionalString(this.options.panelToken) && !this.isSafeMethod(init.method)) {
      await this.refreshCsrfToken();
      response = await this.rawRequest(apiPath, init, true);
    }
    const data = await this.parseResponse<T>(response, apiPath);
    if (!data.success) throw new Error(data.msg || `3x-ui API 调用失败: ${apiPath}`);
    return data.obj as T;
  }

  async createApiToken(name: string): Promise<string> {
    const result = await this.request<{ token?: string }>("panel/api/setting/apiTokens/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!result?.token) throw new Error("3x-ui 没有返回新 Token");
    return result.token;
  }

  async addInbound(payload: Record<string, unknown>): Promise<any> {
    return this.request("panel/api/inbounds/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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
    const files = await this.request<{ webCertFile?: string; webKeyFile?: string }>("panel/api/server/getWebCertFiles", { method: "GET" });
    const webCertFile = optionalString(files?.webCertFile);
    const webKeyFile = optionalString(files?.webKeyFile);
    if (!webCertFile || !webKeyFile) {
      throw new Error("目标 3x-ui 面板尚未配置可复用的 Web TLS 证书，请先在面板中申请或安装证书");
    }
    return { webCertFile, webKeyFile };
  }

  async getSettings(): Promise<Record<string, any>> {
    return this.request("panel/api/setting/all", { method: "POST" });
  }

  async getXrayTemplate(): Promise<XrayTemplateResponse> {
    const raw = await this.request<string>("panel/api/xray/", { method: "POST" });
    return parseXrayTemplateResponse(raw);
  }

  async updateXrayTemplate(config: unknown, outboundTestUrl = ""): Promise<void> {
    const body = new URLSearchParams({ xraySetting: JSON.stringify(config), outboundTestUrl });
    await this.request("panel/api/xray/update", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
  }

  private async rawRequest(apiPath: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    const headers = new Headers(init.headers);
    const token = optionalString(this.options.panelToken);
    if (authenticated && token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else if (this.cookie) {
      headers.set("Cookie", this.cookie);
      if (authenticated && !this.isSafeMethod(init.method) && this.csrfToken) {
        headers.set("X-CSRF-Token", this.csrfToken);
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(new URL(apiPath.replace(/^\/+/, ""), this.baseUrl), {
        ...init,
        headers,
        signal: controller.signal,
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}),
      } as RequestInit);
      this.captureCookies(response);
      return response;
    } catch (error: any) {
      if (error?.name === "AbortError") throw new Error("连接 3x-ui 面板超时");
      const hint = this.baseUrl.startsWith("https://")
        ? "；如面板使用自签名证书，请显式开启“允许自签名证书”"
        : "";
      throw new Error(`无法连接 3x-ui 面板: ${error?.message || String(error)}${hint}`);
    } finally {
      clearTimeout(timer);
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
