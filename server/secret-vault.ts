import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(databasePath: string) {
  const configured = process.env.COMMERCIAL_SECRET_KEY || process.env.APP_AUTH_TOKEN;
  if (configured) return createHash("sha256").update(configured).digest();
  if (databasePath === ":memory:") return randomBytes(32);

  const keyPath = path.resolve(`${databasePath}.key`);
  if (fs.existsSync(keyPath)) return Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64url");
  const key = randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key.toString("base64url"), { encoding: "utf8", mode: 0o600 });
  return key;
}

export class SecretVault {
  private readonly key: Buffer;

  constructor(databasePath: string) {
    this.key = encryptionKey(databasePath);
  }

  encrypt(value: string) {
    if (!value) return "";
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(value: string) {
    if (!value) return "";
    const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
    if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("加密配置无法解密，请检查商业配置密钥");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
  }
}
