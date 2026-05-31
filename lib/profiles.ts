import { getDb } from "./db";

// Spend profiles & benchmarking. Card 3001 is ~99.6% of spend so there are no
// peer cardholders to compare - instead each CATEGORY is profiled and benchmarked
// against the company baseline (avg-txn ratio, share, month-over-month trend).

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

export function categoryProfiles() {
  const db = getDb();
  const base = db.prepare(`SELECT ROUND(AVG(amount_cad),2) avg, ROUND(SUM(amount_cad),2) total FROM transactions WHERE ${NON_OP}`).get() as any;
  const months = db.prepare(`SELECT substr(txn_date,1,7) m FROM transactions GROUP BY m ORDER BY m`).all() as any[];
  const lastM = months[months.length - 1]?.m;
  const prevM = months[months.length - 2]?.m;

  const cats = db
    .prepare(
      `SELECT category, COUNT(*) n, ROUND(SUM(amount_cad),2) total, ROUND(AVG(amount_cad),2) avg_txn,
              ROUND(MAX(amount_cad),2) max_txn
       FROM transactions WHERE ${NON_OP} GROUP BY category ORDER BY total DESC`
    )
    .all() as any[];

  return cats.map((c) => {
    const last = (db.prepare(`SELECT ROUND(SUM(amount_cad),2) s FROM transactions WHERE ${NON_OP} AND category=? AND substr(txn_date,1,7)=?`).get(c.category, lastM) as any).s ?? 0;
    const prev = (db.prepare(`SELECT ROUND(SUM(amount_cad),2) s FROM transactions WHERE ${NON_OP} AND category=? AND substr(txn_date,1,7)=?`).get(c.category, prevM) as any).s ?? 0;
    const momPct = prev ? Math.round(((last - prev) / prev) * 1000) / 10 : 0;
    return {
      category: c.category,
      txns: c.n,
      total: c.total,
      share: base.total ? Math.round((c.total / base.total) * 1000) / 10 : 0,
      avgTxn: c.avg_txn,
      maxTxn: c.max_txn,
      vsBaseline: base.avg ? Math.round((c.avg_txn / base.avg) * 100) / 100 : 1, // 1.0 = company average
      momPct,
      trend: momPct > 5 ? "rising" : momPct < -5 ? "falling" : "flat",
    };
  });
}

export function profilesSummary() {
  const p = categoryProfiles();
  return {
    categories: p.length,
    baselineAvg: p.length ? Math.round((p.reduce((s, c) => s + c.avgTxn * c.txns, 0) / p.reduce((s, c) => s + c.txns, 0)) * 100) / 100 : 0,
    biggestRiser: [...p].sort((a, b) => b.momPct - a.momPct)[0]?.category ?? null,
    topShare: p[0]?.category ?? null,
  };
}
