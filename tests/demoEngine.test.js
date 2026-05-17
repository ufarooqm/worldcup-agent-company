import { describe, expect, it } from "vitest";
import { DemoEngine } from "../server/lib/demoEngine.js";

describe("World Cup demo engine", () => {
  it("silo mode produces a shallow context answer", () => {
    const engine = new DemoEngine();
    const state = engine.explainPrice();
    expect(state.explanation.mode).toBe("silo");
    expect(state.metrics.siloMisses).toBe(1);
  });

  it("graph mode produces a connected context answer", () => {
    const engine = new DemoEngine();
    engine.setContextMode("graph");
    const state = engine.explainPrice();
    expect(state.explanation.mode).toBe("graph");
    expect(state.explanation.sources).toContain("graph/demand.md");
  });

  it("unorchestrated rush reliably creates collisions", () => {
    const engine = new DemoEngine();
    engine.setContextMode("graph");
    const { state } = engine.simulate(120);
    expect(state.metrics.doubleSoldSeats).toBeGreaterThan(0);
    expect(state.metrics.priceConflicts).toBeGreaterThan(0);
    expect(state.buyers.at(-1).name).toBe("Load buyer 120");
    expect(state.events[0].message).toContain("No single owner checked inventory");
  });

  it("orchestrated rush never double sells and waitlists after inventory is gone", () => {
    const engine = new DemoEngine();
    engine.setContextMode("graph");
    engine.setOrchestrator(true);
    const { state } = engine.simulate(120);
    expect(state.metrics.doubleSoldSeats).toBe(0);
    expect(state.metrics.priceConflicts).toBe(0);
    expect(state.metrics.confirmed).toBe(36);
    expect(state.metrics.waitlisted).toBe(84);
    expect(state.events[0].message).toContain("Seats stay unique");
  });

  it("logs real buyer purchases individually but summarizes synthetic load tests", () => {
    const engine = new DemoEngine();
    engine.setContextMode("graph");
    engine.buyTicket({ buyerName: "Aisha" });
    expect(engine.getState().events[0].message).toContain("Aisha");

    const { state } = engine.simulate(10);
    expect(state.events[0].message).toContain("Load test batch");
    expect(state.events[0].message).not.toContain("Load buyer 10");
  });

  it("stage controls move backward and forward through known demo snapshots", () => {
    const engine = new DemoEngine();
    let state = engine.nextStage();
    expect(state.stage.id).toBe("silo-question");
    expect(state.explanation.mode).toBe("silo");

    state = engine.nextStage();
    expect(state.stage.id).toBe("graph-question");
    expect(state.contextMode).toBe("graph");
    expect(state.explanation.mode).toBe("graph");

    state = engine.nextStage();
    expect(state.stage.id).toBe("chaos-rush");
    expect(state.metrics.doubleSoldSeats).toBeGreaterThan(0);

    state = engine.nextStage();
    expect(state.stage.id).toBe("orchestrated-rush");
    expect(state.orchestratorEnabled).toBe(true);
    expect(state.metrics.doubleSoldSeats).toBe(0);

    state = engine.previousStage();
    expect(state.stage.id).toBe("chaos-rush");
    expect(state.orchestratorEnabled).toBe(false);
    expect(state.metrics.doubleSoldSeats).toBeGreaterThan(0);
  });
});
