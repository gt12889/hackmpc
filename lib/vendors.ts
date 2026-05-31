import { getDb } from "./db";

// Vendor consolidation analysis: where spend is fragmented across many vendors
// in the same category, estimate the savings from consolidating to a primary
// network (volume discount). Fuel is often the prime consolidation candidate.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;
export type VendorTrustStatus = "approved" | "watch" | "blocked";

// Assumed negotiated discount from consolidating each category's volume.
const DISCOUNT: Record<string, number> = {
  Fuel: 0.06, // fuel-card network discount (~5-8%)
  "Maintenance & Repair": 0.05,
  Telecom: 0.1,
  "Office & Admin": 0.08,
  Lodging: 0.07,
  "Scales & Wash": 0.04,
};

export function consolidationOpportunities(minVendors = 3) {
  const db = getDb();
  const cats = db
    .prepare(
      `SELECT category, COUNT(DISTINCT merchant_norm) vendors, COUNT(*) txns, ROUND(SUM(amount_cad),2) spend
       FROM transactions WHERE ${NON_OP}
       GROUP BY category HAVING vendors >= ? ORDER BY spend DESC`
    )
    .all(minVendors) as any[];

  return cats.map((c) => {
    const top = db
      .prepare(`SELECT merchant_norm vendor, ROUND(SUM(amount_cad),2) spend, COUNT(*) txns FROM transactions WHERE ${NON_OP} AND category=? GROUP BY merchant_norm ORDER BY spend DESC LIMIT 6`)
      .all(c.category) as any[];
    const rate = DISCOUNT[c.category] ?? 0.05;
    const topShare = top[0] ? Math.round((top[0].spend / c.spend) * 100) : 0;
    return {
      category: c.category,
      vendors: c.vendors,
      txns: c.txns,
      spend: c.spend,
      estimatedSavings: Math.round(c.spend * rate * 100) / 100,
      savingsRate: rate,
      topVendorShare: topShare,
      topVendors: top,
    };
  });
}

export function vendorSummary() {
  const ops = consolidationOpportunities(3);
  const totalSavings = ops.reduce((s, o) => s + o.estimatedSavings, 0);
  const totalVendors = (getDb().prepare(`SELECT COUNT(DISTINCT merchant_norm) n FROM transactions WHERE ${NON_OP}`).get() as any).n;
  return {
    totalVendors,
    fragmentedCategories: ops.length,
    estimatedAnnualSavings: Math.round(totalSavings * 100) / 100,
  };
}

export function topVendors(limit = 24) {
  return getDb()
    .prepare(
      `SELECT merchant_norm vendor_norm,
              MAX(merchant_name) display_name,
              MAX(category) category,
              ROUND(SUM(amount_cad),2) spend_cad,
              COUNT(*) txn_count
       FROM transactions
       WHERE ${NON_OP} AND merchant_norm IS NOT NULL
       GROUP BY merchant_norm
       ORDER BY spend_cad DESC
       LIMIT ?`
    )
    .all(limit) as any[];
}

export function listVendorTrust(limit = 100) {
  return getDb()
    .prepare(`SELECT * FROM vendor_trust ORDER BY updated_at DESC, spend_cad DESC LIMIT ?`)
    .all(limit) as any[];
}

export function vendorTrustMap() {
  const rows = listVendorTrust(500);
  return Object.fromEntries(rows.map((r: any) => [r.vendor_norm, r]));
}

export function getVendorStats(vendorNorm: string) {
  return getDb()
    .prepare(
      `SELECT merchant_norm vendor_norm,
              MAX(merchant_name) display_name,
              MAX(category) category,
              ROUND(SUM(amount_cad),2) spend_cad,
              COUNT(*) txn_count
       FROM transactions
       WHERE ${NON_OP} AND merchant_norm=?
       GROUP BY merchant_norm`
    )
    .get(vendorNorm) as any | undefined;
}

export function setVendorTrust(args: {
  vendorNorm: string;
  displayName?: string;
  status: VendorTrustStatus;
  note?: string | null;
  reviewedBy?: string | null;
}) {
  const stats = getVendorStats(args.vendorNorm);
  const displayName = args.displayName || stats?.display_name || args.vendorNorm;
  const category = stats?.category ?? null;
  const spend = stats?.spend_cad ?? 0;
  const txns = stats?.txn_count ?? 0;

  getDb()
    .prepare(
      `INSERT INTO vendor_trust (vendor_norm, display_name, status, category, note, reviewed_by, spend_cad, txn_count, updated_at)
       VALUES (@vendor_norm, @display_name, @status, @category, @note, @reviewed_by, @spend_cad, @txn_count, datetime('now'))
       ON CONFLICT(vendor_norm) DO UPDATE SET
         display_name=excluded.display_name,
         status=excluded.status,
         category=excluded.category,
         note=excluded.note,
         reviewed_by=excluded.reviewed_by,
         spend_cad=excluded.spend_cad,
         txn_count=excluded.txn_count,
         updated_at=datetime('now')`
    )
    .run({
      vendor_norm: args.vendorNorm,
      display_name: displayName,
      status: args.status,
      category,
      note: args.note ?? null,
      reviewed_by: args.reviewedBy ?? "Finance Manager",
      spend_cad: spend,
      txn_count: txns,
    });

  return getDb().prepare(`SELECT * FROM vendor_trust WHERE vendor_norm=?`).get(args.vendorNorm) as any;
}
