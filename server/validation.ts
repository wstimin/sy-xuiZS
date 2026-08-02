import { randomBytes } from "node:crypto";

export function cleanHostInput(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    return url.hostname;
  } catch {
    return "";
  }
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validPort(value: unknown, fallback?: number): number {
  if ((value === undefined || value === null || value === "") && fallback) return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("端口必须是 1 到 65535 之间的整数");
  }
  return port;
}

export function normalizeWebPath(value: unknown, fallback = "/"): string {
  const raw = optionalString(value) || fallback;
  const path = `/${raw}`.replace(/\/{2,}/g, "/");
  return path.endsWith("/") ? path : `${path}/`;
}

export function randomToken(bytes = 12): string {
  return randomBytes(bytes).toString("hex");
}

export function assertHttpsUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}不是有效 URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label}必须使用 HTTPS`);
  return url.toString();
}
