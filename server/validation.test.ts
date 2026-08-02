import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHttpsUrl,
  cleanHostInput,
  normalizeWebPath,
  panelPassword,
  panelUsername,
  validPort,
} from "./validation.js";

test("cleanHostInput extracts host from common panel inputs", () => {
  assert.equal(cleanHostInput("https://panel.example.com:2053/xui/"), "panel.example.com");
  assert.equal(cleanHostInput("192.0.2.10:2222"), "192.0.2.10");
  assert.equal(cleanHostInput(""), "");
});

test("normalizeWebPath produces a leading and trailing slash", () => {
  assert.equal(normalizeWebPath("xui/admin"), "/xui/admin/");
  assert.equal(normalizeWebPath("/"), "/");
});

test("panel credentials accept custom values and preserve secure generated fallbacks", () => {
  assert.equal(panelUsername("owner@example.com", "generated-user"), "owner@example.com");
  assert.equal(panelUsername("", "generated-user"), "generated-user");
  assert.equal(panelPassword("strong password", "generated-password"), "strong password");
  assert.equal(panelPassword("", "generated-password"), "generated-password");
  assert.throws(() => panelUsername("ab", "generated-user"), /3 到 64 位/);
  assert.throws(() => panelUsername("bad user", "generated-user"), /只能包含/);
  assert.throws(() => panelPassword("short", "generated-password"), /8 到 128 位/);
  assert.throws(() => panelPassword("valid-password\nnext", "generated-password"), /控制字符/);
});

test("port and custom installer validation reject unsafe values", () => {
  assert.equal(validPort("2053"), 2053);
  assert.throws(() => validPort(70000), /1 到 65535/);
  assert.equal(assertHttpsUrl("https://example.com/install.sh", "脚本"), "https://example.com/install.sh");
  assert.throws(() => assertHttpsUrl("http://example.com/install.sh", "脚本"), /必须使用 HTTPS/);
});
