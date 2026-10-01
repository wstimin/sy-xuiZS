import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { apiRateLimitCategory, configureTrustedProxy, isPaymentNotificationPath } from "./network-security.js";

test("only loopback peers are trusted to supply forwarded client addresses", () => {
  const app = express();
  configureTrustedProxy(app);
  const trust = app.get("trust proxy fn") as (address: string, hop: number) => boolean;
  assert.equal(trust("127.0.0.1", 0), true);
  assert.equal(trust("::1", 0), true);
  assert.equal(trust("203.0.113.10", 0), false);
});

test("API endpoints are assigned to independent rate-limit buckets", () => {
  assert.equal(apiRateLimitCategory("/auth/login"), "auth");
  assert.equal(apiRateLimitCategory("/admin/auth/login"), "auth");
  assert.equal(apiRateLimitCategory("/auth/send-code"), "auth");
  assert.equal(apiRateLimitCategory("/test-ssh"), "deployment");
  assert.equal(apiRateLimitCategory("/deploy-panel"), "deployment");
  assert.equal(apiRateLimitCategory("/account"), "general");
  assert.equal(apiRateLimitCategory("/admin/orders", "GET"), "admin-read");
  assert.equal(apiRateLimitCategory("/admin/orders", "HEAD"), "admin-read");
  assert.equal(apiRateLimitCategory("/admin/orders", "POST"), "general");
  assert.equal(isPaymentNotificationPath("/payment/epay/channel-1/notify"), true);
  assert.equal(apiRateLimitCategory("/payment/epay/channel-1/notify"), "payment");
});
