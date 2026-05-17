import "dotenv/config";
import { WebSocket } from "ws";

const relayUrl = process.env.RAILWAY_RELAY_URL || process.env.RELAY_URL;
const relayToken = process.env.RELAY_TOKEN || "";
const localBaseUrl = (process.env.LOCAL_DEMO_BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const localWsUrl = process.env.LOCAL_DEMO_WS_URL || "ws://localhost:8787/ws";

if (!relayUrl) {
  console.error("Missing RAILWAY_RELAY_URL. Example: wss://your-service.up.railway.app/relay/local");
  process.exit(1);
}

function relayWithToken() {
  const url = new URL(relayUrl);
  if (relayToken) url.searchParams.set("token", relayToken);
  return url.toString();
}

function connectLocalStateStream(sendToRelay) {
  const socket = new WebSocket(localWsUrl);
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "state") sendToRelay(JSON.stringify({ type: "broadcast", state: message.state }));
    } catch {
      // Ignore malformed local development messages.
    }
  });
  socket.on("close", () => setTimeout(() => connectLocalStateStream(sendToRelay), 1000));
  socket.on("error", () => socket.close());
}

function connectRelay() {
  const relay = new WebSocket(relayWithToken());

  relay.on("open", () => {
    console.log(`Connected Railway buyer relay to ${localBaseUrl}`);
    connectLocalStateStream((payload) => {
      if (relay.readyState === relay.OPEN) relay.send(payload);
    });
  });

  relay.on("message", async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type !== "request" || !message.id) return;

    try {
      const response = await fetch(`${localBaseUrl}${message.path}`, {
        method: message.method,
        headers: message.method === "GET" ? undefined : { "Content-Type": "application/json" },
        body: message.method === "GET" ? undefined : JSON.stringify(message.body || {}),
      });
      const text = await response.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        // Non-JSON responses are passed through as text.
      }
      relay.send(JSON.stringify({ id: message.id, type: "response", status: response.status, body }));
    } catch (error) {
      relay.send(JSON.stringify({ id: message.id, type: "response", status: 502, error: error.message }));
    }
  });

  relay.on("close", () => {
    console.log("Railway buyer relay disconnected; reconnecting...");
    setTimeout(connectRelay, 1500);
  });
  relay.on("error", () => relay.close());
}

connectRelay();
