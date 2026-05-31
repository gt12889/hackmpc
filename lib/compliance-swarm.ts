import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getViolations, adjustSeverityWithAI } from "./compliance";
import { callAgentService } from "./agent-service";
import { recordTraces, type AgentTrace } from "./orchestrator";

// Compliance reviewer swarm. Sends the top open violations to the LangGraph
// sidecar (domain reviewers → false-positive challenger) and writes the adjusted
// severities back with the SAME UPDATE adjustSeverityWithAI uses. Falls back to
// the single-call adjustSeverityWithAI when the sidecar is unreachable.

type ReviewResult = { key: string; severity: string; reason: string };
type ComplianceResponse = { results: ReviewResult[]; traces: AgentTrace[] };

export type ReviewOutcome = { reviewed: number; mode: "swarm" | "single" };

export async function reviewViolationsSwarm(
  deps: { db?: Database.Database; fetchImpl?: typeof fetch } = {}
): Promise<ReviewOutcome> {
  const db = deps.db ?? getDb();
  const candidates = getViolations(undefined, db).slice(0, 18);
  if (!candidates.length) return { reviewed: 0, mode: "swarm" };

  // Same payload shape as adjustSeverityWithAI (lib/compliance.ts).
  const violations = candidates.map((v) => ({
    key: v.group_key || String(v.id),
    rule: v.rule_name,
    type: v.rule_type,
    merchant: v.merchant_name,
    category: v.category,
    amount_cad: v.amount_involved,
    date: v.txn_date,
    split_count: v.group_size > 1 ? v.group_size : undefined,
    base_severity: v.severity,
  }));

  const res = await callAgentService<ComplianceResponse>("/compliance/review", { violations }, { fetchImpl: deps.fetchImpl });

  if (!res.ok) {
    const n = await adjustSeverityWithAI();
    return { reviewed: n, mode: "single" };
  }

  recordTraces(db, res.data.traces);
  const upd = db.prepare(
    `UPDATE violations SET severity = ?, ai_severity = ?, ai_reasoning = ?
     WHERE COALESCE(group_key, CAST(id AS TEXT)) = ?`
  );
  const valid = new Set(["critical", "high", "medium", "low"]);
  let reviewed = 0;
  const tx = db.transaction((items: ReviewResult[]) => {
    for (const it of items) {
      const sev = valid.has(it.severity) ? it.severity : "medium";
      upd.run(sev, sev, it.reason ?? null, it.key);
      reviewed++;
    }
  });
  tx(res.data.results);
  return { reviewed, mode: "swarm" };
}
