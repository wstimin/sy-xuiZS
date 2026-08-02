import assert from "node:assert/strict";
import test from "node:test";
import { buildInstallCommand, shellQuote } from "./ssh.js";

test("shellQuote safely escapes single quotes", () => {
  assert.equal(shellQuote("a'b"), "'a'\"'\"'b'");
});

test("buildInstallCommand uses official noninteractive environment", () => {
  const command = buildInstallCommand({
    scriptUrl: "https://example.com/install.sh",
    username: "admin",
    password: "p@ss'word",
    panelPort: 2053,
    webBasePath: "/xui-test/",
    serverIp: "panel.example.com",
    sslMode: "domain",
    domain: "panel.example.com",
    useSudo: true,
  });

  assert.match(command, /^sudo -n env /);
  assert.match(command, /XUI_NONINTERACTIVE='1'/);
  assert.match(command, /XUI_WEB_BASE_PATH='xui-test'/);
  assert.match(command, /XUI_SSL_MODE='domain'/);
  assert.match(command, /XUI_DOMAIN='panel.example.com'/);
  assert.match(command, /curl -fLsS/);
  assert.doesNotMatch(command, /-s --/);
  assert.doesNotMatch(command, /p@ss'word/);
});

test("buildInstallCommand drives and configures the interactive recommended installer", () => {
  const command = buildInstallCommand({
    scriptUrl: "https://raw.githubusercontent.com/wstimin/mogai-3xui/main/install.sh",
    username: "admin_test",
    password: "secret'value",
    panelPort: 2053,
    webBasePath: "/xui-test/",
    serverIp: "panel.example.com",
    sslMode: "none",
    useSudo: false,
    interactiveAnswers: ["y", "2053", "2", "", ""],
    configurePanelAfterInstall: true,
  });

  assert.match(command, /wstimin\/mogai-3xui\/main\/install\.sh/);
  assert.match(command, /installer=\$\(mktemp\)/);
  assert.match(command, /printf/);
  assert.match(command, /2053/);
  assert.match(command, /\/usr\/local\/x-ui\/x-ui setting/);
  assert.match(command, /-username/);
  assert.match(command, /admin_test/);
  assert.match(command, /-webBasePath/);
  assert.match(command, /xui-test/);
  assert.doesNotMatch(command, /-s --/);
  assert.doesNotMatch(command, /secret'value/);
});
