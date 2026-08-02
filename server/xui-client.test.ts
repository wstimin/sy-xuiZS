import assert from "node:assert/strict";
import test from "node:test";
import { mergeCookieHeader, parseApiTokenFromOutput, parseApiTokenResponse, parseXrayTemplateResponse } from "./xui-client.js";

test("mergeCookieHeader preserves the CSRF session and replaces updated cookies", () => {
  const cookie = mergeCookieHeader(
    "session=old; locale=zh-CN",
    ["session=new; Path=/; HttpOnly", "csrf=token; Path=/; SameSite=Strict"],
  );
  assert.equal(cookie, "session=new; locale=zh-CN; csrf=token");
});

test("parseApiTokenResponse accepts token response variants", () => {
  assert.equal(parseApiTokenResponse({ token: "token-a" }), "token-a");
  assert.equal(parseApiTokenResponse({ apiToken: "token-b" }), "token-b");
  assert.equal(parseApiTokenResponse({ data: { access_token: "token-c" } }), "token-c");
  assert.equal(parseApiTokenResponse("token-d"), "token-d");
});

test("parseApiTokenResponse rejects empty token responses", () => {
  assert.throws(() => parseApiTokenResponse({ token: "" }), /没有返回有效的新 Token/);
});

test("parseApiTokenFromOutput extracts installer tokens and strips ANSI colors", () => {
  assert.equal(parseApiTokenFromOutput("\u001b[32mAPI Token: token-from-installer\u001b[0m\n"), "token-from-installer");
  assert.equal(parseApiTokenFromOutput("apiToken: token-from-cli\n"), "token-from-cli");
  assert.equal(parseApiTokenFromOutput("installation complete\n"), "");
});

test("parseXrayTemplateResponse parses the JSON string returned by 3x-ui", () => {
  const result = parseXrayTemplateResponse(JSON.stringify({
    xraySetting: {
      outbounds: [{ tag: "direct", protocol: "freedom" }],
      routing: { rules: [] },
    },
    inboundTags: ["api"],
    outboundTestUrl: "https://www.google.com/generate_204",
  }));

  assert.deepEqual(result.xraySetting, {
    outbounds: [{ tag: "direct", protocol: "freedom" }],
    routing: { rules: [] },
  });
  assert.equal(result.outboundTestUrl, "https://www.google.com/generate_204");
});

test("parseXrayTemplateResponse rejects malformed JSON", () => {
  assert.throws(
    () => parseXrayTemplateResponse("{not-json"),
    /不是有效 JSON/,
  );
});

test("parseXrayTemplateResponse rejects responses without xraySetting", () => {
  assert.throws(
    () => parseXrayTemplateResponse(JSON.stringify({ outboundTestUrl: "" })),
    /缺少 xraySetting/,
  );
});

test("parseXrayTemplateResponse rejects an already-decoded object", () => {
  assert.throws(
    () => parseXrayTemplateResponse({ xraySetting: {} }),
    /预期为 JSON 字符串/,
  );
});
