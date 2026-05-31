/**
 * ETL: load the bundled transactions xlsx into SQLite via the shared ingest
 * pipeline (lib/ingest.ts) - the same path the in-app upload uses.
 *
 *   npm run etl
 */
import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { ingestRows } from "../lib/ingest";

const ROOT = process.cwd();
const DB_DIR = process.env.HACKMPC_DB_DIR || path.join(ROOT, ".data");
const DB_PATH = process.env.HACKMPC_DB_PATH || path.join(DB_DIR, "hackmpc.db");
const XLSX_PATH = process.env.HACKMPC_XLSX || path.join(ROOT, "data", "transactions.xlsx");

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

  const wb = XLSX.readFile(XLSX_PATH);
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  console.log(`• read ${rows.length} rows from ${path.basename(XLSX_PATH)}`);

  const r = ingestRows(db, rows);
  console.log(`\n✓ loaded ${r.count} transactions  ${r.start} → ${r.end}  total ${r.total.toLocaleString()} CAD`);
  console.log(`✓ ${r.cards} cards`);
  console.log("\nSpend by category:");
  for (const t of r.byCategory) {
    console.log(`  ${String(t.category).padEnd(22)} ${String(t.n).padStart(5)} txns   ${Number(t.spend).toLocaleString().padStart(12)} CAD`);
  }
  db.close();
}

main();
