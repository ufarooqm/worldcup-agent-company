import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const config = {
  API_BASE_URL: process.env.VITE_API_BASE_URL || "",
  WS_BASE_URL: process.env.VITE_WS_BASE_URL || "",
  PUBLIC_BUYER_ONLY: String(process.env.VITE_PUBLIC_BUYER_ONLY || "false").toLowerCase() === "true",
};

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  path.join(distDir, "runtime-config.js"),
  `window.__WORLD_CUP_AGENT_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
);
