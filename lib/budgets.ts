import { getDb } from "./db";
import { categoryForecasts } from "./forecast";

// Budget tracking. Per-category (or per-card) monthly limits, tracked against the
// latest month's actuals, with a projected next-month figure (reusing the
// forecast model) to flag overrun risk.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

export function listBudgets() {
  return getDb().prepare(`SELECT * FROM budgets ORDER BY limit_amount DESC`).all() as any[];
}

export function setBudget(scope: string, scope_value: string, limit_amount: number, period = "month") {
  const db = getDb();
  db.prepare(
    `INSERT INTO budgets (scope, scope_value, period, limit_amount) VALUES (?,?,?,?)
     ON CONFLICT(scope, scope_value, period) DO UPDATE SET limit_amount = excluded.limit_amount`
  ).run(scope, scope_value, period, limit_amount);
}

export function deleteBudget(id: number) {
  getDb().prepare(`DELETE FROM budgets WHERE id = ?`).run(id);
}

function latestMonth(): string {
  return (getDb().prepare(`SELECT MAX(substr(txn_date,1,7)) m FROM transactions`).get() as any).m;
}

export function spendCategories() {
  return getDb()
    .prepare(
      `SELECT category, ROUND(SUM(amount_cad),2) total
       FROM transactions WHERE ${NON_OP}
       GROUP BY category ORDER BY total DESC`
    )
    .all() as { category: string; total: number }[];
}

export function getBudgetStatus() {
  const db = getDb();
  const month = latestMonth();
  const forecasts = new Map(categoryForecasts(20).map((f) => [f.category, f]));
  const budgets = listBudgets();

  const rows = budgets.map((b) => {
    const where = b.scope === "card" ? "transaction_code = ?" : "category = ?";
    const actual =
      (db.prepare(`SELECT ROUND(SUM(amount_cad),2) s FROM transactions WHERE ${NON_OP} AND ${where} AND substr(txn_date,1,7)=?`).get(b.scope_value, month) as any).s ?? 0;
    const fc = b.scope === "category" ? forecasts.get(b.scope_value) : undefined;
    const projected = fc ? fc.projected : actual;
    const pct = b.limit_amount ? Math.round((actual / b.limit_amount) * 1000) / 10 : 0;
    const projPct = b.limit_amount ? Math.round((projected / b.limit_amount) * 1000) / 10 : 0;
    return {
      ...b,
      month,
      actual,
      pct,
      remaining: Math.round((b.limit_amount - actual) * 100) / 100,
      projected,
      projPct,
      overrun: actual > b.limit_amount,
      projectedOverrun: projected > b.limit_amount,
      overBy: actual > b.limit_amount ? Math.round((actual - b.limit_amount) * 100) / 100 : 0,
      trend: fc?.trend ?? "flat",
    };
  });

  const summary = {
    count: rows.length,
    totalBudget: Math.round(rows.reduce((s, r) => s + r.limit_amount, 0) * 100) / 100,
    totalActual: Math.round(rows.reduce((s, r) => s + r.actual, 0) * 100) / 100,
    overBudget: rows.filter((r) => r.overrun).length,
    atRisk: rows.filter((r) => !r.overrun && r.projectedOverrun).length,
    month,
  };
  return { summary, budgets: rows, categories: spendCategories() };
}
