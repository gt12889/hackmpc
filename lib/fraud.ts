import type Database from "better-sqlite3";
import { getDb } from "./db";

// Deterministic, explainable fraud-risk scoring. Each operational transaction is
// scored on independent signals; the score + the reasons that fired are returned.
// No AI - pure SQL + JS, so it's always available (not blocked by Gemini quota).

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;
// Categories where many same-day charges to one vendor are legitimate per-item fees
// (permits/tolls/scales) - the compliance engine down-ranks these, so we don't
// treat same-day repeats as a fraud signal for them.
const BATCH_OK = new Set(["Permits & Compliance", "Tolls & Border", "Scales & Wash"]);

const SCORE_THRESHOLD = 20; // min score to be flagged

export type FraudSuspect = {
  id: number;
  txn_date: string;
  transaction_code: string;
  merchant_name: string;
  category: string;
  amount_cad: number;
  score: number;       // 0..100
  reasons: string[];   // explainable signal labels
};

type Row = {
  id: number; txn_date: string; transaction_code: string; merchant_name: string;
  merchant_norm: string; category: string; amount_cad: number;
  is_cross_border: number; is_round_number: number;
};

/** Score every operational transaction; return flagged suspects ranked by score. */
export function fraudScan(limit = 20, db: Database.Database = getDb()): FraudSuspect[] {
  return scoreAll(db).slice(0, limit);
}

function scoreAll(db: Database.Database = getDb()): FraudSuspect[] {
  // Per-category mean + std for outlier detection.
  const stats = new Map<string, { mean: number; std: number }>();
  for (const s of db.prepare(
    `SELECT category, AVG(amount_cad) mean,
            CASE WHEN COUNT(*) > 1 THEN SQRT(AVG(amount_cad*amount_cad) - AVG(amount_cad)*AVG(amount_cad)) ELSE 0 END std
     FROM transactions WHERE ${NON_OP} GROUP BY category`
  ).all() as any[]) {
    stats.set(s.category, { mean: s.mean || 0, std: s.std || 0 });
  }

  // Duplicate groups: same card + merchant + amount appearing 2+ times (>= $250).
  const dupKeys = new Map<string, number>();
  for (const d of db.prepare(
    `SELECT transaction_code, merchant_norm, ROUND(amount_cad,2) amt, COUNT(*) n
     FROM transactions WHERE ${NON_OP} AND amount_cad >= 250
     GROUP BY transaction_code, merchant_norm, ROUND(amount_cad,2) HAVING n >= 2`
  ).all() as any[]) {
    dupKeys.set(`${d.transaction_code}|${d.merchant_norm}|${d.amt}`, d.n);
  }

  // Same card + merchant + day repeats (>= 4).
  const dayRepeats = new Map<string, number>();
  for (const r of db.prepare(
    `SELECT transaction_code, merchant_norm, txn_date, COUNT(*) n
     FROM transactions WHERE ${NON_OP}
     GROUP BY transaction_code, merchant_norm, txn_date HAVING n >= 4`
  ).all() as any[]) {
    dayRepeats.set(`${r.transaction_code}|${r.merchant_norm}|${r.txn_date}`, r.n);
  }

  const rows = db.prepare(
    `SELECT id, txn_date, transaction_code, merchant_name, merchant_norm, category, amount_cad,
            is_cross_border, is_round_number
     FROM transactions WHERE ${NON_OP}`
  ).all() as Row[];

  const out: FraudSuspect[] = [];
  for (const r of rows) {
    const reasons: string[] = [];
    let score = 0;

    const dupN = dupKeys.get(`${r.transaction_code}|${r.merchant_norm}|${Math.round(r.amount_cad * 100) / 100}`);
    if (dupN) { score += 35; reasons.push(`Duplicate charge (${dupN}×)`); }

    const st = stats.get(r.category);
    if (st && st.std > 0 && r.amount_cad >= 1000 && r.amount_cad > st.mean + 2.5 * st.std) {
      const ratio = st.mean > 0 ? (r.amount_cad / st.mean).toFixed(1) : "?";
      score += 30; reasons.push(`Outlier for ${r.category} (${ratio}× avg)`);
    }

    if (r.is_round_number === 1 || (r.amount_cad >= 500 && Number.isInteger(r.amount_cad) && r.amount_cad % 100 === 0)) {
      score += 20; reasons.push("Round-number amount");
    }

    if (r.amount_cad >= 45 && r.amount_cad < 50) {
      score += 25; reasons.push("Just under $50 pre-auth");
    }

    if (r.is_cross_border === 1 && r.amount_cad >= 5000) {
      score += 10; reasons.push("Cross-border high-value");
    }

    if (!BATCH_OK.has(r.category)) {
      const rep = dayRepeats.get(`${r.transaction_code}|${r.merchant_norm}|${r.txn_date}`);
      if (rep) { score += 15; reasons.push(`${rep}× same day`); }
    }

    if (score >= SCORE_THRESHOLD) {
      out.push({
        id: r.id, txn_date: r.txn_date, transaction_code: r.transaction_code,
        merchant_name: r.merchant_name, category: r.category, amount_cad: r.amount_cad,
        score: Math.min(100, score), reasons,
      });
    }
  }

  out.sort((a, b) => b.score - a.score || b.amount_cad - a.amount_cad);
  return out;
}

export type FraudSummary = {
  flagged: number;
  exposure: number;       // total CAD of flagged txns
  byTier: { high: number; medium: number; low: number };
  topReason: string | null;
};

/** Aggregate stats over all flagged suspects (tier: high>=60, medium 40-59, low 20-39). */
export function fraudSummary(db: Database.Database = getDb()): FraudSummary {
  const all = scoreAll(db);
  const byTier = { high: 0, medium: 0, low: 0 };
  const reasonCounts = new Map<string, number>();
  let exposure = 0;
  for (const s of all) {
    byTier[s.score >= 60 ? "high" : s.score >= 40 ? "medium" : "low"]++;
    exposure += s.amount_cad;
    for (const r of s.reasons) {
      // strip the per-row counts so "Duplicate charge (3×)" and "(2×)" tally together
      const key = r.replace(/\s*\(\d+×\)/, "").replace(/\s*\(\d+(\.\d+)?× avg\)/, "").replace(/^\d+× /, "").trim();
      reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
    }
  }
  let topReason: string | null = null, max = 0;
  for (const [k, v] of reasonCounts) if (v > max) { max = v; topReason = k; }
  return { flagged: all.length, exposure: Math.round(exposure * 100) / 100, byTier, topReason };
}
