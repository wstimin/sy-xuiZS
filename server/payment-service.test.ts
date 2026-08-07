import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  createPrivateKey,
  createSign,
  generateKeyPairSync,
} from "node:crypto";
import {
  decryptWechatResource,
  epaySign,
  encryptWechatResourceForTest,
  genericMd5Sign,
  getPaymentDriver,
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

test("EPay notifications require the configured PID and platform trade number", async () => {
  const driver = getPaymentDriver("epay");
  const config = { id: "epay", provider: "epay" as const, merchantId: "1001", merchantSecret: "secret" };
  const valid: Record<string, string> = {
    pid: "1001",
    out_trade_no: "ORDER1",
    trade_no: "EPAY1",
    trade_status: "TRADE_SUCCESS",
    money: "9.90",
    sign_type: "MD5",
  };
  valid.sign = epaySign(valid, "secret");
  const payment = await driver.verifyNotification(config, { params: valid, body: {}, headers: {} });
  assert.deepEqual({ orderNo: payment.orderNo, tradeNo: payment.tradeNo, amountCents: payment.amountCents }, {
    orderNo: "ORDER1", tradeNo: "EPAY1", amountCents: 990,
  });

  const wrongPid: Record<string, string> = { ...valid, pid: "2002" };
  wrongPid.sign = epaySign(wrongPid, "secret");
  await assert.rejects(driver.verifyNotification(config, { params: wrongPid, body: {}, headers: {} }), /PID/);

  const missingTradeNo: Record<string, string> = { ...valid, trade_no: "" };
  missingTradeNo.sign = epaySign(missingTradeNo, "secret");
  await assert.rejects(driver.verifyNotification(config, { params: missingTradeNo, body: {}, headers: {} }), /平台交易号/);
});

test("PayPal Orders v2 creates, captures and verifies completed payments", async () => {
  const requests: Array<{ method: string; path: string; body: any }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let body: any = rawBody;
    try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* OAuth form body */ }
    requests.push({ method: req.method || "GET", path: req.url || "", body });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/oauth2/token") return res.end(JSON.stringify({ access_token: "access-token" }));
    if (req.url === "/v2/checkout/orders" && req.method === "POST") {
      return res.end(JSON.stringify({ id: "PAYPAL-ORDER-1", status: "PAYER_ACTION_REQUIRED", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1" }] }));
    }
    if (req.url === "/v2/checkout/orders/PAYPAL-ORDER-1/capture") {
      return res.end(JSON.stringify({
        id: "PAYPAL-ORDER-1",
        status: "COMPLETED",
        purchase_units: [{ invoice_id: "ORDER1", custom_id: "ORDER1", payments: { captures: [{ id: "CAPTURE-1", status: "COMPLETED", amount: { currency_code: "CNY", value: "9.90" } }] } }],
      }));
    }
    if (req.url === "/v1/notifications/verify-webhook-signature") return res.end(JSON.stringify({ verification_status: "SUCCESS" }));
    res.statusCode = 404;
    res.end(JSON.stringify({ message: "not found" }));
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const driver = getPaymentDriver("paypal");
    const config = { id: "paypal", provider: "paypal" as const, gatewayUrl: baseUrl, merchantId: "client-id", merchantSecret: "client-secret", appId: "WEBHOOK-1", currency: "CNY" };
    const checkout = await driver.createCheckout(config, {
      orderNo: "ORDER1", amountCents: 990, name: "Test plan", notifyUrl: "https://site.test/notify",
      returnUrl: "https://site.test/paypal/return", cancelUrl: "https://site.test/paypal/cancel",
    });
    assert.equal(checkout.type, "redirect");
    assert.equal(checkout.providerOrderId, "PAYPAL-ORDER-1");
    assert.match(checkout.checkoutUrl, /PAYPAL-ORDER-1/);
    const createRequest = requests.find(item => item.path === "/v2/checkout/orders");
    assert.equal(createRequest?.body.purchase_units[0].amount.value, "9.90");
    assert.equal(createRequest?.body.purchase_units[0].amount.currency_code, "CNY");
    assert.equal(createRequest?.body.payment_source.paypal.experience_context.return_url, "https://site.test/paypal/return");

    const captured = await driver.captureCheckout!(config, "PAYPAL-ORDER-1", "attempt-1");
    assert.deepEqual({ orderNo: captured.orderNo, tradeNo: captured.tradeNo, amountCents: captured.amountCents }, {
      orderNo: "ORDER1", tradeNo: "CAPTURE-1", amountCents: 990,
    });

    const event = {
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAPTURE-1", status: "COMPLETED", invoice_id: "ORDER1", amount: { currency_code: "CNY", value: "9.90" } },
    };
    const notified = await driver.verifyNotification(config, {
      params: {}, body: JSON.stringify(event), headers: {
        "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert.pem",
        "paypal-transmission-id": "transmission-1", "paypal-transmission-sig": "signature",
        "paypal-transmission-time": new Date().toISOString(),
      },
    });
    assert.deepEqual({ orderNo: notified.orderNo, tradeNo: notified.tradeNo, amountCents: notified.amountCents }, {
      orderNo: "ORDER1", tradeNo: "CAPTURE-1", amountCents: 990,
    });
    assert.equal(requests.filter(item => item.path === "/v1/oauth2/token").length, 3);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
