import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const VAULT_TEMPLATE = path.join(ROOT, "vault_template");
const VAULT_RUNTIME = path.join(ROOT, "vault", "runtime");

const SECTIONS = [
  { id: "A", name: "North Stand", basePrice: 420, capacity: 12 },
  { id: "B", name: "East Stand", basePrice: 360, capacity: 12 },
  { id: "C", name: "Upper Bowl", basePrice: 240, capacity: 12 },
];

const AGENTS = {
  demand: {
    name: "Demand Agent",
    role: "Reads buyer velocity, scarcity, and section heat.",
    hermesProfile: "hermes:demand-analyst",
    runtime: "Hermes Agent",
  },
  pricing: {
    name: "Pricing Agent",
    role: "Sets the live price from demand, inventory, and pricing rules.",
    hermesProfile: "hermes:pricing-strategist",
    runtime: "Hermes Agent",
  },
  sales: {
    name: "Sales Agent",
    role: "Talks to the buyer and prepares a confirmation card.",
    hermesProfile: "hermes:sales-closer",
    runtime: "Hermes Agent",
  },
  orchestrator: {
    name: "Orchestrator",
    role: "Owns sequence and commit: demand -> price -> reserve -> confirm.",
    hermesProfile: "hermes:company-orchestrator",
    runtime: "Hermes Agent",
  },
};

