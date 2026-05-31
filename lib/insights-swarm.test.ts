import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import { generateFeedSwarm } from "./insights-swarm";
import { getRecentAgentRuns } from "./orchestrator";

// Minimal signals object so we never touch the real DB via gatherSignals().
const SIGNALS = {
  anomaly: { duplicateGroups: 0, duplicateExposure: 0 },
  dups: [],
  vendors: {},
  topConsolidation: [],
  forecast: {},
  risers: [],
  recurring: { count: 0, monthlyCommitted: 0, annualized: 0 },
  fx: { usdShare: 0, usdValue: 0, estFxCost: 0 },
  receipts: { missing: 0, missingValue: 0, coveragePct: 100 },
  budgets: { overBudget: 0, atRisk: 0 },
} as any;

function sweepResponse(): Response {
  const body = {
    insights: [
      { title: "Consolidate fuel vendors", detail: "Save ~$12k/yr", severity: "medium", metric: "$12k", link: "/insights" },
      { title: "3 categories over budget", detail: "Review now", severity: "high", metric: "3", link: "/budgets" },
    ],
    traces: [
      { feature: "insights-swarm", role: "Lens:Savings", subject_key: "feed", ok: true, model: "fake", summary: "savings" },
      { feature: "insights-swarm", role: "Ranker", subject_key: "feed", ok: true, model: "fake", summary: "ranked 2" },
    ],
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("generateFeedSwarm", () => {
  it("returns the ranked feed and records traces when the sidecar responds", async () => {
    const db = makeTestDb();
    const fetchImpl = (async () => sweepResponse()) as unknown as typeof fetch;
    const feed = await generateFeedSwarm({ db, fetchImpl, signals: SIGNALS });
    expect(feed.length).toBe(2);
    expect(feed[0].title).toBe("Consolidate fuel vendors");
    expect(getRecentAgentRuns(db).length).toBe(2);
  });

  it("falls back to rule-based insights when the sidecar is down", async () => {
    const db = makeTestDb();
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const feed = await generateFeedSwarm({ db, fetchImpl, signals: SIGNALS });
    expect(Array.isArray(feed)).toBe(true); // rule-based (possibly empty for all-zero signals) — no throw
  });
});
