import "dotenv/config";
import { execFile } from "node:child_process";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { DemoEngine } from "./lib/demoEngine.js";
import { HermesAgentAdapter } from "./agents/hermesAdapter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8787);
const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const engine = new DemoEngine();
const hermes = new HermesAgentAdapter({ enabled: process.env.HERMES_ENABLED !== "false" });

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(isAllowedOrigin(origin) ? 204 : 403);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

function vaultFactsFromSources(explanation) {
  if (!explanation) return [];
  const vaultRoot = path.join(ROOT, "vault", "runtime");
  return explanation.sources.map((source) => {
    const safeSource = path.normalize(source).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(vaultRoot, safeSource);
    const relativePath = path.relative(vaultRoot, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return `Vault source blocked: ${source}`;
    }
    try {
      const content = fs.readFileSync(filePath, "utf8").slice(0, 2400);
      return `Vault note ${source}:\n${content}`;
    } catch {
      return `Vault note missing: ${source}`;
    }
  });
}

function vaultFactsFromPaths(sources) {
  return vaultFactsFromSources({ sources });
}

function contextSourcesForAgent(agentId, state) {
  if (state.contextMode === "graph") {
    return ["graph/demand.md", "graph/pricing.md", "graph/confirmations.md", "graph/decisions-log.md", "graph/tickets/A-02.md"];
  }
  const siloSources = {
    demand: ["silos/demand/demand-feed.md"],
    pricing: ["silos/pricing/pricing-rules.md"],
    sales: ["silos/sales/customers.md", "silos/sales/confirmations.md"],
    orchestrator: ["graph/decisions-log.md"],
  };
  return siloSources[agentId] || siloSources.sales;
}

function roleForAgent(agentId) {
  return {
    demand: "Demand agent",
    pricing: "Pricing agent",
    sales: "Sales agent",
    orchestrator: "Orchestrator",
  }[agentId] || "Sales agent";
}

function broadcast() {
  const payload = JSON.stringify({ type: "state", state: engine.getState() });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

wss.on("connection", (socket, req) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    socket.close(1008, "Origin not allowed");
    return;
  }
  socket.send(JSON.stringify({ type: "state", state: engine.getState() }));
});

app.get("/api/state", (_req, res) => {
  res.json(engine.getState());
});

app.post("/api/buy", async (req, res) => {
  const result = engine.buyTicket({
    buyerName: String(req.body?.buyerName || "").trim() || undefined,
    buyerId: String(req.body?.buyerId || "").trim() || undefined,
  });
  let orchestratorText = null;
  if (engine.getState().orchestratorEnabled) {
    orchestratorText = await hermes.reason({
      agentId: "orchestrator",
      role: "Orchestrator",
      task: `Review committed purchase ${result.id} before Sales replies.`,
      facts: [`status=${result.status}`, `seat=${result.seat}`, `price=${result.price}`, result.note],
    });
    engine.recordAgentText("orchestrator", orchestratorText.text);
  }
  const agentText = await hermes.reason({
    agentId: "sales",
    role: "Sales agent",
    task: `Explain confirmation ${result.id} to ${result.buyerName}.`,
    facts: [`status=${result.status}`, `seat=${result.seat}`, `price=${result.price}`, result.note],
  });
  engine.recordAgentText("sales", agentText.text);
  broadcast();
  res.json({ ...result, agentText, orchestratorText });
});

app.post("/api/explain-price", async (_req, res) => {
  engine.explainPrice();
  const state = engine.getState();
  const explanation = state.explanation;
  broadcast();
  const facts = explanation ? [explanation.answer, ...vaultFactsFromSources(explanation)] : [];
  const agentCalls =
    state.contextMode === "graph"
      ? [
          hermes.reason({ agentId: "demand", role: "Demand agent", task: "Explain demand signal for the ticket price.", facts }),
          hermes.reason({ agentId: "pricing", role: "Pricing agent", task: "Explain pricing policy for the ticket price.", facts }),
          hermes.reason({ agentId: "sales", role: "Sales agent", task: "Answer why the World Cup ticket price is what it is.", facts }),
        ]
      : [hermes.reason({ agentId: "sales", role: "Sales agent", task: "Answer why the World Cup ticket price is what it is.", facts })];
  const agentTexts = await Promise.all(agentCalls);
  for (const text of agentTexts) engine.recordAgentText(text.agentId, text.text);
  broadcast();
  res.json({ explanation, agentTexts });
});

