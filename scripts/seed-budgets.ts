/**
 * Seed default monthly budgets per top spend category (avg monthly × 1.1 buffer),
 * so the Budgets page has content out of the box.
 *   npm run seed:budgets
 */
import { getDb } from "../lib/db";

function main() {
  const db = getDb();
  db.prepare("DELETE FROM budgets").run();
  const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

  // avg monthly spend per category over the dataset's months
  const cats = db
    .prepare(
      `SELECT category, ROUND(AVG(ms),0) avg_monthly FROM (
         SELECT category, substr(txn_date,1,7) m, SUM(amount_cad) ms
         FROM transactions WHERE ${NON_OP} GROUP BY category, m
       ) GROUP BY category HAVING avg_monthly > 500 ORDER BY avg_monthly DESC LIMIT 8`
    )
    .all() as any[];

  const ins = db.prepare(
    `INSERT OR REPLACE INTO budgets (scope, scope_value, period, limit_amount) VALUES ('category', ?, 'month', ?)`
  );
  for (const c of cats) {
    // round to a sensible figure, 10% buffer over the average month
    const limit = Math.round((c.avg_monthly * 1.1) / 100) * 100;
    ins.run(c.category, limit);
  }
  console.log(`✓ seeded ${cats.length} category budgets`);
  process.exit(0);
}
main();
