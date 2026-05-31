import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction, seedViolation } from "../test/helpers/db";
import { reviewViolationsSwarm } from "./compliance-swarm";
import { getViolations } from "./compliance";
import { getRecentAgentRuns } from "./orchestrator";

function seedTwoViolations(db: ReturnType<typeof makeTestDb>) {
  seedTransaction(db, { id: 1, merchant_name: "ACME", category: "Maintenance & Repair", amount_cad: 4900 });
  seedTransaction(db, { id: 2, merchant_name: "BETA", category: "Fuel", amount_cad: 6000 });
  seedViolation(db, { rule_id: 1, rule_name: "Split charge", rule_type: "split_charge", transaction_id: 1, severity: "medium", amount_involved: 4900, merchant_name: "ACME" });
  seedViolation(db, { rule_id: 2, rule_name: "Large charge", rule_type: "txn_threshold", transaction_id: 2, severity: "medium", amount_involved: 6000, merchant_name: "BETA" });
}

describe("reviewViolationsSwarm", () => {
  it("writes sidecar severities back to violations and records traces", async () => {
    const db = makeTestDb();
    seedTwoViolations(db);
    const keys = getViolations(undefined, db).map((v) => v.group_key || String(v.id));

    const fetchImpl = (async (_u: string, init: any) => {
      const sent = JSON.parse(init.body);
      const results = sent.violations.map((v: any) => ({ key: v.key, severity: "high", reason: "reviewed by swarm" }));
      const body = {
        results,
        traces: [{ feature: "compliance-swarm", role: "Reviewer:threshold-ducking", subject_key: "threshold-ducking", ok: true, model: "fake", summary: "reviewed" }],
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const out = await reviewViolationsSwarm({ db, fetchImpl });
    expect(out.mode).toBe("swarm");
    expect(out.reviewed).toBe(keys.length);

    const sevs = db.prepare(`SELECT DISTINCT severity FROM violations`).all() as any[];
    expect(sevs.every((r) => r.severity === "high")).toBe(true);
    const reasons = db.prepare(`SELECT ai_reasoning FROM violations LIMIT 1`).get() as any;
    expect(reasons.ai_reasoning).toContain("swarm");
    expect(getRecentAgentRuns(db).length).toBe(1);
  });

  it("falls back to single-call mode when the sidecar is down", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const db = makeTestDb();
      seedTwoViolations(db);
      const fetchImpl = (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch;
      const out = await reviewViolationsSwarm({ db, fetchImpl });
      expect(out.mode).toBe("single");
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
      if (prevGoogle !== undefined) process.env.GOOGLE_API_KEY = prevGoogle;
    }
  });
});
