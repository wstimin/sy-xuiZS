import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const outputDir = path.join(root, "release", "package");
const requiredFiles = [
  ".env.example",
  "ecosystem.config.cjs",
  "install.sh",
  "package.json",
  "package-lock.json",
];

if (!fs.existsSync(path.join(root, "dist", "server.cjs"))) {
  throw new Error("dist/server.cjs is missing; run npm run build first");
}

fs.rmSync(path.join(root, "release"), { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(path.join(root, "dist"), path.join(outputDir, "dist"), { recursive: true });

for (const file of requiredFiles) {
  fs.copyFileSync(path.join(root, file), path.join(outputDir, file));
}

fs.writeFileSync(path.join(outputDir, "VERSION"), `${packageJson.version}\n`, "utf8");
console.log(`Prepared release package for v${packageJson.version} at ${outputDir}`);
