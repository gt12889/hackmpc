import { getClient, generateWithFallback } from "./gemini";
import { anomalySummary, duplicateCharges } from "./anomaly";
import { vendorSummary, consolidationOpportunities } from "./vendors";
import { forecastSummary, categoryForecasts } from "./forecast";
import { recurringSummary } from "./recurring";
import { fxSummary } from "./fx";
import { receiptSummary } from "./receipts";
import { getBudgetStatus } from "./budgets";

// AI Proactive Insights Feed. Aggregates compact signals from every analysis
// module and asks Gemini to rank + narrate the most important findings for a
// finance manager. One bounded call; degrades to rule-based signals on failure.

export type Insight = { title: string; detail: string; severity: "high" | "medium" | "low"; metric?: string; link?: string };

function gatherSignals() {
  const anomaly = anomalySummary();
  const dups = duplicateCharges(3).map((d: any) => ({ merchant: d.merchant_name, amount: d.amount_cad, times: d.occurrences }));
  const vendors = vendorSummary();
  const topConsolidation = consolidationOpportunities(3).slice(0, 2).map((o: any) => ({ category: o.category, vendors: o.vendors, savings: o.estimatedSavings, topShare: o.topVendorShare }));
  const forecast = forecastSummary();
  const risers = categoryForecasts(8).filter((c) => c.trend === "rising").slice(0, 3).map((c) => ({ category: c.category, projected: c.projected, lastValue: c.lastValue }));
  const recurring = recurringSummary();
  const fx = fxSummary();
  const receipts = receiptSummary();
  const budgets = getBudgetStatus().summary;
  return { anomaly, dups, vendors, topConsolidation, forecast, risers, recurring, fx, receipts, budgets };
}

/** Deterministic fallback insights (no AI) - also the input the model ranks. */
function ruleBasedInsights(s: ReturnType<typeof gatherSignals>): Insight[] {
  const out: Insight[] = [];
  if (s.fx.usdShare > 50) out.push({ title: `${s.fx.usdShare}% of spending is cross-border USD`, detail: `$${Math.round(s.fx.usdValue).toLocaleString()} in USD-origin charges; estimated FX cost ~$${Math.round(s.fx.estFxCost).toLocaleString()}.`, severity: "high", metric: `$${Math.round(s.fx.estFxCost).toLocaleString()} FX cost`, link: "/insights" });
  if (s.topConsolidation[0]) { const c = s.topConsolidation[0]; out.push({ title: `${c.category} is fragmented across ${c.vendors} vendors`, detail: `Top vendor is only ${c.topShare}% of spending - consolidating could save ~$${Math.round(c.savings).toLocaleString()}/yr.`, severity: "medium", metric: `$${Math.round(c.savings).toLocaleString()} savings` }); }
  if (s.recurring.count) out.push({ title: `${s.recurring.count} recurring charges = $${Math.round(s.recurring.monthlyCommitted).toLocaleString()}/mo committed`, detail: `$${Math.round(s.recurring.annualized).toLocaleString()}/yr in subscription-like spending.`, severity: "medium", metric: `$${Math.round(s.recurring.monthlyCommitted).toLocaleString()}/mo`, link: "/insights" });
  if (s.risers[0]) out.push({ title: `${s.risers[0].category} spending is rising`, detail: `Projected next month $${Math.round(s.risers[0].projected).toLocaleString()} vs last $${Math.round(s.risers[0].lastValue).toLocaleString()}.`, severity: s.budgets.atRisk ? "high" : "medium", link: "/budgets" });
  if (s.receipts.missing) out.push({ title: `${s.receipts.missing} charges missing a receipt`, detail: `$${Math.round(s.receipts.missingValue).toLocaleString()} of spending over $50 has no receipt on file.`, severity: "medium", metric: `${s.receipts.coveragePct}% coverage`, link: "/receipts" });
  if (s.anomaly.duplicateGroups) out.push({ title: `${s.anomaly.duplicateGroups} duplicate/recurring charge groups`, detail: `$${Math.round(s.anomaly.duplicateExposure).toLocaleString()} potential double-billing exposure.`, severity: "medium", link: "/insights" });
  if (s.budgets.overBudget) out.push({ title: `${s.budgets.overBudget} categories over budget`, detail: `And ${s.budgets.atRisk} more projected to exceed their monthly budget.`, severity: "high", link: "/budgets" });
  return out;
}

let cache: Insight[] | null = null;

export function getCachedFeed(): Insight[] {
  return cache ?? ruleBasedInsights(gatherSignals());
}

export async function generateFeed(): Promise<Insight[]> {
  const signals = gatherSignals();
  const fallback = ruleBasedInsights(signals);
  const ai = getClient();
  if (!ai) { cache = fallback; return fallback; }

  try {
    const { resp } = await generateWithFallback(ai, {
      contents: [{ role: "user", parts: [{ text:
        `You are a finance analyst for a small business's company-card spending. Below are signals from our analysis engines. ` +
        `Pick and rank the 5-7 MOST important, actionable insights for a finance manager. Be specific with the dollar figures provided; do not invent numbers. ` +
        `Return ONLY a JSON array: [{"title": "...", "detail": "1 sentence", "severity": "high|medium|low", "metric": "short $ figure or %", "link": "/insights|/budgets|/receipts|/compliance"}].\n\nSignals:\n` +
        JSON.stringify(signals, null, 1) }] }],
      config: { temperature: 0.3, responseMimeType: "application/json" },
    });
    const parsed = JSON.parse((resp.text || "[]").match(/\[[\s\S]*\]/)?.[0] || "[]");
    if (Array.isArray(parsed) && parsed.length) { cache = parsed; return parsed; }
  } catch (e) {
    console.error("[insights-agent]", e);
  }
  cache = fallback;
  return fallback;
}
