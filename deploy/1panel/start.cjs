const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const root = __dirname;
dotenv.config({ path: path.join(root, ".env") });

const versionFile = path.join(root, "VERSION");
const version = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, "utf8").trim()
  : "development";

process.env.NODE_ENV ||= "production";
process.env.PORT ||= "1888";
process.env.APP_VERSION ||= version;
process.env.DATABASE_PATH ||= path.join(root, "data", "app.db");

require("./dist/server.cjs");
