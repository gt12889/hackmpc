import { getDb } from "./db";

// Recurring / subscription detection. Merchants charged on a regular cadence with
// consistent amounts across multiple months are surfaced as "committed" spend —
// the subscriptions a finance manager may not realize are on autopilot.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

export function recurringCharges(limit = 25) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT merchant_norm vendor, MAX(merchant_name) merchant, MAX(category) category,
              COUNT(*) occurrences, COUNT(DISTINCT substr(txn_date,1,7)) months,
              ROUND(AVG(amount_cad),2) avg_amount,
              AVG(amount_cad*amount_cad) - AVG(amount_cad)*AVG(amount_cad) AS variance,
              ROUND(SUM(amount_cad),2) total, MIN(txn_date) first_seen, MAX(txn_date) last_seen
       FROM transactions WHERE ${NON_OP}
       GROUP BY merchant_norm
       HAVING months >= 3 AND occurrences >= 3 AND avg_amount > 20
       ORDER BY total DESC`
    )
    .all() as any[];

  // Keep only consistent-amount series (low coefficient of variation) — true recurring.
  return rows
    .map((r) => {
      const cv = r.avg_amount > 0 ? Math.sqrt(Math.max(0, r.variance)) / r.avg_amount : 1;
      const perMonth = r.occurrences / r.months; // ~1 = monthly
      const cadence = perMonth >= 3 ? "weekly" : perMonth >= 1.5 ? "biweekly" : perMonth >= 0.8 ? "monthly" : "periodic";
      const monthlyCommitted = Math.round(r.avg_amount * Math.min(perMonth, 4) * 100) / 100;
      return { ...r, cv: Math.round(cv * 100) / 100, cadence, monthlyCommitted, consistent: cv < 0.35 };
    })
    .filter((r) => r.consistent)
    .slice(0, limit);
}

export function recurringSummary() {
  const all = recurringCharges(500);
  const monthlyCommitted = Math.round(all.reduce((s, r) => s + r.monthlyCommitted, 0) * 100) / 100;
  return {
    count: all.length,
    monthlyCommitted,
    annualized: Math.round(monthlyCommitted * 12 * 100) / 100,
    topCategory: all[0]?.category ?? null,
  };
}
