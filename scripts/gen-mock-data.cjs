/**
 * Generate mock company-card transactions as a CSV the app's Import button accepts
 * (append mode, deduped). Goal: enrich the demo beyond the real dataset's limits -
 *   - spread spend across MANY cards (the real data is ~98% on one card),
 *   - broaden categories (real data is fuel/permits-heavy),
 *   - seed catchable anomalies (duplicates, round-numbers, a split-charge),
 *   - extend the timeline for richer trends.
 *
 * Columns match lib/ingest.ts aliases. Amount is CAD (AMOUNT_IS_CAD=true).
 * Run:  node scripts/gen-mock-data.cjs   ->  data/mock-append.csv
 */
const fs = require("fs");
const path = require("path");

// ---- knobs ----
const ROWS = 900;
const START = new Date("2025-09-01");
const END = new Date("2026-09-30");

// Cards spread across regions/roles (codes only - the importer keys on the code;
// human cardholder names/departments would need an importer enrichment, noted separately).
const CARDS = [
  { code: "3001", w: 8 }, { code: "3002", w: 6 }, { code: "3003", w: 6 },
  { code: "3004", w: 5 }, { code: "3005", w: 5 }, { code: "3006", w: 4 },
  { code: "4101", w: 4 }, { code: "4102", w: 3 }, { code: "4103", w: 3 },
  { code: "5201", w: 3 }, { code: "5202", w: 2 }, { code: "5203", w: 2 },
];

// category -> { mcc, merchants[], amount range }. MCCs verified present in lib/mcc-seed.ts.
const CATS = [
  { mcc: "5541", w: 8, lo: 70, hi: 620, m: ["LOVE'S", "PILOT", "FLYING J", "SHELL", "CHEVRON", "CIRCLE K", "ESSO", "PETRO-CANADA", "SUNOCO", "MARATHON"] },
  { mcc: "9399", w: 6, lo: 40, hi: 1800, m: ["OKC SIZE & WEIGHTS PER", "AB TRANSP", "TX DMV PERMITS", "ON MTO PERMIT", "OVERSIZE LOAD PERMIT"] },
  { mcc: "7372", w: 5, lo: 19, hi: 2200, m: ["AWS", "GOOGLE CLOUD", "SLACK", "GITHUB", "NOTION", "FIGMA", "ZOOM", "SALESFORCE", "ATLASSIAN", "DATADOG"] },
  { mcc: "5812", w: 5, lo: 9, hi: 140, m: ["CHIPOTLE", "STARBUCKS", "TIM HORTONS", "SUBWAY", "PANERA", "MCDONALD'S", "OLIVE GARDEN"] },
  { mcc: "7011", w: 4, lo: 110, hi: 420, m: ["MARRIOTT", "HILTON", "HOLIDAY INN", "BEST WESTERN", "COMFORT INN", "FAIRMONT"] },
  { mcc: "4511", w: 4, lo: 180, hi: 1300, m: ["DELTA AIR LINES", "UNITED", "AIR CANADA", "WESTJET", "AMERICAN AIRLINES"] },
  { mcc: "4121", w: 4, lo: 12, hi: 320, m: ["UBER", "LYFT", "ENTERPRISE", "HERTZ", "AVIS"] },
  { mcc: "4814", w: 3, lo: 45, hi: 520, m: ["VERIZON", "AT&T", "ROGERS", "BELL", "T-MOBILE"] },
  { mcc: "5111", w: 3, lo: 18, hi: 780, m: ["STAPLES", "AMAZON BUSINESS", "ULINE", "OFFICE DEPOT", "GRAINGER"] },
  { mcc: "4784", w: 2, lo: 6, hi: 90, m: ["E-ZPASS", "407 ETR", "NTTA TOLLS", "PIKEPASS"] },
];

const PLACES = [
  { city: "Dallas", state: "TX", country: "USA" }, { city: "Oklahoma City", state: "OK", country: "USA" },
  { city: "Chicago", state: "IL", country: "USA" }, { city: "Los Angeles", state: "CA", country: "USA" },
  { city: "Atlanta", state: "GA", country: "USA" }, { city: "Phoenix", state: "AZ", country: "USA" },
  { city: "Toronto", state: "ON", country: "CAN" }, { city: "Calgary", state: "AB", country: "CAN" },
  { city: "Montreal", state: "QC", country: "CAN" }, { city: "Vancouver", state: "BC", country: "CAN" },
];

