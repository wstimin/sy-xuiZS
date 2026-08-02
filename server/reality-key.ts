import { generateKeyPairSync } from "node:crypto";

export type RealityKeyPair = {
  privateKey: string;
  publicKey: string;
};

export function generateRealityKeyPair(): RealityKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privateJwk = privateKey.export({ format: "jwk" });
  const publicJwk = publicKey.export({ format: "jwk" });

  if (!privateJwk.d || !publicJwk.x) {
    throw new Error("本地生成 Reality 密钥失败");
  }

  return {
    privateKey: privateJwk.d,
    publicKey: publicJwk.x,
  };
}
