import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey } from "node:crypto";
import test from "node:test";
import { generateRealityKeyPair } from "./reality-key.js";

test("generateRealityKeyPair returns a valid raw X25519 key pair", () => {
  const pair = generateRealityKeyPair();

  assert.equal(Buffer.from(pair.privateKey, "base64url").length, 32);
  assert.equal(Buffer.from(pair.publicKey, "base64url").length, 32);
  assert.doesNotMatch(pair.privateKey, /=/);
  assert.doesNotMatch(pair.publicKey, /=/);

  const privateKey = createPrivateKey({
    format: "jwk",
    key: {
      kty: "OKP",
      crv: "X25519",
      d: pair.privateKey,
      x: pair.publicKey,
    },
  });
  const derivedPublicKey = createPublicKey(privateKey).export({ format: "jwk" });
  assert.equal(derivedPublicKey.x, pair.publicKey);
});

test("generateRealityKeyPair creates a fresh key pair for every node", () => {
  const first = generateRealityKeyPair();
  const second = generateRealityKeyPair();

  assert.notEqual(first.privateKey, second.privateKey);
  assert.notEqual(first.publicKey, second.publicKey);
});
