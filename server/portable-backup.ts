import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const PORTABLE_BACKUP_CONTENT_TYPE = "application/vnd.xui-portable-backup";
export const PORTABLE_BACKUP_FORMAT = "xui-portable-backup";
export const PORTABLE_BACKUP_VERSION = 1;
export const PORTABLE_BACKUP_MAX_BYTES = 96 * 1024 * 1024;

type PortableBackupHeader = {
  format: typeof PORTABLE_BACKUP_FORMAT;
  version: typeof PORTABLE_BACKUP_VERSION;
  createdAt: string;
  appVersion: string;
  databaseSchemaVersion: number;
  cipher: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
};

type PortableBackupEnvelope = PortableBackupHeader & {
  authTag: string;
  ciphertext: string;
};

export type PortableBackupPayload = {
  database: Buffer;
  sourceVaultKey: Buffer;
  header: PortableBackupHeader;
};

function backupPassword(value: unknown) {
  const password = String(value || "");
  if (password.length < 12) throw new Error("备份密码至少需要 12 位");
  if (password.length > 256) throw new Error("备份密码不能超过 256 位");
  return password;
}

function deriveKey(password: string, salt: Buffer) {
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function authenticatedHeader(header: PortableBackupHeader) {
  return Buffer.from(JSON.stringify(header), "utf8");
}

export function createPortableBackup(database: Buffer, sourceVaultKey: Buffer, passwordValue: unknown, appVersion: string) {
  const password = backupPassword(passwordValue);
  if (sourceVaultKey.length !== 32) throw new Error("商业配置密钥长度无效");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header: PortableBackupHeader = {
    format: PORTABLE_BACKUP_FORMAT,
    version: PORTABLE_BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: String(appVersion || "unknown"),
    databaseSchemaVersion: 1,
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
  };
  const plaintext = Buffer.from(JSON.stringify({
    database: database.toString("base64"),
    sourceVaultKey: sourceVaultKey.toString("base64url"),
  }), "utf8");
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  cipher.setAAD(authenticatedHeader(header));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: PortableBackupEnvelope = {
    ...header,
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64"),
  };
  return { data: Buffer.from(JSON.stringify(envelope), "utf8"), header };
}

export function openPortableBackup(data: Buffer, passwordValue: unknown): PortableBackupPayload {
  const password = backupPassword(passwordValue);
  if (!Buffer.isBuffer(data) || data.length < 200) throw new Error("请选择有效的 X-UI 完整备份文件");
  if (data.length > PORTABLE_BACKUP_MAX_BYTES) throw new Error("完整备份文件不能超过 96MB");
  let envelope: PortableBackupEnvelope;
  try {
    envelope = JSON.parse(data.toString("utf8")) as PortableBackupEnvelope;
  } catch {
    throw new Error("备份文件格式无效或已经损坏");
  }
  if (envelope.format !== PORTABLE_BACKUP_FORMAT || envelope.version !== PORTABLE_BACKUP_VERSION) {
    throw new Error("不支持此备份格式或版本");
  }
  if (envelope.cipher !== "aes-256-gcm" || envelope.kdf !== "scrypt") throw new Error("备份使用了不支持的加密算法");
  const header: PortableBackupHeader = {
    format: envelope.format,
    version: envelope.version,
    createdAt: String(envelope.createdAt || ""),
    appVersion: String(envelope.appVersion || "unknown"),
    databaseSchemaVersion: Number(envelope.databaseSchemaVersion || 0),
    cipher: envelope.cipher,
    kdf: envelope.kdf,
    salt: String(envelope.salt || ""),
    iv: String(envelope.iv || ""),
  };
  try {
    const salt = Buffer.from(header.salt, "base64url");
    const iv = Buffer.from(header.iv, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, salt), iv);
    decipher.setAAD(authenticatedHeader(header));
    decipher.setAuthTag(Buffer.from(String(envelope.authTag || ""), "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(String(envelope.ciphertext || ""), "base64")),
      decipher.final(),
    ]);
    const payload = JSON.parse(plaintext.toString("utf8")) as { database?: string; sourceVaultKey?: string };
    const database = Buffer.from(String(payload.database || ""), "base64");
    const sourceVaultKey = Buffer.from(String(payload.sourceVaultKey || ""), "base64url");
    if (database.length < 100 || sourceVaultKey.length !== 32) throw new Error("payload");
    return { database, sourceVaultKey, header };
  } catch {
    throw new Error("备份密码错误，或备份文件已经被篡改");
  }
}
