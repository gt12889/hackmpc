import type DatabaseType from "better-sqlite3";
import { classify, MCC_MAP } from "./mcc-seed";

// Shared transaction ingest — used by both scripts/etl.ts and the in-app upload
// (/api/import). Tolerant of common column-name variants and of dates given as
// Excel serials (the sample xlsx) OR real date strings (a typical CSV export).

const AMOUNT_IS_CAD = true;

export function excelSerialToISO(serial: number): string | null {
  if (serial == null || isNaN(serial)) return null;
  const ms = Math.round(serial) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

function toISODate(v: any): { iso: string | null; serial: number | null } {
  if (v == null || v === "") return { iso: null, serial: null };
  const asNum = typeof v === "number" ? v : /^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : NaN;
  if (!isNaN(asNum) && asNum > 20000 && asNum < 90000) {
    return { iso: excelSerialToISO(asNum), serial: Math.round(asNum) };
  }
  const d = new Date(v);
  if (!isNaN(d.getTime())) return { iso: d.toISOString().slice(0, 10), serial: null };
  return { iso: null, serial: null };
}

function normalizeMerchant(name: string): string {
  return (name || "")
    .toUpperCase()
    .replace(/[*].*$/, "")
    .replace(/#\s*\d+/g, "")
    .replace(/\b\d{3,}\b/g, "")
    .replace(/\b\d{3}-\d{3}-?\d{0,4}\b/g, "")
    .replace(/\s+(INSIDE|OUTSIDE|FUEL|STORE)\b/g, "")
    .replace(/[^A-Z0-9 &'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v: any): number {
  if (v == null || v === "") return NaN;
  return typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
}

// Case-insensitive column resolver with aliases.
function buildPicker(row: any) {
  const map: Record<string, any> = {};
  for (const k of Object.keys(row)) map[k.toLowerCase().trim()] = row[k];
  return (aliases: string[]) => {
    for (const a of aliases) {
      const v = map[a.toLowerCase()];
      if (v != null && v !== "") return v;
    }
    return "";
  };
}

const COLS = {
  code: ["Transaction Code", "Card", "Card Number", "Account", "Card ID"],
  desc: ["Transaction Description", "Description", "Details", "Memo"],
  rawCat: ["Transaction Category", "Category Code"],
  postDate: ["Posting date of transaction", "Posting Date", "Post Date"],
  txnDate: ["Transaction Date", "Date", "Trans Date", "Transaction Day"],
  merchant: ["Merchant Info DBA Name", "Merchant", "Merchant Name", "Payee", "Vendor"],
  amount: ["Transaction Amount", "Amount", "Amount (CAD)", "Amount CAD"],
  drcr: ["Debit or Credit", "Type", "Dr/Cr", "Direction"],
  mcc: ["Merchant Category Code", "MCC", "Category Code (MCC)"],
  city: ["Merchant City", "City"],
  country: ["Merchant Country", "Country"],
  postal: ["Merchant Postal Code", "Postal Code", "Zip", "Zip Code"],
  state: ["Merchant State/Province", "State", "Province", "State/Province"],
  rate: ["Conversion Rate", "FX Rate", "Rate", "Exchange Rate"],
};

export type IngestResult = {
  added: number; // rows inserted this call
  skipped: number; // duplicate rows skipped (append mode)
  count: number; // total transactions in DB after ingest
  cards: number;
  start: string | null;
  end: string | null;
  total: number;
  byCategory: { category: string; n: number; spend: number }[];
};

// Identity of a charge for dedup: card + date + merchant + amount + direction.
function dedupKey(rec: any): string {
  return `${rec.transaction_code}|${rec.txn_date}|${rec.merchant_name}|${rec.amount_cad}|${rec.direction}`;
}

/**
 * Load raw row objects into the DB.
 * - mode "replace" (default): clear + rebuild transactions/cards/MCC map.
 * - mode "append": keep existing data and add the new rows.
 * Summary figures (count/total/range/byCategory) always reflect the WHOLE table.
 */
export function ingestRows(
  db: DatabaseType.Database,
  rows: any[],
  opts: { mode?: "replace" | "append" } = {}
): IngestResult {
  const append = opts.mode === "append";

  if (!append) {
    // Clear in FK-safe order: children that reference transactions/cards first.
    // (policy_rules are preserved — only their violations are cleared.)
    db.exec(`
      DELETE FROM violations;
      DELETE FROM report_line_items;
      DELETE FROM expense_reports;
      DELETE FROM requests;
      DELETE FROM transactions;
      DELETE FROM cards;
      DELETE FROM mcc_category_map;
    `);
  }

  // MCC map is reference data — (re)seed idempotently in either mode.
  const insMcc = db.prepare(
    `INSERT OR REPLACE INTO mcc_category_map (mcc, category, subcategory, description, is_restricted) VALUES (?,?,?,?,?)`
  );
  for (const [mcc, def] of Object.entries(MCC_MAP)) {
    insMcc.run(mcc, def.category, def.subcategory ?? null, def.description, def.restricted ? 1 : 0);
  }

  if (!rows.length) {
    const r = db.prepare(`SELECT MIN(txn_date) a, MAX(txn_date) b, COUNT(*) n, ROUND(SUM(amount_cad)) total FROM transactions`).get() as any;
    const c = db.prepare(`SELECT COUNT(*) n FROM cards`).get() as any;
    return { added: 0, skipped: 0, count: r.n ?? 0, cards: c.n ?? 0, start: r.a, end: r.b, total: r.total ?? 0, byCategory: [] };
  }

  // Cards first (FK target). Append keeps existing cards; replace rebuilds them.
  const cardSet = new Map<string, number>();
  for (const r of rows) {
    const code = String(buildPicker(r)(COLS.code) ?? "").trim() || "UNKNOWN";
    cardSet.set(code, (cardSet.get(code) ?? 0) + 1);
  }
  if (append) {
    const insCard = db.prepare(`INSERT OR IGNORE INTO cards (transaction_code, label, cardholder_alias) VALUES (?,?,?)`);
    for (const [code] of cardSet) insCard.run(code, `Company Card ${code}`, `Card ${code}`);
  } else {
    const insCard = db.prepare(`INSERT OR REPLACE INTO cards (transaction_code, label, cardholder_alias) VALUES (?,?,?)`);
    [...cardSet.entries()].sort((a, b) => b[1] - a[1]).forEach(([code, count], i) => {
      const label = i === 0 ? `Company Card ${code} (primary)` : `Company Card ${code}`;
      const alias = i === 0 ? `Primary · ${code}` : `Card ${code}`;
      insCard.run(code, `${label} — ${count} txns`, alias);
    });
  }

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

  // Dedup (append mode): seed with existing charges, then skip exact repeats —
  // including duplicates within the uploaded file itself.
  const seen = new Set<string>();
  if (append) {
    for (const e of db
      .prepare(`SELECT transaction_code, txn_date, merchant_name, amount_cad, direction FROM transactions`)
      .all() as any[]) {
      seen.add(dedupKey(e));
    }
  }

  let added = 0;
  let skipped = 0;
  const insertAll = db.transaction((records: any[]) => {
    for (const r of records) {
      const p = buildPicker(r);
      const code = String(p(COLS.code) ?? "").trim();
      const merchant = String(p(COLS.merchant) ?? "").trim();
      const mcc = String(p(COLS.mcc) ?? "").trim();
      const country = String(p(COLS.country) ?? "").trim();
      const rate = num(p(COLS.rate));
      const amountOriginal = num(p(COLS.amount));
      const directionRaw = String(p(COLS.drcr) ?? "Debit").trim();
      const isCredit = directionRaw.toLowerCase().startsWith("cred") || directionRaw.toLowerCase() === "cr" || amountOriginal < 0;
      const def = classify(mcc, merchant);

      const currency = country === "CAN" || rate === 0 || isNaN(rate) ? "CAD" : "USD";
      const absAmt = Math.abs(isNaN(amountOriginal) ? 0 : amountOriginal);
      const amountCad = AMOUNT_IS_CAD ? absAmt : absAmt * (rate || 1);
      const signed = isCredit ? -amountCad : amountCad;
      const td = toISODate(p(COLS.txnDate));
      const pd = toISODate(p(COLS.postDate));

      const rec = {
        transaction_code: code || "UNKNOWN",
        description: String(p(COLS.desc) ?? "").trim(),
        raw_category: String(p(COLS.rawCat) ?? "").trim(),
        posting_date: pd.iso,
        txn_date: td.iso,
        txn_serial: td.serial,
        merchant_name: merchant,
        merchant_norm: normalizeMerchant(merchant),
        amount_original: isNaN(amountOriginal) ? 0 : amountOriginal,
        amount_cad: Math.round(amountCad * 100) / 100,
        currency,
        direction: isCredit ? "Credit" : "Debit",
        signed_amount: Math.round(signed * 100) / 100,
        mcc: mcc || null,
        category: def.category,
        subcategory: def.subcategory ?? null,
        merchant_city: String(p(COLS.city) ?? "").trim(),
        country: country || null,
        postal_code: String(p(COLS.postal) ?? "").trim() || null,
        state_province: String(p(COLS.state) ?? "").trim() || null,
        conversion_rate: isNaN(rate) ? null : rate,
        is_cross_border: country && country !== "CAN" ? 1 : 0,
        is_round_number: amountCad >= 1000 && amountCad % 1000 === 0 ? 1 : 0,
      };

      if (append) {
        const k = dedupKey(rec);
        if (seen.has(k)) { skipped++; continue; }
        seen.add(k);
      }
      insTxn.run(rec);
      added++;
    }
  });
  insertAll(rows);

  const range = db.prepare(`SELECT MIN(txn_date) a, MAX(txn_date) b, COUNT(*) n, ROUND(SUM(amount_cad)) total FROM transactions`).get() as any;
  const byCategory = db
    .prepare(`SELECT category, COUNT(*) n, ROUND(SUM(amount_cad)) spend FROM transactions GROUP BY category ORDER BY spend DESC`)
    .all() as any[];
  const totalCards = (db.prepare(`SELECT COUNT(*) n FROM cards`).get() as any).n ?? 0;

  return { added, skipped, count: range.n ?? 0, cards: totalCards, start: range.a, end: range.b, total: range.total ?? 0, byCategory };
}
