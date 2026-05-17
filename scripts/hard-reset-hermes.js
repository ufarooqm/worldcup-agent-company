import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const composeArgs = ["compose", "-f", "docker-compose.hermes.yml", "--env-file", ".env"];
const containers = [
  "worldcup-hermes-demand",
  "worldcup-hermes-pricing",
  "worldcup-hermes-sales",
  "worldcup-hermes-orchestrator",
];
const profiles = ["demand", "pricing", "sales", "orchestrator"];

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function waitForConfigs() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = profiles.every((profile) => fs.existsSync(path.join(".hermes-data", profile, "config.yaml")));
    if (ready) return;
    execFileSync("sleep", ["1"]);
  }
  throw new Error("Timed out waiting for Hermes profile config files.");
}

try {
  run("docker", [...composeArgs, "stop"]);
} catch {
  // Containers may not exist yet.
}

fs.rmSync(".hermes-data", { recursive: true, force: true });
if (!fs.existsSync(path.join("vault", "runtime"))) {
  copyDir("vault_template", path.join("vault", "runtime"));
}

for (const profile of profiles) {
  copyDir(path.join("vault", "runtime"), path.join(".hermes-data", profile, "workspace"));
}

run("docker", [...composeArgs, "up", "-d", "--force-recreate"]);
waitForConfigs();
run("node", ["scripts/configure-hermes-profiles.js"]);
for (const profile of profiles) {
  fs.rmSync(path.join(".hermes-data", profile, "workspace"), { recursive: true, force: true });
  copyDir(path.join("vault", "runtime"), path.join(".hermes-data", profile, "workspace"));
}
run("docker", ["restart", ...containers]);

console.log("Hermes agent memory hard reset complete.");
