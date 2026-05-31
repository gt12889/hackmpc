import { getDb } from "./db";

// Anomaly & fraud signals: duplicate charges, round-number patterns, and
// statistical outliers. Read-only, deterministic.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

/** Same card + merchant + exact amount appearing 2+ times - potential double-billing or recurring charge. */
export function duplicateCharges(limit = 12) {
  const db = getDb();
  return db
    .prepare(
      `SELECT transaction_code, merchant_name, merchant_norm, amount_cad, category,
              COUNT(*) occurrences, GROUP_CONCAT(txn_date) dates,
              MIN(txn_date) first_seen, MAX(txn_date) last_seen
       FROM transactions
       WHERE ${NON_OP} AND amount_cad >= 250
       GROUP BY transaction_code, merchant_norm, ROUND(amount_cad,2)
       HAVING occurrences >= 2
       ORDER BY amount_cad * occurrences DESC
       LIMIT ?`
    )
    .all(limit) as any[];
}

/** Round-number charges (multiples of $100, >= $500) - unusual for fuel/permits which bill odd cents. */
export function roundNumberCharges(limit = 12) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, txn_date, transaction_code, merchant_name, category, amount_cad
       FROM transactions
       WHERE ${NON_OP} AND amount_cad >= 500 AND amount_cad = CAST(amount_cad AS INTEGER) AND CAST(amount_cad AS INTEGER) % 100 = 0
       ORDER BY amount_cad DESC LIMIT ?`
    )
    .all(limit) as any[];
}

/** Largest operational charges - statistical outliers worth a manual look. */
export function largestCharges(limit = 10) {
  const db = getDb();
  return db
    .prepare(`SELECT id, txn_date, transaction_code, merchant_name, category, amount_cad, state_province FROM transactions WHERE ${NON_OP} ORDER BY amount_cad DESC LIMIT ?`)
    .all(limit) as any[];
}

/** The card-payment settlements that are NOT operational spend - surfaced so they aren't mistaken for fraud. */
export function settlements() {
  const db = getDb();
  const agg = db.prepare(`SELECT COUNT(*) n, ROUND(SUM(amount_cad),2) total, ROUND(MAX(amount_cad),2) largest FROM transactions WHERE category='Payments & Settlements'`).get() as any;
  return { count: agg.n ?? 0, total: agg.total ?? 0, largest: agg.largest ?? 0 };
}

export function anomalySummary() {
  const dups = duplicateCharges(100);
  const dupExposure = dups.reduce((s, d) => s + d.amount_cad * (d.occurrences - 1), 0);
  return {
    duplicateGroups: dups.length,
    duplicateExposure: Math.round(dupExposure * 100) / 100,
    roundNumberCount: roundNumberCharges(100).length,
    settlements: settlements(),
  };
}
