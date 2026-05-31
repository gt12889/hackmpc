import type Database from "better-sqlite3";
import { getDb } from "./db";
import { fraudScan, type FraudSuspect } from "./fraud";
import { callAgentService } from "./agent-service";
import { recordTraces, type AgentTrace } from "./orchestrator";

// Fraud investigator swarm. Takes the deterministic fraudScan suspects, builds
// per-suspect context (card+merchant history, category norms), sends them to the
// LangGraph sidecar (one Investigator agent each), and persists case files. If the
// sidecar is down, suspects are stored as 'unreviewed' so the UI still lists them.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

type FraudCase = {
  transaction_id: number;
  verdict: "likely_fraud" | "suspicious" | "benign";
  confidence: number;
  narrative: string;
  recommended_action: string;
};
type FraudResponse = { results: FraudCase[]; traces: AgentTrace[] };

export type InvestigationOutcome = { investigated: number; mode: "swarm" | "degraded" };

/** Build the context an investigator agent reasons over for one suspect. */
function suspectContext(db: Database.Database, s: FraudSuspect) {
  const history = db
    .prepare(
      `SELECT txn_date, amount_cad, merchant_name FROM transactions
       WHERE ${NON_OP} AND transaction_code=? AND merchant_name LIKE ? AND id != ?
       ORDER BY txn_date DESC LIMIT 8`
    )
    .all(s.transaction_code, `%${(s.merchant_name || "").slice(0, 12)}%`, s.id) as any[];
  const stat = db
    .prepare(
      `SELECT ROUND(AVG(amount_cad),2) mean, COUNT(*) n FROM transactions WHERE ${NON_OP} AND category=?`
    )
    .get(s.category) as any;
  return {
    transaction_id: s.id,
    score: s.score,
    reasons: s.reasons,
    merchant: s.merchant_name,
    category: s.category,
    amount_cad: s.amount_cad,
    txn_date: s.txn_date,
    card: s.transaction_code,
    category_avg: stat?.mean ?? 0,
    category_txns: stat?.n ?? 0,
    prior_merchant_history: history,
  };
}

function upsert(db: Database.Database) {
  return db.prepare(
    `INSERT INTO fraud_cases (transaction_id, score, verdict, confidence, narrative, recommended_action, created_at)
     VALUES (@transaction_id, @score, @verdict, @confidence, @narrative, @recommended_action, datetime('now'))
     ON CONFLICT(transaction_id) DO UPDATE SET
       score=excluded.score, verdict=excluded.verdict, confidence=excluded.confidence,
       narrative=excluded.narrative, recommended_action=excluded.recommended_action,
       created_at=excluded.created_at`
  );
}

export async function investigateSuspects(
  limit = 6,
  deps: { db?: Database.Database; fetchImpl?: typeof fetch } = {}
): Promise<InvestigationOutcome> {
  const db = deps.db ?? getDb();
  const suspects = fraudScan(limit, db);
  if (!suspects.length) return { investigated: 0, mode: "swarm" };

  const scoreById = new Map(suspects.map((s) => [s.id, s.score]));
  const payload = suspects.map((s) => suspectContext(db, s));
  const res = await callAgentService<FraudResponse>("/fraud/investigate", { suspects: payload }, { fetchImpl: deps.fetchImpl });

  const ins = upsert(db);

  if (!res.ok) {
    // Sidecar down: store deterministic-only rows so the UI still shows suspects.
    const tx = db.transaction((rows: FraudSuspect[]) => {
      for (const s of rows) {
        ins.run({
          transaction_id: s.id, score: s.score, verdict: "unreviewed", confidence: null,
          narrative: `Flagged by ${s.reasons.length} signal(s): ${s.reasons.join("; ")}.`,
          recommended_action: "Agent service unavailable - manual review.",
        });
      }
    });
    tx(suspects);
    return { investigated: suspects.length, mode: "degraded" };
  }

  recordTraces(db, res.data.traces);
  const tx = db.transaction((cases: FraudCase[]) => {
    for (const c of cases) {
      ins.run({
        transaction_id: c.transaction_id,
        score: scoreById.get(c.transaction_id) ?? null,
        verdict: c.verdict,
        confidence: Number(c.confidence) || null,
        narrative: c.narrative ?? null,
        recommended_action: c.recommended_action ?? null,
      });
    }
  });
  tx(res.data.results);
  return { investigated: res.data.results.length, mode: "swarm" };
}

/** Cases joined to their transactions, newest first, for the Fraud Watch UI. */
export function getFraudCases(db: Database.Database = getDb()): any[] {
  return db
    .prepare(
      `SELECT fc.*, t.merchant_name, t.category, t.amount_cad, t.txn_date, t.transaction_code
       FROM fraud_cases fc LEFT JOIN transactions t ON t.id = fc.transaction_id
       ORDER BY fc.score DESC, fc.id DESC`
    )
    .all() as any[];
}
