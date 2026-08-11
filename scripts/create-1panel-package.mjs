import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outputDir = path.join(root, "release", "1panel", "package");
const templateDir = path.join(root, "deploy", "1panel");

if (!fs.existsSync(path.join(root, "dist", "server.cjs"))) {
  throw new Error("dist/server.cjs is missing; run npm run build first");
}

fs.rmSync(path.join(root, "release", "1panel"), { recursive: true, force: true });
fs.mkdirSync(path.join(outputDir, "data"), { recursive: true });
fs.cpSync(path.join(root, "dist"), path.join(outputDir, "dist"), { recursive: true });

const runtimePackageJson = {
  name: packageJson.name,
  private: true,
  version: packageJson.version,
  description: packageJson.description,
  type: packageJson.type,
  engines: packageJson.engines,
  scripts: {
    start: "node start.cjs",
  },
  dependencies: packageJson.dependencies,
  devDependencies: packageJson.devDependencies,
};

fs.writeFileSync(
  path.join(outputDir, "package.json"),
  `${JSON.stringify(runtimePackageJson, null, 2)}\n`,
  "utf8",
);
fs.copyFileSync(path.join(root, "package-lock.json"), path.join(outputDir, "package-lock.json"));
fs.copyFileSync(path.join(templateDir, "start.cjs"), path.join(outputDir, "start.cjs"));
fs.copyFileSync(path.join(templateDir, ".npmrc"), path.join(outputDir, ".npmrc"));
fs.copyFileSync(path.join(templateDir, ".env.example"), path.join(outputDir, ".env.example"));
fs.copyFileSync(path.join(root, "1PANEL部署说明.md"), path.join(outputDir, "1PANEL部署说明.md"));
fs.writeFileSync(path.join(outputDir, "VERSION"), `${packageJson.version}\n`, "utf8");
fs.writeFileSync(
  path.join(outputDir, "data", "请勿删除此目录.txt"),
  "用户、套餐、订单、搭建记录和系统配置保存在此目录。更新、迁移和备份时必须完整保留。\n",
  "utf8",
);

console.log(`Prepared 1Panel website package for v${packageJson.version} at ${outputDir}`);
