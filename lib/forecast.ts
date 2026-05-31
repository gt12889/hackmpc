import { getDb } from "./db";

// Burn-rate forecasting: linear-regress monthly spend per category, project the
// next month, and flag categories trending toward a budget overrun.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

function linReg(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo, 1));
  return d.toISOString().slice(0, 7);
}

export function categoryForecasts(topN = 6) {
  const db = getDb();
  const cats = db
    .prepare(`SELECT category, ROUND(SUM(amount_cad),2) total FROM transactions WHERE ${NON_OP} GROUP BY category ORDER BY total DESC LIMIT ?`)
    .all(topN) as any[];

  return cats.map((c) => {
    const series = db
      .prepare(`SELECT substr(txn_date,1,7) m, ROUND(SUM(amount_cad),2) v FROM transactions WHERE ${NON_OP} AND category=? GROUP BY m ORDER BY m`)
      .all(c.category) as any[];
    // Drop the final month if it looks partial (trailing data) - keep it simple: use all.
    const pts = series.map((s, i) => ({ x: i, y: s.v }));
    const { slope, intercept } = linReg(pts);
    const lastM = series[series.length - 1]?.m;
    const projX = pts.length;
    const projected = Math.max(0, Math.round((slope * projX + intercept) * 100) / 100);
    const avg = Math.round((c.total / series.length) * 100) / 100;
    // Budget target = 10% buffer over historical monthly average.
    const budget = Math.round(avg * 1.1);
    const lastVal = series[series.length - 1]?.v ?? 0;
    return {
      category: c.category,
      history: series.map((s) => ({ period: s.m, spend: s.v })),
      avgMonthly: avg,
      budget,
      lastMonth: lastM,
      lastValue: lastVal,
      projectedMonth: lastM ? nextMonth(lastM) : null,
      projected,
      trend: slope > avg * 0.03 ? "rising" : slope < -avg * 0.03 ? "falling" : "flat",
      overrunRisk: projected > budget,
      overrunBy: projected > budget ? Math.round((projected - budget) * 100) / 100 : 0,
    };
  });
}

export function forecastSummary() {
  const f = categoryForecasts(8);
  const atRisk = f.filter((c) => c.overrunRisk);
  return {
    categories: f.length,
    atRisk: atRisk.length,
    projectedOverrun: Math.round(atRisk.reduce((s, c) => s + c.overrunBy, 0) * 100) / 100,
    risingCount: f.filter((c) => c.trend === "rising").length,
  };
}
