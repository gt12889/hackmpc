/**
 * Seed a baseline of matched receipts (~85% of charges over the $50 threshold)
 * so coverage stats and the missing-receipt compliance flag populate before any
 * upload. AI-Vision uploads add real receipts on top.
 *   npm run seed:receipts
 */
import { getDb } from "../lib/db";
import { RECEIPT_THRESHOLD } from "../lib/receipts";

function main() {
  const db = getDb();
  db.prepare("DELETE FROM receipts").run();

  const txns = db
    .prepare(
      `SELECT id, merchant_name, txn_date, amount_cad
       FROM transactions
       WHERE category NOT IN ('Payments & Settlements') AND direction='Debit' AND amount_cad > ${RECEIPT_THRESHOLD}`
    )
    .all() as any[];

  const ins = db.prepare(
    `INSERT INTO receipts (transaction_id, source, extracted_merchant, extracted_date, extracted_amount, extracted_tax, confidence, match_status)
     VALUES (?,?,?,?,?,?,?, 'matched')`
  );
  const tx = db.transaction((rows: any[]) => {
    let made = 0;
    for (const t of rows) {
      // Deterministic ~14% gap (leaves some high-value charges unreceipted for the demo).
      if (t.id % 7 === 0) continue;
      const tax = Math.round(t.amount_cad * 0.05 * 100) / 100;
      ins.run(t.id, "synthetic", t.merchant_name, t.txn_date, t.amount_cad, tax, 0.99);
      made++;
    }
    return made;
  });
  const made = tx(txns);
  const missing = txns.length - made;
  console.log(`✓ seeded ${made} matched receipts (${missing} charges left unreceipted of ${txns.length} over $${RECEIPT_THRESHOLD})`);
  process.exit(0);
}
main();
