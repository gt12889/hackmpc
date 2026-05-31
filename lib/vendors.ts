import { getDb } from "./db";

// Vendor consolidation analysis: where spend is fragmented across many vendors
// in the same category, estimate the savings from consolidating to a primary
// network (volume discount). Fuel is often the prime consolidation candidate.

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

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
