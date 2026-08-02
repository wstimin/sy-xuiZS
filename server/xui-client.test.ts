import assert from "node:assert/strict";
import test from "node:test";
import { mergeCookieHeader, parseXrayTemplateResponse } from "./xui-client.js";

test("mergeCookieHeader preserves the CSRF session and replaces updated cookies", () => {
  const cookie = mergeCookieHeader(
    "session=old; locale=zh-CN",
    ["session=new; Path=/; HttpOnly", "csrf=token; Path=/; SameSite=Strict"],
  );
  assert.equal(cookie, "session=new; locale=zh-CN; csrf=token");
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
