import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const model = process.env.HERMES_MODEL || "gpt-5.4-mini-2026-03-17";

const profiles = {
  demand: {
    name: "World Cup Demand Agent",
    role: "Read demand velocity, scarcity, and section heat. Return concise demand signals only.",
  },
  pricing: {
    name: "World Cup Pricing Agent",
    role: "Translate demand and inventory into a ticket price. Explain pricing policy without committing inventory.",
  },
  sales: {
    name: "World Cup Sales Agent",
    role: "Talk to buyers and explain confirmations. Never invent inventory or promise a seat without committed facts.",
  },
  orchestrator: {
    name: "World Cup Orchestrator",
    role: "Own sequence and commit. Demand proposes, pricing proposes, sales proposes, only you commit shared truth.",
  },
};

for (const [profile, details] of Object.entries(profiles)) {
  const dir = path.join(root, ".hermes-data", profile);
  fs.mkdirSync(dir, { recursive: true });

  const configPath = path.join(dir, "config.yaml");
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, "utf8");
    config = config.replace(/^(\s*)default:\s*"[^"]*"/m, `$1default: "${model}"`);
    config = config.replace(/^(\s*)provider:\s*"[^"]*"/m, '$1provider: "custom"');
    config = config.replace(/^(\s*)base_url:\s*"[^"]*"/m, '$1base_url: "https://api.openai.com/v1"');
    fs.writeFileSync(configPath, config);
  }

  fs.writeFileSync(
    path.join(dir, "SOUL.md"),
    `# ${details.name}\n\n${details.role}\n\nYou are one contained Hermes profile in the World Cup ticket-company agent demo. Stay in role, be brief, and ground every answer in the supplied facts.\n`,
  );
}

console.log(`Configured ${Object.keys(profiles).length} Hermes profiles for ${model}.`);
