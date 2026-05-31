import type Database from "better-sqlite3";
import { getDb } from "./db";

// Spend profiles & benchmarking. Card 3001 is ~99.6% of spend so there are no
// peer cardholders to compare - instead each CATEGORY is profiled and benchmarked
// against the company baseline (avg-txn ratio, share, month-over-month trend).

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

/** Coefficient of variation (std/mean) of a monthly spend series - a volatility
 *  score. 0 = perfectly steady; higher = spikier. Mirrors lib/recurring.ts's cv. */
export function monthlyCv(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.round((Math.sqrt(variance) / mean) * 1000) / 1000;
}

function monthlySeries(db: Database.Database, where: string, param: string): number[] {
  return (
    db
      .prepare(`SELECT ROUND(SUM(amount_cad),2) v FROM transactions WHERE ${NON_OP} AND ${where}=? GROUP BY substr(txn_date,1,7) ORDER BY substr(txn_date,1,7)`)
      .all(param) as any[]
  ).map((r) => r.v as number);
}

/** Per-card spend volatility (cv) + ratio vs the median card. Injectable db for tests. */
export function cardVolatility(card: string, db: Database.Database = getDb()): { card: string; volatility: number; vsBaseline: number } {
  const cards = db.prepare(`SELECT DISTINCT transaction_code c FROM transactions WHERE ${NON_OP} AND transaction_code IS NOT NULL`).all() as any[];
  const cvs = cards.map(({ c }) => monthlyCv(monthlySeries(db, "transaction_code", c)));
  const positive = cvs.filter((v) => v > 0).sort((a, b) => a - b);
  const median = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  const cv = monthlyCv(monthlySeries(db, "transaction_code", card));
  return { card, volatility: cv, vsBaseline: median > 0 ? Math.round((cv / median) * 100) / 100 : 1 };
}

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
    const volatility = monthlyCv(monthlySeries(db, "category", c.category));
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
      volatility, // 0 = steady, higher = spikier monthly spend
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
