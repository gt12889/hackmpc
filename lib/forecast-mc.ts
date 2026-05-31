import { getDb } from "./db";
import { quantile, sampleFromQuantiles, percentiles, mean, coeffVariation } from "./stats";
import type { ForecastInput } from "./forecast";

// In-process Monte Carlo fallback for the probabilistic forecast. Used when the
// numpy sidecar is unreachable (e.g. on Vercel) so the feature works everywhere.
// Produces the SAME shape the sidecar returns, so the route/UI are engine-agnostic.

export type MCResult = {
  category: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
  volatility: number;
  overrun_probability: number;
  projected: number;
};

const NON_OP = `category NOT IN ('Payments & Settlements') AND direction='Debit'`;

/** Run an N-sample Monte Carlo per category from its (multiplier-scaled) monthly
 *  history, returning percentile bands + P(next month > budget). Synchronous and
 *  fast (~10ms for 10k samples × 8 categories). */
export function monteCarloLocal(inputs: ForecastInput[], iterations = 10000): MCResult[] {
  return inputs.map((inp) => {
    const hist = inp.history.map((h) => h.spend * (inp.multiplier || 1)).filter((v) => v >= 0);
    if (hist.length < 2) {
      const only = hist[0] ?? 0;
      return { category: inp.category, p10: only, p25: only, p50: only, p75: only, p90: only, mean: only, volatility: 0, overrun_probability: only > inp.budget ? 1 : 0, projected: only };
    }
    const p10 = quantile(hist, 0.1);
    const p50 = quantile(hist, 0.5);
    const p90 = quantile(hist, 0.9);

    const samples: number[] = new Array(iterations);
    let overrun = 0;
    for (let i = 0; i < iterations; i++) {
      const s = sampleFromQuantiles(p10, p50, p90);
      samples[i] = s;
      if (s > inp.budget) overrun++;
    }
    const bands = percentiles(samples);
    return {
      category: inp.category,
      ...bands,
      mean: Math.round(mean(samples)),
      volatility: Math.round(coeffVariation(hist) * 1000) / 1000,
      overrun_probability: Math.round((overrun / iterations) * 1000) / 1000,
      projected: Math.round(bands.p50),
    };
  });
}

export type SpendFactor = { factor: string; impact: number; description: string };

/** Explainable "why is this category at risk?" — rank the drivers of spend
 *  variance for one category into normalized impact scores (0..1), descending.
 *  Deterministic, computed from the ledger (no LLM). */
export function analyzeSpendFactors(category: string): SpendFactor[] {
  const db = getDb();
  const months = db
    .prepare(`SELECT substr(txn_date,1,7) m, SUM(amount_cad) v FROM transactions WHERE ${NON_OP} AND category=? GROUP BY m ORDER BY m`)
    .all(category) as { m: string; v: number }[];
  const series = months.map((x) => x.v);
  const total = series.reduce((s, v) => s + v, 0) || 1;

  const vendors = db
    .prepare(`SELECT merchant_norm k, SUM(amount_cad) v FROM transactions WHERE ${NON_OP} AND category=? GROUP BY merchant_norm ORDER BY v DESC`)
    .all(category) as { k: string; v: number }[];
  const distinctVendors = vendors.length;
  const topVendorShare = vendors.length ? vendors[0].v / total : 0;

  const usd = (db.prepare(`SELECT SUM(amount_cad) v FROM transactions WHERE ${NON_OP} AND category=? AND country!='CAN'`).get(category) as any)?.v ?? 0;
  const usdShare = usd / total;

  const maxTxn = (db.prepare(`SELECT MAX(amount_cad) v FROM transactions WHERE ${NON_OP} AND category=?`).get(category) as any)?.v ?? 0;
  const largestShare = maxTxn / total;

  // month-over-month trend slope as a fraction of the average month
  const avgMonth = series.length ? total / series.length : 0;
  const slope = series.length > 1 ? (series[series.length - 1] - series[0]) / (series.length - 1) : 0;
  const trendImpact = avgMonth ? Math.min(1, Math.abs(slope) / avgMonth) : 0;

  const factors: SpendFactor[] = [
    {
      factor: "Month-to-month volatility",
      impact: Math.min(1, coeffVariation(series) * 1.4),
      description: `Monthly ${category.toLowerCase()} spend swings ±${Math.round(coeffVariation(series) * 100)}% around its average.`,
    },
    {
      // More fragmented = lower top-vendor concentration = higher impact.
      factor: "Vendor fragmentation",
      impact: distinctVendors > 3 ? Math.min(1, 1 - topVendorShare) : 0,
      description: `${distinctVendors} active vendors${distinctVendors > 5 ? ` (top one only ${Math.round(topVendorShare * 100)}% of spend) — consolidating would cut variance` : ""}.`,
    },
    {
      factor: "Trend pressure",
      impact: trendImpact,
      description: slope >= 0 ? `Spend trending up ~${Math.round((slope / (avgMonth || 1)) * 100)}%/month.` : `Spend trending down ~${Math.round((-slope / (avgMonth || 1)) * 100)}%/month.`,
    },
    {
      factor: "Cross-border / FX exposure",
      impact: Math.min(1, usdShare),
      description: `${Math.round(usdShare * 100)}% of this category is US-denominated (FX-sensitive).`,
    },
    {
      factor: "Single-charge concentration",
      impact: Math.min(1, largestShare * 3),
      description: `Largest single charge is ${Math.round(largestShare * 100)}% of the category total.`,
    },
  ];

  return factors
    .map((f) => ({ ...f, impact: Math.round(f.impact * 100) / 100 }))
    .filter((f) => f.impact > 0.02)
    .sort((a, b) => b.impact - a.impact);
}
