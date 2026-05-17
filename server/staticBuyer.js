import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const distDir = path.join(ROOT, "dist");
const relayToken = process.env.RELAY_TOKEN || "";

const app = express();
const server = http.createServer(app);
const publicWss = new WebSocketServer({ noServer: true });
const localWss = new WebSocketServer({ noServer: true });
const pending = new Map();

let localSocket = null;
let lastState = null;

function publicRuntimeConfig() {
  return {
    API_BASE_URL: process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || "",
    WS_BASE_URL: process.env.VITE_WS_BASE_URL || process.env.WS_BASE_URL || "",
    PUBLIC_BUYER_ONLY: String(process.env.VITE_PUBLIC_BUYER_ONLY || "true").toLowerCase() === "true",
  };
}

app.get("/runtime-config.js", (_req, res) => {
  res.type("application/javascript").send(`window.__WORLD_CUP_AGENT_CONFIG__ = ${JSON.stringify(publicRuntimeConfig(), null, 2)};\n`);
});

app.use(express.json({ limit: "1mb" }));

function sendPublicState(state) {
  if (!state) return;
  const payload = JSON.stringify({ type: "state", state });
  for (const client of publicWss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function requestLocal(method, pathName, body) {
  if (!localSocket || localSocket.readyState !== localSocket.OPEN) {
    return Promise.reject(Object.assign(new Error("Local demo relay is not connected."), { statusCode: 503 }));
  }

  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error("Local demo relay timed out."), { statusCode: 504 }));
    }, 60_000);

    pending.set(id, { resolve, reject, timeout });
    localSocket.send(JSON.stringify({ id, type: "request", method, path: pathName, body }));
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, relay: true, localConnected: Boolean(localSocket && localSocket.readyState === localSocket.OPEN) });
});

app.get("/api/state", async (_req, res) => {
  try {
    const response = await requestLocal("GET", "/api/state");
    res.status(response.status || 200).json(response.body);
  } catch (error) {
    if (lastState) {
      res.json(lastState);
      return;
    }
    res.status(error.statusCode || 503).json({ error: error.message });
  }
});

app.post("/api/buy", async (req, res) => {
  try {
    const response = await requestLocal("POST", "/api/buy", req.body);
    res.status(response.status || 200).json(response.body);
  } catch (error) {
    res.status(error.statusCode || 503).json({ error: error.message });
  }
});

app.use(express.static(distDir));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next();
  });
});

publicWss.on("connection", (socket) => {
  if (lastState) socket.send(JSON.stringify({ type: "state", state: lastState }));
});

localWss.on("connection", (socket) => {
  localSocket = socket;
  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "broadcast" && message.state) {
      lastState = message.state;
      sendPublicState(lastState);
      return;
    }

    if (message.type === "response" && pending.has(message.id)) {
      const request = pending.get(message.id);
      clearTimeout(request.timeout);
      pending.delete(message.id);
      if (message.error) request.reject(Object.assign(new Error(message.error), { statusCode: message.status || 500 }));
      else request.resolve({ status: message.status, body: message.body });
    }
  });

  socket.on("close", () => {
    if (localSocket === socket) localSocket = null;
  });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/ws") {
    publicWss.handleUpgrade(req, socket, head, (ws) => publicWss.emit("connection", ws, req));
    return;
  }

  if (url.pathname === "/relay/local") {
    if (relayToken && url.searchParams.get("token") !== relayToken) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    localWss.handleUpgrade(req, socket, head, (ws) => localWss.emit("connection", ws, req));
    return;
  }

  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`World Cup buyer page serving on http://localhost:${PORT}`);
});
