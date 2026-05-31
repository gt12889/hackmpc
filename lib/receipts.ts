import { getDb } from "./db";

// Receipt matching. Receipts (synthetic baseline + AI-Vision-OCR uploads) are
// fuzzy-matched to a transaction by merchant + date(±3d) + amount(±2%). Powers
// coverage stats and the `missing_receipt` compliance rule.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;
export const RECEIPT_THRESHOLD = 50; // policy: expenses over $50 require a receipt

export type Extracted = { merchant?: string; date?: string; amount?: number; tax?: number };

/** Find the best-matching transaction for an OCR'd receipt. */
export function matchReceipt(ex: Extracted): { transaction_id: number | null; confidence: number } {
  const db = getDb();
  const amt = Number(ex.amount);
  if (isNaN(amt) || amt <= 0) return { transaction_id: null, confidence: 0 };
  const tol = Math.max(1, amt * 0.02);

  const rows = db
    .prepare(
      `SELECT id, merchant_name, merchant_norm, txn_date, amount_cad,
              ABS(amount_cad - ?) AS damt,
              ${ex.date ? "ABS(julianday(txn_date) - julianday(?))" : "999"} AS ddays
       FROM transactions
       WHERE ${NON_OP} AND ABS(amount_cad - ?) <= ?
         AND id NOT IN (SELECT transaction_id FROM receipts WHERE transaction_id IS NOT NULL)
       ${ex.date ? "AND ABS(julianday(txn_date) - julianday(?)) <= 3" : ""}
       ORDER BY damt ASC, ddays ASC LIMIT 8`
    )
    .all(...(ex.date ? [amt, ex.date, amt, tol, ex.date] : [amt, amt, tol])) as any[];

  if (!rows.length) return { transaction_id: null, confidence: 0 };

  // Score: amount closeness + merchant-token overlap.
  const tokens = (ex.merchant || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  let best = rows[0], bestScore = -1;
  for (const r of rows) {
    const amtScore = 1 - Math.min(1, r.damt / tol);
    const merchHit = tokens.some((t: string) => (r.merchant_norm || "").includes(t)) ? 1 : 0;
    const dateScore = ex.date ? 1 - Math.min(1, r.ddays / 3) : 0.5;
    const score = amtScore * 0.5 + merchHit * 0.35 + dateScore * 0.15;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return { transaction_id: best.id, confidence: Math.round(bestScore * 100) / 100 };
}

export function insertReceipt(rec: {
  transaction_id: number | null;
  source?: string;
  image_path?: string | null;
  extracted_merchant?: string | null;
  extracted_date?: string | null;
  extracted_amount?: number | null;
  extracted_tax?: number | null;
  confidence?: number | null;
}) {
  const db = getDb();
  return db
    .prepare(
      `INSERT INTO receipts (transaction_id, source, image_path, extracted_merchant, extracted_date, extracted_amount, extracted_tax, confidence, match_status)
       VALUES (@transaction_id,@source,@image_path,@extracted_merchant,@extracted_date,@extracted_amount,@extracted_tax,@confidence,@match_status)`
    )
    .run({
      source: "upload",
      image_path: null,
      extracted_merchant: null,
      extracted_date: null,
      extracted_amount: null,
      extracted_tax: null,
      confidence: null,
      ...rec,
      match_status: rec.transaction_id ? "matched" : "unmatched",
    });
}

export function receiptSummary() {
  const db = getDb();
  const totals = db.prepare(`SELECT COUNT(*) n, ROUND(SUM(amount_cad),2) v FROM transactions WHERE ${NON_OP} AND amount_cad > ${RECEIPT_THRESHOLD}`).get() as any;
  const matched = db
    .prepare(
      `SELECT COUNT(DISTINCT t.id) n, ROUND(SUM(t.amount_cad),2) v
       FROM transactions t JOIN receipts r ON r.transaction_id = t.id
       WHERE ${NON_OP.replace(/category/g, "t.category").replace(/direction/g, "t.direction")} AND t.amount_cad > ${RECEIPT_THRESHOLD}`
    )
    .get() as any;
  const total = totals.n || 0;
  const m = matched.n || 0;
  const recs = db.prepare(`SELECT COUNT(*) n FROM receipts`).get() as any;
  const unmatchedUploads = db.prepare(`SELECT COUNT(*) n FROM receipts WHERE match_status='unmatched'`).get() as any;
  return {
    required: total,
    matched: m,
    missing: total - m,
    coveragePct: total ? Math.round((m / total) * 1000) / 10 : 0,
    matchedValue: matched.v || 0,
    missingValue: Math.round(((totals.v || 0) - (matched.v || 0)) * 100) / 100,
    totalReceipts: recs.n || 0,
    unmatchedUploads: unmatchedUploads.n || 0,
  };
}

/** Operational charges over the receipt threshold with NO matched receipt - for the compliance rule + UI. */
export function unmatchedRequiredCharges(limit = 50) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, txn_date, transaction_code, merchant_name, category, amount_cad, state_province
       FROM transactions t
       WHERE ${NON_OP} AND amount_cad > ${RECEIPT_THRESHOLD}
         AND id NOT IN (SELECT transaction_id FROM receipts WHERE transaction_id IS NOT NULL)
       ORDER BY amount_cad DESC LIMIT ?`
    )
    .all(limit) as any[];
}

/** Recently added receipts (matched + unmatched) for the UI list. */
export function recentReceipts(limit = 20) {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*, t.merchant_name AS txn_merchant, t.amount_cad AS txn_amount, t.txn_date AS txn_date_matched
       FROM receipts r LEFT JOIN transactions t ON t.id = r.transaction_id
       ORDER BY r.id DESC LIMIT ?`
    )
    .all(limit) as any[];
}
