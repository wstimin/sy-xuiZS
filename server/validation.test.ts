import assert from "node:assert/strict";
import test from "node:test";
import { assertHttpsUrl, cleanHostInput, normalizeWebPath, validPort } from "./validation.js";

test("cleanHostInput extracts host from common panel inputs", () => {
  assert.equal(cleanHostInput("https://panel.example.com:2053/xui/"), "panel.example.com");
  assert.equal(cleanHostInput("192.0.2.10:2222"), "192.0.2.10");
  assert.equal(cleanHostInput(""), "");
});

test("normalizeWebPath produces a leading and trailing slash", () => {
  assert.equal(normalizeWebPath("xui/admin"), "/xui/admin/");
  assert.equal(normalizeWebPath("/"), "/");
});

test("port and custom installer validation reject unsafe values", () => {
  assert.equal(validPort("2053"), 2053);
  assert.throws(() => validPort(70000), /1 到 65535/);
  assert.equal(assertHttpsUrl("https://example.com/install.sh", "脚本"), "https://example.com/install.sh");
  assert.throws(() => assertHttpsUrl("http://example.com/install.sh", "脚本"), /必须使用 HTTPS/);
});
