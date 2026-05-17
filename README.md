# World Cup Agent Company

A demo app about context and orchestration in AI agent systems.

The scenario is a fictional company that gives out a limited block of World Cup tickets. Demand, Pricing, Sales, and Orchestrator agents operate against the same ticket company, but different memory and control modes change how well the system behaves.

The core idea:

> Connected memory makes agents reason better. Orchestration makes agents act as one system.

![Booking page](docs/booking-page.png)

## What It Shows

- **Silo memory:** each agent only sees its department notes, so answers are narrow.
- **Graph memory:** agents can read connected company memory across demand, pricing, tickets, buyers, and decisions.
- **Direct commits:** specialist agents can write directly, which creates duplicated seats and inconsistent prices under load.
- **Orchestrated commits:** specialists propose, but the orchestrator owns the sequence and final commit.

## Local Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

- Buyer site: `http://localhost:5173`
- Dashboard: `http://localhost:5173/dashboard`
- Backend health: `http://localhost:8787/api/health`

The buyer site is phone-first. A buyer enters a display name and taps **Buy ticket**. The result is a ticket stub with section, seat, price, and confirmation code.

## Obsidian Memory

The app writes a markdown vault to:

```text
vault/runtime
```

Open that folder in Obsidian to inspect the generated graph. Obsidian is a viewer over the markdown files; the app still works if Obsidian is closed.

Important generated paths:

- buyers: `graph/buyers/`
- confirmations: `graph/confirmations/`
- tickets: `graph/tickets/`
- decisions: `graph/decisions-log.md`

## Hermes Agents

The named roles are represented as separate Hermes agent profiles:

- `hermes:demand-analyst`
- `hermes:pricing-strategist`
- `hermes:sales-closer`
- `hermes:company-orchestrator`

The app talks to these profiles through `server/agents/hermesAdapter.js`.

Runtime order:

1. If per-agent Hermes gateway URLs are configured, each role is routed to its own contained Hermes profile.
2. If Hermes gateways are unavailable but an OpenAI API key is present, the adapter uses the OpenAI Responses API for concise agent reasoning.
3. If neither is configured, deterministic local responses keep the demo runnable.

The default model snapshot is:

```text
gpt-5.4-mini-2026-03-17
```

## Containerized Hermes

Hermes runs in Docker containers:

```bash
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `.env` as `HERMES_API_SERVER_KEY`, and put an OpenAI key in `OPENAI_API_KEY`.

Then run:

```bash
npm run hermes:up
npm run dev
```

The app calls four local Hermes gateways:

- Demand: `http://localhost:8642/v1/chat/completions`
- Pricing: `http://localhost:8643/v1/chat/completions`
- Sales: `http://localhost:8644/v1/chat/completions`
- Orchestrator: `http://localhost:8645/v1/chat/completions`

Each profile has its own data directory under `.hermes-data/<role>/`, which is gitignored.

Reset the contained profiles with:

```bash
npm run hermes:hard-reset
```

## Flow

1. Start with **Silos** and **Direct**.
2. Ask Sales why the price is changing. Sales only sees Sales notes.
3. Switch **Memory** to **Graph** and ask again. Sales can now use connected company memory.
4. Keep **Control** on **Direct** and run the 120-buyer load test. Double-sold seats and oversold inventory appear.
5. Reset, keep **Graph** on, switch **Control** to **Orchestrated**, and run the same load test. Confirmations stop at inventory and overflow buyers go to the waitlist.

## Public Buyer Page With Local Agents

Railway can host the buyer page and a small relay while the dashboard, backend, Hermes containers, and Obsidian vault stay local.

Local setup:

```bash
npm run hermes:up
npm run dev
```

Relay setup:

```bash
npm run relay:local
```

Required local environment values:

```text
RAILWAY_RELAY_URL=wss://<railway-service-domain>/relay/local
RELAY_TOKEN=<same token configured on Railway>
```

Request path:

```text
browser -> Railway buyer page -> Railway relay -> local relay client -> local backend -> Hermes agents
```

## Verification

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```
