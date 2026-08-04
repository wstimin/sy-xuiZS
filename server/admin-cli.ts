import "dotenv/config";
import process from "node:process";
import path from "node:path";
import { CommercialStore } from "./commercial-store.js";

function boolLabel(value: boolean) {
  return value ? "已开启" : "未开启";
}

function databasePath() {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
}

function printInfo(store: CommercialStore) {
  const administrators = store.listAdministrators();
  const email = store.getEmailSettings();
  const paymentMethods = store.getPaymentMethods(true);
  console.log(`   - 管理入口后缀: /${store.getAdminPath()}`);
  console.log(`   - 管理员账号数: ${administrators.length}`);
  if (!administrators.length) console.log("   - 管理员账号: 尚未初始化");
  for (const administrator of administrators) {
    const emailLabel = administrator.email || "未绑定邮箱";
    const loginLabel = administrator.lastLoginAt || "尚未登录";
    console.log(`   - 管理员: ${administrator.username} | ${administrator.status === "active" ? "正常" : "已禁用"} | ${emailLabel} | 最近登录 ${loginLabel}`);
  }
  console.log("   - 管理密码: 已加密保存，不支持查看明文；可在菜单中安全重置");
  console.log(`   - 用户注册: ${boolLabel(store.getSetting("registration_enabled", "true") === "true")}`);
  console.log(`   - 面板搭建: ${boolLabel(store.getSetting("panel_deploy_enabled", "true") === "true")}`);
  console.log(`   - 节点搭建: ${boolLabel(store.getSetting("node_deploy_enabled", "true") === "true")}`);
  console.log(`   - 邮件服务: ${boolLabel(email.emailEnabled)} | SMTP ${email.smtpHost ? "已配置" : "未配置"}`);
  const enabledPayments = paymentMethods.filter(item => item.enabled).map(item => item.name);
  console.log(`   - 支付渠道: ${enabledPayments.length ? enabledPayments.join("、") : "暂无启用渠道"}`);
  console.log(`   - 商业数据库: ${databasePath()}`);
}

function main() {
  const command = process.argv[2] || "info";
  const store = new CommercialStore(databasePath(), { recoverInterruptedDeployments: false });
  try {
    if (command === "info") {
      printInfo(store);
      return;
    }
    if (command === "usernames") {
      for (const administrator of store.listAdministrators()) console.log(administrator.username);
      return;
    }
    if (command === "update-admin") {
      const currentUsername = process.env.ADMIN_CURRENT_USERNAME || "";
      const nextUsername = process.env.ADMIN_NEXT_USERNAME || undefined;
      const nextPassword = process.env.ADMIN_NEXT_PASSWORD || undefined;
      if (!nextUsername && !nextPassword) throw new Error("用户名和密码均未修改");
      const user = store.updateAdministratorCredentials(currentUsername, nextUsername, nextPassword);
      console.log(`管理员账号已更新：${user.username}`);
      console.log("所有旧管理端登录会话已失效，请使用新账号重新登录。");
      return;
    }
    throw new Error(`未知运维命令：${command}`);
  } finally {
    store.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
