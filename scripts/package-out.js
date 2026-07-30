const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT_DIR, "out");
const ROOT_SERVER = path.join(ROOT_DIR, "server.js");
const ROOT_ENV_LOCAL = path.join(ROOT_DIR, ".env.local");
const ROOT_ENV_EXAMPLE = path.join(ROOT_DIR, ".env.local.example");

if (!fs.existsSync(OUT_DIR)) {
  throw new Error("The out directory does not exist. Run npm run build first.");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.copyFileSync(ROOT_SERVER, path.join(OUT_DIR, "server.js"));

const outPackageJson = {
  name: "gatepass-sys2-static-server",
  version: "0.1.0",
  private: true,
  scripts: {
    start: "node server.js"
  },
  dependencies: {
    dotenv: "^16.0.0",
    nodemailer: "^6.9.4"
  }
};
fs.writeFileSync(path.join(OUT_DIR, "package.json"), JSON.stringify(outPackageJson, null, 2) + "\n");

if (fs.existsSync(ROOT_ENV_LOCAL)) {
  fs.copyFileSync(ROOT_ENV_LOCAL, path.join(OUT_DIR, ".env"));
}

if (fs.existsSync(ROOT_ENV_EXAMPLE)) {
  fs.copyFileSync(ROOT_ENV_EXAMPLE, path.join(OUT_DIR, ".env.example"));
}

fs.writeFileSync(
  path.join(OUT_DIR, "start.sh"),
  "#!/usr/bin/env bash\ncd \"$(dirname \"$0\")\"\nnpm install\nnpm start\n"
);
fs.writeFileSync(
  path.join(OUT_DIR, "start.bat"),
  "@echo off\ncd /d %~dp0\nnpm install\nnpm start\n"
);

console.log("Packaged server entrypoint into out/");
console.log("Created out/package.json, out/start.sh, out/start.bat");
if (fs.existsSync(ROOT_ENV_LOCAL)) {
  console.log("Copied .env.local into out/.env");
} else {
  console.log("No .env.local found in root; out/.env was not created.");
}