app.post("/api/ask-agent", async (req, res) => {
  const state = engine.getState();
  const agentId = String(req.body?.agentId || "sales").trim();
  const question = String(req.body?.question || "").trim();
  const agent = state.agents[agentId] || state.agents.sales;
  const sources = contextSourcesForAgent(agent.id, state);
  const facts = [
    `Current mode: memory=${state.contextMode}, control=${state.orchestratorEnabled ? "orchestrated" : "direct commits"}.`,
    `Selected agent visible context: ${agent.visibleContext.join("; ")}`,
    ...vaultFactsFromPaths(sources),
  ];
  const agentText = await hermes.reason({
    agentId: agent.id,
    role: roleForAgent(agent.id),
    task: question || "Explain what you can currently see and what decision you would make.",
    facts,
  });
  engine.recordAgentText(agentText.agentId, agentText.text);
  broadcast();
  res.json({ agentText, sources, state: engine.getState() });
});

app.post("/api/admin/reset", (_req, res) => {
  const state = engine.reset();
  broadcast();
  res.json(state);
});

app.post("/api/admin/hard-reset", async (_req, res) => {
  try {
    const state = engine.reset();
    await execFileAsync("npm", ["run", "hermes:hard-reset"], {
      cwd: ROOT,
      timeout: 180_000,
      maxBuffer: 1024 * 1024,
    });
    broadcast();
    res.json(state);
  } catch (error) {
    res.status(500).json({
      error: "Hermes hard reset failed",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/admin/context", (req, res) => {
  const state = engine.setContextMode(req.body?.mode);
  broadcast();
  res.json(state);
});

app.post("/api/admin/orchestrator", async (req, res) => {
  const state = engine.setOrchestrator(Boolean(req.body?.enabled));
  broadcast();
  if (state.orchestratorEnabled) {
    const agentText = await hermes.reason({
      agentId: "orchestrator",
      role: "Orchestrator",
      task: "State the active sequencing rule for this ticket company.",
      facts: ["Demand proposes.", "Pricing proposes.", "Sales proposes.", "Only orchestrator commits inventory and confirmation."],
    });
    engine.recordAgentText("orchestrator", agentText.text);
    broadcast();
  }
  res.json(engine.getState());
});

app.post("/api/admin/rush", (req, res) => {
  const state = engine.setRush(Boolean(req.body?.open));
  broadcast();
  res.json(state);
});

app.post("/api/admin/simulate", (req, res) => {
  const count = Math.max(1, Math.min(500, Number(req.body?.count || 100)));
  const result = engine.simulate(count);
  broadcast();
  res.json(result.state);
});

app.post("/api/admin/stage", (req, res) => {
  const state = engine.setStage(Number(req.body?.index || 0));
  broadcast();
  res.json(state);
});

app.post("/api/admin/stage/next", (_req, res) => {
  const state = engine.nextStage();
  broadcast();
  res.json(state);
});

app.post("/api/admin/stage/previous", (_req, res) => {
  const state = engine.previousStage();
  broadcast();
  res.json(state);
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    hermesModel: process.env.HERMES_MODEL || "gpt-5.4-mini-2026-03-17",
    hermesGatewayModel: process.env.HERMES_GATEWAY_MODEL || "hermes-agent",
    hermesGateways: {
      demand: process.env.HERMES_DEMAND_GATEWAY_URL || process.env.HERMES_GATEWAY_URL || null,
      pricing: process.env.HERMES_PRICING_GATEWAY_URL || process.env.HERMES_GATEWAY_URL || null,
      sales: process.env.HERMES_SALES_GATEWAY_URL || process.env.HERMES_GATEWAY_URL || null,
      orchestrator: process.env.HERMES_ORCHESTRATOR_GATEWAY_URL || process.env.HERMES_GATEWAY_URL || null,
    },
    hermesProvider: process.env.HERMES_GATEWAY_URL ? "docker-gateway-per-agent" : "local-fallback",
  });
});

const distDir = path.join(ROOT, "dist");
app.use(express.static(distDir));
app.get(/.*/, (_req, res, next) => {
  const indexPath = path.join(distDir, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

server.listen(PORT, () => {
  console.log(`World Cup agent company running on http://localhost:${PORT}`);
});
