import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/** Fresh in-memory DB with the full app schema applied. Each test gets isolation. */
export function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  // FKs OFF: these tests exercise notification/call logic, not referential
  // integrity. Leaving FKs off lets us seed transactions/violations without
  // also seeding parent cards/policy_rules rows. (Prod db.ts enables FKs.)
  db.pragma("foreign_keys = OFF");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

/** Insert a minimal transaction row (only the columns our features read). */
export function seedTransaction(
  db: Database.Database,
  t: { id: number; transaction_code?: string; merchant_name?: string; category?: string; amount_cad?: number; txn_date?: string; state_province?: string; mcc?: string; direction?: string }
) {
  db.prepare(
    `INSERT INTO transactions (id, transaction_code, merchant_name, merchant_norm, category, amount_cad, txn_date, state_province, mcc, direction, currency)
     VALUES (@id, @transaction_code, @merchant_name, @merchant_norm, @category, @amount_cad, @txn_date, @state_province, @mcc, @direction, 'CAD')`
  ).run({
    id: t.id,
    transaction_code: t.transaction_code ?? "3001",
    merchant_name: t.merchant_name ?? "TEST MERCHANT",
    merchant_norm: (t.merchant_name ?? "TEST MERCHANT").toUpperCase(),
    category: t.category ?? "Fuel",
    amount_cad: t.amount_cad ?? 100,
    txn_date: t.txn_date ?? "2026-01-15",
    state_province: t.state_province ?? "TX",
    mcc: t.mcc ?? "5541",
    direction: t.direction ?? "Debit",
  });
}

/** Insert a violation row directly (mimics what runScan produces). */
export function seedViolation(
  db: Database.Database,
  v: { rule_id: number; rule_name: string; rule_type?: string; transaction_id: number | null; group_key?: string | null; severity: string; amount_involved: number; merchant_name: string; txn_date?: string }
) {
  db.prepare(
    `INSERT INTO violations (rule_id, rule_name, rule_type, transaction_id, group_key, severity, amount_involved, merchant_name, txn_date, status)
     VALUES (@rule_id, @rule_name, @rule_type, @transaction_id, @group_key, @severity, @amount_involved, @merchant_name, @txn_date, 'open')`
  ).run({
    rule_id: v.rule_id,
    rule_name: v.rule_name,
    rule_type: v.rule_type ?? "txn_threshold",
    transaction_id: v.transaction_id,
    group_key: v.group_key ?? null,
    severity: v.severity,
    amount_involved: v.amount_involved,
    merchant_name: v.merchant_name,
    txn_date: v.txn_date ?? "2026-01-15",
  });
}
