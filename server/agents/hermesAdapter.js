import "dotenv/config";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const DEFAULT_MODEL = process.env.HERMES_MODEL || "gpt-5.4-mini-2026-03-17";
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VAULT_RUNTIME = path.join(ROOT, "vault", "runtime");
const HERMES_DATA = path.join(ROOT, ".hermes-data");

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.HERMES_OPENAI_API_KEY);
}

function gatewayUrlForAgent(agentId) {
  const urls = {
    demand: process.env.HERMES_DEMAND_GATEWAY_URL,
    pricing: process.env.HERMES_PRICING_GATEWAY_URL,
    sales: process.env.HERMES_SALES_GATEWAY_URL,
    orchestrator: process.env.HERMES_ORCHESTRATOR_GATEWAY_URL,
  };
  return urls[agentId] || process.env.HERMES_GATEWAY_URL;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function syncVaultWorkspace(agentId) {
  const workspace = path.join(HERMES_DATA, agentId, "workspace");
  if (!fs.existsSync(path.dirname(workspace))) return;
  fs.rmSync(workspace, { recursive: true, force: true });
  copyDir(VAULT_RUNTIME, workspace);
}

export class HermesAgentAdapter {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.model = DEFAULT_MODEL;
  }

  async reason({ agentId, role, task, facts = [] }) {
    if (gatewayUrlForAgent(agentId)) {
      const gatewayResult = await this.reasonWithHermesGateway({ agentId, role, task, facts });
      if (gatewayResult) return gatewayResult;
    }

    if (process.env.HERMES_USE_CLI === "true") {
      const cliResult = await this.reasonWithHermesCli({ agentId, role, task, facts });
      if (cliResult) return cliResult;
    }

    if (!this.enabled || !hasOpenAIKey()) {
      return {
        provider: "hermes-simulated",
        model: this.model,
        agentId,
        text: this.localReasoning({ role, task, facts }),
      };
    }

    const key = process.env.HERMES_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content:
              "You are a Hermes-backed specialist agent in an agent orchestration demo. Be concise, operational, and grounded in the supplied facts. Never invent inventory.",
          },
          {
            role: "user",
            content: `Agent: ${agentId}\nRole: ${role}\nTask: ${task}\nFacts:\n${facts.map((fact) => `- ${fact}`).join("\n")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        provider: "hermes-fallback",
        model: this.model,
        agentId,
        text: this.localReasoning({ role, task, facts }),
      };
    }

    const json = await response.json();
    const text =
      json.output_text ||
      json.output?.flatMap((item) => item.content || [])?.map((item) => item.text || "").join(" ").trim() ||
      this.localReasoning({ role, task, facts });

    return {
      provider: "hermes-openai",
      model: this.model,
      agentId,
      text,
    };
  }

  async reasonWithHermesGateway({ agentId, role, task, facts }) {
    const baseUrl = gatewayUrlForAgent(agentId)?.replace(/\/$/, "");
    if (!baseUrl) return null;
    syncVaultWorkspace(agentId);
    const key = process.env.HERMES_API_SERVER_KEY || process.env.OPENAI_API_KEY || "demo-local-key";
    const gatewayModel = process.env.HERMES_GATEWAY_MODEL || "hermes-agent";
    const messages = [
      {
        role: "system",
        content:
          "You are a real Hermes specialist agent behind an agent-company demo. Be concise, operational, and grounded in the supplied facts. The relevant vault notes are pasted into the prompt; use those excerpts first and do not invent inventory.",
      },
      {
        role: "user",
        content: `Agent: ${agentId}\nRole: ${role}\nTask: ${task}\nFacts:\n${facts.map((fact) => `- ${fact}`).join("\n")}`,
      },
    ];

    try {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: gatewayModel,
          messages,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!response.ok) return null;
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return null;

      return {
        provider: `hermes-docker-${agentId}`,
        model: `${gatewayModel} (${this.model})`,
        agentId,
        gatewayUrl: baseUrl,
        text,
      };
    } catch {
      return null;
    }
  }

  async reasonWithHermesCli({ agentId, role, task, facts }) {
    const command = process.env.HERMES_COMMAND || "hermes";
    const prompt = [
      "You are a Hermes specialist agent in an agent orchestration demo.",
      `Agent: ${agentId}`,
      `Role: ${role}`,
      `Task: ${task}`,
      "Facts:",
      ...facts.map((fact) => `- ${fact}`),
      "Answer in 1-2 concise operational sentences.",
    ].join("\n");

    try {
      const { stdout } = await execFileAsync(command, ["chat", "--query", prompt], {
        timeout: 25_000,
        maxBuffer: 1024 * 1024,
      });
      const text = stdout.trim();
      if (!text) return null;
      return {
        provider: "hermes-cli",
        model: "hermes",
        agentId,
        text,
      };
    } catch {
      return null;
    }
  }

  localReasoning({ role, task, facts }) {
    const factLine = facts.length ? facts.slice(0, 3).join(" | ") : "No live facts were provided.";
    return `${role} handled: ${task}. Grounding: ${factLine}`;
  }
}
