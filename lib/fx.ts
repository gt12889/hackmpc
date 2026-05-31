import { getDb } from "./db";

// Cross-border FX exposure. 72% of spend is USD-origin (the dataset's defining
// trait). Estimates the FX cost (typical card FX spread on the converted volume)
// and breaks exposure down by month / category / state.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;
const FX_SPREAD = 0.025; // typical 2.5% card FX markup on cross-border charges

export function fxSummary() {
  const db = getDb();
  const byCur = db.prepare(`SELECT currency, COUNT(*) n, ROUND(SUM(amount_cad),2) cad FROM transactions WHERE ${NON_OP} GROUP BY currency`).all() as any[];
  const usd = byCur.find((r) => r.currency === "USD") || { n: 0, cad: 0 };
  const cad = byCur.find((r) => r.currency === "CAD") || { n: 0, cad: 0 };
  const total = (usd.cad || 0) + (cad.cad || 0);
  const avgRate = (db.prepare(`SELECT ROUND(AVG(conversion_rate),4) r FROM transactions WHERE ${NON_OP} AND currency='USD' AND conversion_rate>0`).get() as any).r ?? 0;
  return {
    usdValue: usd.cad || 0,
    usdCount: usd.n || 0,
    cadValue: cad.cad || 0,
    usdShare: total ? Math.round((usd.cad / total) * 1000) / 10 : 0,
    estFxCost: Math.round((usd.cad || 0) * FX_SPREAD * 100) / 100,
    avgRate,
  };
}

export function fxByMonth() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT substr(txn_date,1,7) period,
              ROUND(SUM(CASE WHEN currency='USD' THEN amount_cad ELSE 0 END),2) usd,
              ROUND(SUM(CASE WHEN currency='CAD' THEN amount_cad ELSE 0 END),2) cad
       FROM transactions WHERE ${NON_OP} GROUP BY period ORDER BY period`
    )
    .all() as any[];
  return rows;
}

export function fxByCategory(limit = 8) {
  const db = getDb();
  return db
    .prepare(
      `SELECT category,
              ROUND(SUM(CASE WHEN currency='USD' THEN amount_cad ELSE 0 END),2) usd,
              ROUND(SUM(amount_cad),2) total
       FROM transactions WHERE ${NON_OP}
       GROUP BY category HAVING usd > 0 ORDER BY usd DESC LIMIT ?`
    )
    .all(limit) as any[];
}

export function topUsdStates(limit = 8) {
  const db = getDb();
  return db
    .prepare(
      `SELECT state_province key, ROUND(SUM(amount_cad),2) value, COUNT(*) count
       FROM transactions WHERE ${NON_OP} AND currency='USD' AND state_province IS NOT NULL
       GROUP BY state_province ORDER BY value DESC LIMIT ?`
    )
    .all(limit) as any[];
}
