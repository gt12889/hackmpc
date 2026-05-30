/**
 * ETL: load the trucking-fleet xlsx into SQLite with normalized, queryable columns.
 *
 * Idempotent for reference/fact data — it DROPs and rebuilds transactions, cards,
 * and mcc_category_map. It never touches user-written policy/requests/reports tables.
 *
 *   npm run etl
 */
import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { classify, MCC_MAP } from "../lib/mcc-seed";

const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, ".data");
const DB_PATH = path.join(DB_DIR, "hackmpc.db");
const XLSX_PATH =
  process.env.HACKMPC_XLSX || path.join(ROOT, "data", "transactions.xlsx");

// Evidence (LOVE'S $1179.09 @ rate 1.376) shows "Transaction Amount" is already
// the billed CAD figure, so amount_cad = amount_original. Flip in 1 line if a
// future file proves otherwise.
const AMOUNT_IS_CAD = true;

function excelSerialToISO(serial: number): string | null {
  if (serial == null || isNaN(serial)) return null;
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Normalize a merchant name for vendor consolidation + split-charge grouping. */
function normalizeMerchant(name: string): string {
  return (name || "")
    .toUpperCase()
    .replace(/[*].*$/, "")        // drop "VCN*..." processor prefixes' tail
    .replace(/#\s*\d+/g, "")      // store numbers: "#0687"
    .replace(/\b\d{3,}\b/g, "")   // long numeric tokens
    .replace(/\b\d{3}-\d{3}-?\d{0,4}\b/g, "") // phone fragments
    .replace(/\s+(INSIDE|OUTSIDE|FUEL|STORE)\b/g, "")
    .replace(/[^A-Z0-9 &'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: any): number {
  if (v == null || v === "") return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
  return n;
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error(`✖ dataset not found at ${XLSX_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(ROOT, "lib", "schema.sql"), "utf-8"));

  // Rebuild reference + fact tables only.
  db.exec("DELETE FROM transactions; DELETE FROM cards; DELETE FROM mcc_category_map;");

  // Seed the MCC map.
  const insMcc = db.prepare(
    `INSERT OR REPLACE INTO mcc_category_map (mcc, category, subcategory, description, is_restricted)
     VALUES (?,?,?,?,?)`
  );
  for (const [mcc, def] of Object.entries(MCC_MAP)) {
    insMcc.run(mcc, def.category, def.subcategory ?? null, def.description, def.restricted ? 1 : 0);
  }

  // Read the workbook.
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  console.log(`• read ${rows.length} rows from ${path.basename(XLSX_PATH)}`);

  // Pre-scan distinct cards and insert them first (transactions FK-reference cards).
  const cardSet = new Map<string, number>();
  for (const r of rows) {
    const code = String(r["Transaction Code"] ?? "").trim() || "UNKNOWN";
    cardSet.set(code, (cardSet.get(code) ?? 0) + 1);
  }
  const insCard = db.prepare(
    `INSERT OR REPLACE INTO cards (transaction_code, label, cardholder_alias) VALUES (?,?,?)`
  );
  const sortedCards = [...cardSet.entries()].sort((a, b) => b[1] - a[1]);
  sortedCards.forEach(([code, count], i) => {
    const label = i === 0 ? `Fleet Card ${code} (primary)` : `Fleet Card ${code}`;
    const alias = i === 0 ? `Primary Fleet · ${code}` : `Unit ${code}`;
    insCard.run(code, `${label} — ${count} txns`, alias);
  });

  const insTxn = db.prepare(`
    INSERT INTO transactions (
      transaction_code, description, raw_category, posting_date, txn_date, txn_serial,
      merchant_name, merchant_norm, amount_original, amount_cad, currency, direction,
      signed_amount, mcc, category, subcategory, merchant_city, country, postal_code,
      state_province, conversion_rate, is_cross_border, is_round_number
    ) VALUES (
      @transaction_code, @description, @raw_category, @posting_date, @txn_date, @txn_serial,
      @merchant_name, @merchant_norm, @amount_original, @amount_cad, @currency, @direction,
      @signed_amount, @mcc, @category, @subcategory, @merchant_city, @country, @postal_code,
      @state_province, @conversion_rate, @is_cross_border, @is_round_number
    )`);

  const insertAll = db.transaction((records: any[]) => {
    for (const r of records) {
      const code = String(r["Transaction Code"] ?? "").trim();
      const merchant = String(r["Merchant Info DBA Name"] ?? "").trim();
      const mcc = String(r["Merchant Category Code"] ?? "").trim();
      const country = String(r["Merchant Country"] ?? "").trim();
      const rate = num(r["Conversion Rate"]);
      const amountOriginal = num(r["Transaction Amount"]);
      const direction = String(r["Debit or Credit"] ?? "Debit").trim();
      const def = classify(mcc, merchant);

      const currency = country === "CAN" || rate === 0 || isNaN(rate) ? "CAD" : "USD";
      const amountCad = isNaN(amountOriginal) ? 0 : AMOUNT_IS_CAD ? amountOriginal : amountOriginal * (rate || 1);
      const signed = direction.toLowerCase().startsWith("cred") ? -amountCad : amountCad;
      const txnSerial = num(r["Transaction Date"]);

      const rec = {
        transaction_code: code || "UNKNOWN",
        description: String(r["Transaction Description"] ?? "").trim(),
        raw_category: String(r["Transaction Category"] ?? "").trim(),
        posting_date: excelSerialToISO(num(r["Posting date of transaction"])),
        txn_date: excelSerialToISO(txnSerial),
        txn_serial: isNaN(txnSerial) ? null : Math.round(txnSerial),
        merchant_name: merchant,
        merchant_norm: normalizeMerchant(merchant),
        amount_original: isNaN(amountOriginal) ? 0 : amountOriginal,
        amount_cad: Math.round(amountCad * 100) / 100,
        currency,
        direction: direction.toLowerCase().startsWith("cred") ? "Credit" : "Debit",
        signed_amount: Math.round(signed * 100) / 100,
        mcc: mcc || null,
        category: def.category,
        subcategory: def.subcategory ?? null,
        merchant_city: String(r["Merchant City"] ?? "").trim(),
        country: country || null,
        postal_code: String(r["Merchant Postal Code"] ?? "").trim() || null,
        state_province: String(r["Merchant State/Province"] ?? "").trim() || null,
        conversion_rate: isNaN(rate) ? null : rate,
        is_cross_border: country && country !== "CAN" ? 1 : 0,
        is_round_number: !isNaN(amountCad) && amountCad >= 1000 && amountCad % 1000 === 0 ? 1 : 0,
      };
      insTxn.run(rec);
    }
  });
  insertAll(rows);

  // ---- Verification summary ----
  const totals = db.prepare(
    `SELECT category, COUNT(*) n, ROUND(SUM(amount_cad)) spend
     FROM transactions GROUP BY category ORDER BY spend DESC`
  ).all() as any[];
  const range = db.prepare(`SELECT MIN(txn_date) a, MAX(txn_date) b, COUNT(*) n, ROUND(SUM(amount_cad)) total FROM transactions`).get() as any;

  console.log(`\n✓ loaded ${range.n} transactions  ${range.a} → ${range.b}  total ${range.total.toLocaleString()} CAD`);
  console.log(`✓ ${cardSet.size} cards, ${Object.keys(MCC_MAP).length} MCCs seeded`);
  console.log("\nSpend by category:");
  for (const t of totals) {
    console.log(`  ${String(t.category).padEnd(22)} ${String(t.n).padStart(5)} txns   ${Number(t.spend).toLocaleString().padStart(12)} CAD`);
  }
  db.close();
}

main();
