import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { investigateSuspects, getFraudCases } from "./fraud-investigator";
import { getRecentAgentRuns } from "./orchestrator";

// Seed a duplicate-charge pair so fraudScan flags transaction 1 (and 2).
function seedFlagged(db: ReturnType<typeof makeTestDb>) {
  seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "ACME", category: "Maintenance & Repair", amount_cad: 900 });
  seedTransaction(db, { id: 2, transaction_code: "3001", merchant_name: "ACME", category: "Maintenance & Repair", amount_cad: 900 });
}

function fraudResponse(ids: number[]): Response {
  const body = {
    results: ids.map((id) => ({
      transaction_id: id,
      verdict: "suspicious",
      confidence: 0.7,
      narrative: "Duplicate charge to the same vendor.",
      recommended_action: "Hold the card.",
    })),
    traces: ids.map((id) => ({ feature: "fraud-investigator", role: "Investigator", subject_key: String(id), ok: true, model: "fake", summary: "suspicious" })),
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("investigateSuspects", () => {
  it("persists a case + traces per suspect when the sidecar responds", async () => {
    const db = makeTestDb();
    seedFlagged(db);
    const fetchImpl = (async (_u: string, init: any) => {
      const sent = JSON.parse(init.body);
      const ids = sent.suspects.map((s: any) => s.transaction_id);
      return fraudResponse(ids);
    }) as unknown as typeof fetch;

    const out = await investigateSuspects(6, { db, fetchImpl });
    expect(out.mode).toBe("swarm");
    expect(out.investigated).toBeGreaterThanOrEqual(1);

    const cases = getFraudCases(db);
    expect(cases.length).toBeGreaterThanOrEqual(1);
    expect(cases[0].verdict).toBe("suspicious");
    expect(cases[0].score).toBeGreaterThan(0); // deterministic score retained
    expect(getRecentAgentRuns(db).length).toBeGreaterThanOrEqual(1);
  });

  it("degrades to 'unreviewed' rows when the sidecar is down", async () => {
    const db = makeTestDb();
    seedFlagged(db);
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const out = await investigateSuspects(6, { db, fetchImpl });
    expect(out.mode).toBe("degraded");
    const cases = getFraudCases(db);
    expect(cases.length).toBeGreaterThanOrEqual(1);
    expect(cases.every((c) => c.verdict === "unreviewed")).toBe(true);
  });
});
