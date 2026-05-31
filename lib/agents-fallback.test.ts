import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { generateFeedSwarm } from "./insights-swarm";

// When the Python swarm sidecar is unreachable, the flows fall back to the
// single-call / rule-based paths. Those fallbacks must still record an
// agent_run so the "Agent activity" feed isn't empty (the panel reads
// agent_runs via /api/agents). This is the bug: sidecar-less = empty feed.

function memDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature TEXT NOT NULL, role TEXT NOT NULL, subject_key TEXT,
    ok INTEGER NOT NULL DEFAULT 0, model TEXT, summary TEXT, payload TEXT,
    created_at TEXT DEFAULT (datetime('now')));`);
  return db;
}

// Enough signal to make ruleBasedInsights emit at least one insight.
const SIGNALS: any = {
  anomaly: { duplicateGroups: 0, duplicateExposure: 0 },
  dups: [],
  vendors: {},
  topConsolidation: [],
  forecast: {},
  risers: [],
  recurring: { count: 0, monthlyCommitted: 0, annualized: 0 },
  fx: { usdShare: 60, usdValue: 1000, estFxCost: 30 },
  receipts: { missing: 0, missingValue: 0, coveragePct: 100 },
  budgets: { atRisk: 0, overBudget: 0 },
};

// Simulate the sidecar being down: a non-2xx response.
const sidecarDown: any = async () => ({ ok: false, status: 502, json: async () => ({}) });

describe("insights-swarm fallback records agent activity", () => {
  it("records an agent_run when the sidecar is unreachable", async () => {
    const db = memDb();
    const feed = await generateFeedSwarm({ db, signals: SIGNALS, fetchImpl: sidecarDown });

    expect(feed.length).toBeGreaterThan(0); // rule-based feed still returned

    const runs = db.prepare("SELECT * FROM agent_runs WHERE feature='insights-swarm'").all() as any[];
    expect(runs.length).toBeGreaterThan(0); // the fix: fallback now logs activity
    expect(runs[0].ok).toBe(1);
  });
});