const DEMO_STAGES = [
  {
    id: "reset",
    title: "1. Company starts siloed",
    narration: "Three Hermes specialists exist, but each department has its own memory.",
    click: "Reset. Keep Silos on and Orchestrator off.",
    watch: "Agent cards say each specialist can only see its own department folder.",
    lesson: "This is a company with smart people and bad memory architecture.",
  },
  {
    id: "silo-question",
    title: "2. Ask Sales why the price changed",
    narration: "Sales is smart, but its context is boxed into Sales notes. It cannot see demand or pricing policy.",
    click: "Ask Sales the suggested question: Why is this price changing?",
    watch: "Sales gives a shallow answer and the source list only shows Sales notes.",
    lesson: "The model is not the bottleneck. The harness gave the agent the wrong memory.",
  },
  {
    id: "graph-question",
    title: "3. Switch silos into a shared graph",
    narration: "The same Hermes Sales Agent can now reason across demand, pricing, inventory, and decisions.",
    click: "Turn Graph on, then ask the same price question.",
    watch: "Sales now cites demand, pricing, tickets, and decisions from the vault.",
    lesson: "Context management means structuring memory so the agent can retrieve the right connected facts.",
  },
  {
    id: "chaos-rush",
    title: "4. Start live buying without an orchestrator",
    narration: "Smart agents with shared memory still collide because nobody owns sequence and commit.",
    click: "Start live buying and run the 120-buyer load test.",
    watch: "Double-sold seats, oversold inventory, and price conflicts turn red.",
    lesson: "Graph memory made agents smarter, but smart agents are still not coordinated.",
  },
  {
    id: "orchestrated-rush",
    title: "5. Turn on the orchestrator",
    narration: "Agents propose. The Hermes Orchestrator sequences and commits. The same load stays clean.",
    click: "Turn Orchestrator on and rerun the same rush.",
    watch: "Confirmed stops at 36, the rest waitlist, and red counters stay at zero.",
    lesson: "Orchestration makes the system deterministic: one owner of sequence and commit.",
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function writeNote(relativePath, body) {
  const filePath = path.join(VAULT_RUNTIME, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, body);
}

function appendNote(relativePath, body) {
  const filePath = path.join(VAULT_RUNTIME, relativePath);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, body);
}

function makeTickets() {
  const tickets = [];
  for (const section of SECTIONS) {
    for (let i = 1; i <= section.capacity; i += 1) {
      tickets.push({
        id: `${section.id}-${String(i).padStart(2, "0")}`,
        section: section.id,
        sectionName: section.name,
        seat: `${section.id}${i}`,
        owner: null,
        price: section.basePrice,
        status: "available",
        confirmations: [],
      });
    }
  }
  return tickets;
}

function baseState() {
  return {
    contextMode: "silo",
    orchestratorEnabled: false,
    rushOpen: true,
    stageIndex: 0,
    stage: DEMO_STAGES[0],
    stages: DEMO_STAGES,
    runId: 1,
    tick: 0,
    agents: Object.fromEntries(
      Object.entries(AGENTS).map(([id, agent]) => [
        id,
        {
          id,
          ...agent,
          status: id === "orchestrator" ? "off" : "idle",
          visibleContext:
            id === "orchestrator"
              ? ["No commit authority yet."]
              : ["Own department folder only."],
          lastDecision: "Waiting for demo input.",
          recent: [],
        },
      ]),
    ),
    sections: SECTIONS,
    tickets: makeTickets(),
    buyers: [],
    confirmations: [],
    events: [],
    metrics: {
      buyers: 0,
      confirmed: 0,
      waitlisted: 0,
      oversold: 0,
      doubleSoldSeats: 0,
      priceConflicts: 0,
      graphAnswers: 0,
      siloMisses: 0,
    },
    demand: {
      level: "low",
      activeBuyers: 0,
      velocity: 0,
      note: "Low demand. Demo is waiting.",
    },
    pricing: {
      currentPrice: 360,
      floor: 220,
      ceiling: 920,
      note: "Base public price.",
    },
    explanation: null,
  };
}

export class DemoEngine {
  constructor() {
    this.state = baseState();
    this.reset();
  }

  reset() {
    this.state = baseState();
    if (fs.existsSync(VAULT_RUNTIME)) {
      fs.rmSync(VAULT_RUNTIME, { recursive: true, force: true });
    }
    copyDir(VAULT_TEMPLATE, VAULT_RUNTIME);
    this.writeVaultSnapshot("Demo reset.");
    this.event("system", "Demo reset to silo mode with orchestrator off.");
    return this.getState();
  }

  setStage(index) {
    const safeIndex = Math.max(0, Math.min(DEMO_STAGES.length - 1, Number(index) || 0));
    this.reset();
    this.state.stageIndex = safeIndex;
    this.state.stage = DEMO_STAGES[safeIndex];

    if (safeIndex === 1) {
      this.explainPrice();
    } else if (safeIndex === 2) {
      this.setContextMode("graph");
      this.explainPrice();
    } else if (safeIndex === 3) {
      this.setContextMode("graph");
      this.setRush(true);
      this.simulate(120);
    } else if (safeIndex === 4) {
      this.setContextMode("graph");
      this.setOrchestrator(true);
      this.setRush(true);
      this.simulate(120);
    }

    this.state.stageIndex = safeIndex;
    this.state.stage = DEMO_STAGES[safeIndex];
    this.event("stage", `Stage loaded: ${DEMO_STAGES[safeIndex].title}`);
    return this.getState();
  }

  nextStage() {
    return this.setStage(this.state.stageIndex + 1);
  }

  previousStage() {
    return this.setStage(this.state.stageIndex - 1);
  }

  getState() {
    return JSON.parse(JSON.stringify({ ...this.state, vaultPath: VAULT_RUNTIME }));
  }

  recordAgentText(agentId, text) {
    const agent = this.state.agents[agentId];
    if (!agent || !text) return this.getState();
    agent.status = agentId === "orchestrator" && this.state.orchestratorEnabled ? "active" : "working";
    agent.lastDecision = text;
    agent.recent.unshift(text);
    agent.recent = agent.recent.slice(0, 5);
    this.event("hermes", `${agent.name} responded through its own Hermes container.`);
    return this.getState();
  }

  setContextMode(mode) {
    this.state.contextMode = mode === "graph" ? "graph" : "silo";
    for (const [id, agent] of Object.entries(this.state.agents)) {
      if (id === "orchestrator") continue;
      agent.visibleContext =
        this.state.contextMode === "graph"
          ? ["Full company graph.", "Tickets.", "Demand.", "Pricing.", "Buyer history.", "Decision log."]
          : [`${agent.name.replace(" Agent", "")} silo only.`];
      agent.lastDecision =
        this.state.contextMode === "graph"
          ? "Can traverse linked company memory."
          : "Can only reason from its local department notes.";
    }
    this.writeVaultSnapshot(`Context mode changed to ${this.state.contextMode}.`);
    this.event("context", this.state.contextMode === "graph" ? "Connected departmental silos into one graph." : "Split memory back into departmental silos.");
    return this.getState();
  }

  setOrchestrator(enabled) {
    this.state.orchestratorEnabled = Boolean(enabled);
    const orchestrator = this.state.agents.orchestrator;
    orchestrator.status = enabled ? "active" : "off";
    orchestrator.visibleContext = enabled
      ? ["Full graph.", "Commit authority.", "Sequencing rules.", "Atomic reservation ledger."]
      : ["No commit authority yet."];
    orchestrator.lastDecision = enabled
      ? "Agents propose; orchestrator sequences and commits."
      : "Specialists commit directly, so decisions can collide.";
    this.event("orchestrator", enabled ? "Orchestrator activated: demand -> price -> reserve -> confirm." : "Orchestrator disabled.");
    this.writeVaultSnapshot(`Orchestrator ${enabled ? "enabled" : "disabled"}.`);
    return this.getState();
  }

  setRush(open) {
    this.state.rushOpen = Boolean(open);
    this.event("system", open ? "Audience rush opened." : "Audience rush closed.");
    return this.getState();
  }

  explainPrice() {
    if (this.state.contextMode === "silo") {
      this.state.metrics.siloMisses += 1;
      this.state.explanation = {
        mode: "silo",
        title: "Sales can answer, but only shallowly.",
        answer:
          "I can see the buyer request and my sales notes, but I cannot see live demand, inventory pressure, or pricing policy. I can quote the listed price, not explain it.",
        sources: ["silos/sales/customers.md", "silos/sales/confirmations.md"],
      };
      this.state.agents.sales.lastDecision = "Could not explain price because demand and pricing notes are outside its silo.";
      this.state.agents.sales.status = "blocked";
      this.event("context", "Silo miss: Sales could not traverse demand + pricing context.");
      return this.getState();
    }

    this.state.metrics.graphAnswers += 1;
    this.state.explanation = {
      mode: "graph",
      title: "Sales can reason across the company graph.",
      answer:
        "The price is rising because active buyer velocity is above available lower-bowl supply. Upper Bowl remains cheaper because its section has more available inventory and lower demand heat.",
      sources: ["graph/demand.md", "graph/pricing.md", "graph/tickets/C-01.md", "graph/decisions-log.md"],
    };
    this.state.agents.sales.lastDecision = "Explained price from linked demand, pricing, and inventory notes.";
    this.state.agents.sales.status = "working";
    this.event("context", "Graph answer: Sales traversed demand, pricing, and tickets.");
    return this.getState();
  }

  simulate(count = 60) {
    const results = [];
    const startIndex = this.state.buyers.length;
    for (let i = 0; i < count; i += 1) {
      const buyerNumber = startIndex + i + 1;
      results.push(this.buyTicket({ buyerName: `Load buyer ${buyerNumber}`, simulated: true }, false));
    }
    this.recomputeMetrics();
    if (this.state.orchestratorEnabled) {
      this.event(
        "sale",
        `Load test batch: ${count} buyer requests went through the orchestrator. Seats stay unique; overflow buyers waitlist.`,
      );
    } else {
      this.event(
        "collision",
        `Load test batch: ${count} buyer requests wrote directly. No single owner checked inventory before Sales promised seats.`,
      );
    }
    this.writeVaultSnapshot(`Simulated ${count} buyers.`);
    return { state: this.getState(), results };
  }

  buyTicket(input = {}, emitSnapshot = true) {
    this.state.tick += 1;
    const buyer = {
      id: input.buyerId || `buyer-${this.state.runId}-${this.state.buyers.length + 1}`,
      name: input.buyerName || `Guest ${this.state.buyers.length + 1}`,
      simulated: Boolean(input.simulated),
      createdAt: new Date().toISOString(),
    };
    this.state.buyers.push(buyer);
    this.updateDemand();

    const confirmation = this.state.orchestratorEnabled
      ? this.orchestratedPurchase(buyer)
      : this.unorchestratedPurchase(buyer);

    this.state.confirmations.push(confirmation);
    this.recomputeMetrics();
    if (emitSnapshot) this.writeVaultSnapshot(`Buyer ${buyer.name} requested a ticket.`);
    return confirmation;
  }

  updateDemand() {
    const active = this.state.buyers.length;
    const remaining = this.state.tickets.filter((ticket) => ticket.status === "available").length;
    const pressure = active / Math.max(remaining, 1);
    const level = pressure > 3 ? "extreme" : pressure > 1.4 ? "high" : pressure > 0.6 ? "rising" : "low";
    this.state.demand = {
      level,
      activeBuyers: active,
      velocity: Math.round(pressure * 100) / 100,
      note: `${active} buyer requests against ${remaining} visibly available tickets.`,
    };
    this.state.agents.demand.status = "working";
    this.state.agents.demand.lastDecision = `Demand is ${level}; velocity ${this.state.demand.velocity}.`;
    this.state.agents.demand.recent.unshift(`Read ${active} buyers / ${remaining} available.`);
    this.state.agents.demand.recent = this.state.agents.demand.recent.slice(0, 5);
  }

  computePrice(sectionId = "B") {
    const section = SECTIONS.find((item) => item.id === sectionId) || SECTIONS[1];
    const multipliers = { low: 1, rising: 1.18, high: 1.52, extreme: 1.92 };
    const price = Math.min(this.state.pricing.ceiling, Math.round(section.basePrice * multipliers[this.state.demand.level]));
    this.state.pricing.currentPrice = price;
    this.state.pricing.note = `${section.name} priced at ${price} while demand is ${this.state.demand.level}.`;
    this.state.agents.pricing.status = "working";
    this.state.agents.pricing.lastDecision = `Set ${section.name} at $${price}.`;
    this.state.agents.pricing.recent.unshift(`Demand ${this.state.demand.level} -> $${price}.`);
    this.state.agents.pricing.recent = this.state.agents.pricing.recent.slice(0, 5);
    return price;
  }

  orchestratedPurchase(buyer) {
    this.state.agents.orchestrator.status = "active";
    this.state.agents.orchestrator.lastDecision = `Sequencing purchase for ${buyer.name}.`;
    const ticket = this.state.tickets.find((item) => item.status === "available");
    if (!ticket) {
      if (!buyer.simulated) this.event("sale", `${buyer.name} waitlisted. No tickets remain.`);
      return this.confirmationCard(buyer, null, this.state.pricing.currentPrice, "waitlisted", "No ticket remained when orchestrator committed.");
    }

    const price = this.computePrice(ticket.section);
    ticket.owner = buyer.id;
    ticket.price = price;
    ticket.status = "reserved";
    const confirmation = this.confirmationCard(buyer, ticket, price, "confirmed", "Reserved by orchestrator before Sales promised.");
    ticket.confirmations.push(confirmation.id);
    ticket.status = "confirmed";
    this.state.agents.sales.status = "working";
    this.state.agents.sales.lastDecision = `Confirmed ${ticket.seat} at $${price} after orchestrator commit.`;
    this.state.agents.orchestrator.recent.unshift(`Committed ${ticket.seat} for ${buyer.name}.`);
    this.state.agents.orchestrator.recent = this.state.agents.orchestrator.recent.slice(0, 5);
    if (!buyer.simulated) this.event("sale", `${buyer.name} confirmed ${ticket.seat} at $${price}. Orchestrator reserved the seat before Sales promised it.`);
    return confirmation;
  }

  unorchestratedPurchase(buyer) {
    const availableAtRead = this.state.tickets.filter((item) => item.status === "available");
    const ticket = availableAtRead[this.state.tick % Math.max(availableAtRead.length, 1)] || this.state.tickets[this.state.tick % this.state.tickets.length];
    const staleDemand = this.state.tick % 3 === 0 ? "low" : this.state.demand.level;
    const price = this.computeStalePrice(ticket?.section || "B", staleDemand);

    if (ticket) {
      ticket.status = "confirmed";
      ticket.owner = ticket.owner || buyer.id;
      ticket.price = ticket.price || price;
      const confirmation = this.confirmationCard(buyer, ticket, price, "confirmed", "Specialist committed directly without sequence owner.");
      ticket.confirmations.push(confirmation.id);
      this.state.agents.sales.status = "working";
      this.state.agents.sales.lastDecision = `Promised ${ticket.seat} at $${price} from a direct specialist write.`;
      if (!buyer.simulated) {
        this.event("collision", `${buyer.name} was promised ${ticket.seat} at $${price} through direct commit. If that seat turns red, it was promised to more than one buyer.`);
      }
      return confirmation;
    }

    return this.confirmationCard(buyer, null, price, "waitlisted", "No ticket found.");
  }

  computeStalePrice(sectionId, demandLevel) {
    const section = SECTIONS.find((item) => item.id === sectionId) || SECTIONS[1];
    const multipliers = { low: 1, rising: 1.16, high: 1.48, extreme: 1.86 };
    const price = Math.min(this.state.pricing.ceiling, Math.round(section.basePrice * multipliers[demandLevel]));
    this.state.agents.pricing.status = "working";
    this.state.agents.pricing.lastDecision = `Direct pricing used ${demandLevel} demand -> $${price}.`;
    return price;
  }

  confirmationCard(buyer, ticket, price, status, note) {
    return {
      id: `WC-${this.state.runId}-${String(this.state.confirmations.length + 1).padStart(4, "0")}`,
      buyerId: buyer.id,
      buyerName: buyer.name,
      status,
      section: ticket?.sectionName || "Waitlist",
      seat: ticket?.seat || "Pending",
      ticketId: ticket?.id || null,
      price,
      note,
      createdAt: new Date().toISOString(),
      agent: "Hermes Sales Agent",
    };
  }

  recomputeMetrics() {
    const confirmed = this.state.confirmations.filter((item) => item.status === "confirmed");
    const waitlisted = this.state.confirmations.filter((item) => item.status === "waitlisted");
    const bySeat = new Map();
    for (const conf of confirmed) {
      if (!conf.ticketId) continue;
      bySeat.set(conf.ticketId, (bySeat.get(conf.ticketId) || 0) + 1);
    }
    const doubleSoldSeats = [...bySeat.values()].filter((count) => count > 1).length;
    const oversold = Math.max(0, confirmed.length - this.state.tickets.length);
    const priceConflicts = this.countPriceConflicts(confirmed);
    this.state.metrics = {
      ...this.state.metrics,
      buyers: this.state.buyers.length,
      confirmed: confirmed.length,
      waitlisted: waitlisted.length,
      oversold,
      doubleSoldSeats,
      priceConflicts,
    };
  }

  countPriceConflicts(confirmed) {
    const pricesByTicket = new Map();
    for (const conf of confirmed) {
      if (!conf.ticketId) continue;
      const prices = pricesByTicket.get(conf.ticketId) || new Set();
      prices.add(conf.price);
      pricesByTicket.set(conf.ticketId, prices);
    }
    return [...pricesByTicket.values()].filter((prices) => prices.size > 1).length;
  }

  event(type, message) {
    const evt = {
      id: `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      message,
      createdAt: new Date().toISOString(),
    };
    this.state.events.unshift(evt);
    this.state.events = this.state.events.slice(0, 80);
    appendNote("graph/decisions-log.md", `\n- ${evt.createdAt} — ${type}: ${message}`);
  }

  writeVaultSnapshot(reason) {
    ensureDir(VAULT_RUNTIME);
    writeNote(
      "graph/demand.md",
      `---\ntype: live_fact\nagent: demand\n---\n# Demand\n\nLevel: ${this.state.demand.level}\n\nActive buyers: ${this.state.demand.activeBuyers}\n\nVelocity: ${this.state.demand.velocity}\n\nNote: ${this.state.demand.note}\n\nLinks: [[pricing]] [[confirmations]]\n`,
    );
    writeNote(
      "graph/pricing.md",
      `---\ntype: live_fact\nagent: pricing\n---\n# Pricing\n\nCurrent price: ${this.state.pricing.currentPrice}\n\nFloor: ${this.state.pricing.floor}\n\nCeiling: ${this.state.pricing.ceiling}\n\nNote: ${this.state.pricing.note}\n\nLinks: [[demand]] [[tickets]] [[decisions-log]]\n`,
    );
    writeNote(
      "graph/confirmations.md",
      `---\ntype: ledger\n---\n# Confirmations\n\n${this.state.confirmations
        .slice(-40)
        .map((item) => `- [[confirmations/${item.id}|${item.id}]]: [[buyers/${item.buyerId}|${item.buyerName}]] — ${item.status} — ${item.seat} — $${item.price}`)
        .join("\n")}\n`,
    );
    for (const buyer of this.state.buyers) {
      const buyerConfirmations = this.state.confirmations.filter((item) => item.buyerId === buyer.id);
      writeNote(
        `graph/buyers/${buyer.id}.md`,
        `---\ntype: buyer\nid: ${buyer.id}\nname: ${buyer.name}\nsimulated: ${buyer.simulated}\ncreatedAt: ${buyer.createdAt}\n---\n# ${buyer.name}\n\nBuyer id: ${buyer.id}\n\nCreated: ${buyer.createdAt}\n\nConfirmations:\n${buyerConfirmations
          .map((item) => `- [[confirmations/${item.id}|${item.id}]] — ${item.status} — ${item.seat} — $${item.price}`)
          .join("\n") || "- none"}\n\nLinks: [[confirmations]] [[demand]]\n`,
      );
    }
    for (const confirmation of this.state.confirmations) {
      writeNote(
        `graph/confirmations/${confirmation.id}.md`,
        `---\ntype: confirmation\nid: ${confirmation.id}\nbuyer: ${confirmation.buyerName}\nstatus: ${confirmation.status}\nseat: ${confirmation.seat}\nprice: ${confirmation.price}\n---\n# Confirmation ${confirmation.id}\n\nBuyer: [[buyers/${confirmation.buyerId}|${confirmation.buyerName}]]\n\nStatus: ${confirmation.status}\n\nSection: ${confirmation.section}\n\nSeat: ${confirmation.seat}\n\nPrice: $${confirmation.price}\n\nTicket: ${confirmation.ticketId ? `[[tickets/${confirmation.ticketId}|${confirmation.ticketId}]]` : "waitlist"}\n\nNote: ${confirmation.note}\n\nLinks: [[confirmations]] [[demand]] [[pricing]]\n`,
      );
    }
    for (const ticket of this.state.tickets) {
      const owner = this.state.buyers.find((buyer) => buyer.id === ticket.owner);
      writeNote(
        `graph/tickets/${ticket.id}.md`,
        `---\ntype: ticket\nid: ${ticket.id}\nstatus: ${ticket.status}\nowner: ${ticket.owner || ""}\nownerName: ${owner?.name || ""}\nprice: ${ticket.price}\n---\n# Ticket ${ticket.id}\n\nSection: [[${ticket.sectionName}]]\n\nSeat: ${ticket.seat}\n\nStatus: ${ticket.status}\n\nOwner: ${owner ? `[[buyers/${owner.id}|${owner.name}]]` : "none"}\n\nConfirmations:\n${ticket.confirmations
          .map((id) => `- [[confirmations/${id}|${id}]]`)
          .join("\n") || "- none"}\n\nLinks: [[demand]] [[pricing]] [[confirmations]]\n`,
      );
    }
    writeNote(
      "graph/index.md",
      `---\ntype: index\n---\n# World Cup Ticket Company Brain\n\nLast update: ${new Date().toISOString()}\n\nReason: ${reason}\n\n## Core nodes\n\n- [[demand]]\n- [[pricing]]\n- [[confirmations]]\n- [[decisions-log]]\n- [[agents/demand-agent]]\n- [[agents/pricing-agent]]\n- [[agents/sales-agent]]\n- [[agents/orchestrator]]\n\n## Rule\n\nConnected memory makes each Hermes agent smarter. Orchestration makes the agents act as one company.\n`,
    );
  }
}

export { AGENTS, SECTIONS, VAULT_RUNTIME };
