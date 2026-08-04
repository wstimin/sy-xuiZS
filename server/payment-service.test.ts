import assert from "node:assert/strict";
import test from "node:test";
import {
  createPrivateKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import {
  decryptWechatResource,
  encryptWechatResourceForTest,
  genericMd5Sign,
  verifyAlipayResponseSignature,
  verifyAlipaySignature,
  verifyWechatNotificationSignature,
} from "./payment-service.js";

function signAlipay(params: Record<string, string>, privateKey: string) {
  const content = Object.entries(params)
    .filter(([key]) => key !== "sign" && key !== "sign_type")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signer = createSign("RSA-SHA256");
  signer.update(content, "utf8");
  signer.end();
  return signer.sign(privateKey, "base64");
}

test("MGate, TokenPay and Epusdt signatures follow their documented MD5 formats", () => {
  const mgate = { app_id: "app-1", notify_url: "https://site.test/notify path", total_amount: "9.90" };
  assert.equal(genericMd5Sign(mgate, "secret", "sign", true), "18db1a6655126c8f19d6a2cad0ce4282");

  const tokenPay = { ActualAmount: "9.90", Currency: "USDT_TRC20", OutOrderId: "ORDER1" };
  assert.equal(genericMd5Sign(tokenPay, "secret", "Signature"), "9ff3ef78fda3b33c477aa0eb5f3988a0");

  const epusdt = { amount: "9.90", notify_url: "https://site.test/notify", order_id: "ORDER1" };
  assert.equal(genericMd5Sign(epusdt, "secret", "signature"), "392792f14a9b5b7ddb890e737a2dee05");
});

test("Alipay RSA2 notification signatures are verified", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const params = {
    app_id: "2026000000000000",
    out_trade_no: "ORDER1",
    total_amount: "9.90",
    trade_no: "ALI1",
    trade_status: "TRADE_SUCCESS",
    sign_type: "RSA2",
  };
  const sign = signAlipay(params, privateKey);
  assert.equal(verifyAlipaySignature({ ...params, sign }, publicKey), true);
  assert.equal(verifyAlipaySignature({ ...params, total_amount: "99.00", sign }, publicKey), false);

  const responseValue = '{"code":"10000","msg":"Success","qr_code":"https:\/\/qr.example.test\/ORDER1"}';
  const responseSigner = createSign("RSA-SHA256");
  responseSigner.update(responseValue, "utf8");
  responseSigner.end();
  const responseSign = responseSigner.sign(privateKey, "base64");
  const responseBody = `{"alipay_trade_precreate_response":${responseValue},"sign":${JSON.stringify(responseSign)}}`;
  assert.equal(verifyAlipayResponseSignature(responseBody, "alipay_trade_precreate_response", publicKey), true);
  assert.equal(verifyAlipayResponseSignature(responseBody.replace("Success", "Changed"), "alipay_trade_precreate_response", publicKey), false);
});

test("Wechat API v3 resources decrypt and notification headers verify", () => {
  const apiV3Key = "12345678901234567890123456789012";
  const transaction = { out_trade_no: "ORDER1", transaction_id: "WX1", trade_state: "SUCCESS", amount: { total: 990 } };
  const resource = encryptWechatResourceForTest(apiV3Key, transaction);
  assert.deepEqual(decryptWechatResource(apiV3Key, resource), transaction);

  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = "notification-nonce";
  const body = JSON.stringify({ id: "notification-1", resource });
  const signer = createSign("RSA-SHA256");
  signer.update(`${timestamp}\n${nonce}\n${body}\n`);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKey), "base64");
  const headers = {
    "wechatpay-timestamp": timestamp,
    "wechatpay-nonce": nonce,
    "wechatpay-signature": signature,
  };
  assert.equal(verifyWechatNotificationSignature(publicKey, headers, body), true);
  assert.equal(verifyWechatNotificationSignature(publicKey, headers, `${body} `), false);

  assert.throws(() => decryptWechatResource("too-short", resource), /32 字节/);
});