function pickWeighted(arr) {
  const total = arr.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of arr) { if ((r -= x.w) <= 0) return x; }
  return arr[arr.length - 1];
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const money = (lo, hi) => Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
function dateBetween(a, b) {
  const t = a.getTime() + Math.random() * (b.getTime() - a.getTime());
  return new Date(t).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

const rows = [];
function emit({ code, mcc, merchant, amount, date, place, drcr = "Debit", post }) {
  const p = place || pick(PLACES);
  const rate = p.country === "CAN" ? "" : "1.35";
  rows.push({
    Card: code,
    "Transaction Date": date,
    "Posting Date": post || addDays(date, 1),
    Merchant: merchant,
    Amount: amount,
    "Debit or Credit": drcr,
    MCC: mcc,
    "Merchant City": p.city,
    Country: p.country,
    "State/Province": p.state,
    "Conversion Rate": rate,
  });
}

// ---- bulk organic rows ----
for (let i = 0; i < ROWS; i++) {
  const card = pickWeighted(CARDS).code;
  const cat = pickWeighted(CATS);
  emit({ code: card, mcc: cat.mcc, merchant: pick(cat.m), amount: money(cat.lo, cat.hi), date: dateBetween(START, END) });
}

// ---- seeded anomalies (so Insights/Fraud/Compliance have catchable signal) ----
const anomalies = { duplicates: 0, roundNumbers: 0, splitGroups: 0, refunds: 0 };

// 1) Duplicate charges: same card+merchant+amount on 3 different dates (anomaly.duplicateCharges)
for (const dup of [
  { code: "3002", mcc: "7372", merchant: "ZOOM", amount: 499.0 },
  { code: "4101", mcc: "4814", merchant: "VERIZON", amount: 1200.0 },
]) {
  for (const d of ["2026-04-03", "2026-05-03", "2026-06-03"]) {
    emit({ ...dup, date: d, place: pick(PLACES) }); anomalies.duplicates++;
  }
}

// 2) Round-number charges (multiples of 1000 -> is_round_number=1)
for (const amt of [2000, 5000, 10000, 3000]) {
  emit({ code: pick(CARDS).code, mcc: "5111", merchant: "AMAZON BUSINESS", amount: amt, date: dateBetween(START, END) });
  anomalies.roundNumbers++;
}

// 3) Split-charge: same card+merchant+day, each under the $50 pre-auth threshold, summing over it
for (const g of [
  { code: "3004", merchant: "OFFICE DEPOT", date: "2026-04-18", parts: [45.0, 48.5] },
  { code: "3003", merchant: "STAPLES", date: "2026-05-22", parts: [49.0, 47.0, 44.0] },
]) {
  for (const amt of g.parts) emit({ code: g.code, mcc: "5111", merchant: g.merchant, amount: amt, date: g.date });
  anomalies.splitGroups++;
}

// 4) A few credits (refunds) for direction variety
for (let i = 0; i < 6; i++) {
  emit({ code: pick(CARDS).code, mcc: pick(CATS).mcc, merchant: "VENDOR REFUND", amount: money(50, 400), date: dateBetween(START, END), drcr: "Credit" });
  anomalies.refunds++;
}

// ---- write CSV ----
const headers = ["Card", "Transaction Date", "Posting Date", "Merchant", "Amount", "Debit or Credit", "MCC", "Merchant City", "Country", "State/Province", "Conversion Rate"];
const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = [headers.join(",")].concat(rows.map((r) => headers.map((h) => esc(r[h])).join(","))).join("\n") + "\n";

const out = path.join(__dirname, "..", "data", "mock-append.csv");
fs.writeFileSync(out, csv);

// summary
const byCard = {}, byCat = {};
for (const r of rows) { byCard[r.Card] = (byCard[r.Card] || 0) + 1; byCat[r.MCC] = (byCat[r.MCC] || 0) + 1; }
console.log(`Wrote ${rows.length} rows -> ${out}`);
console.log(`Cards: ${Object.keys(byCard).length} | MCCs: ${Object.keys(byCat).length}`);
console.log(`Seeded anomalies:`, anomalies);
console.log(`Date range: ${START.toISOString().slice(0, 10)} .. ${END.toISOString().slice(0, 10)}`);
