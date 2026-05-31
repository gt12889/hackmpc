import { NextRequest, NextResponse } from "next/server";
import { forecastInputs, applyMultipliers } from "@/lib/forecast";
import { callAgentService } from "@/lib/agent-service";
import { monteCarloLocal, analyzeSpendFactors, type MCResult } from "@/lib/forecast-mc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MCResponse = { results: MCResult[] };

// Probabilistic forecast. Optional body:
//   { multipliers?: Record<category, number> }  ← what-if levers (1.0 = baseline)
// Primary path = the numpy Monte Carlo sidecar (20k iterations). If it's
// unreachable (e.g. on Vercel, where Python can't run), we fall back to an
// in-process TypeScript Monte Carlo that returns the SAME shape — so the
// probabilistic forecast works everywhere. Each result is enriched with the
// top "why is this at risk?" factors (deterministic, no LLM).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const multipliers = (body?.multipliers ?? {}) as Record<string, number>;
  const categories = applyMultipliers(forecastInputs(8), multipliers);

  const res = await callAgentService<MCResponse>("/forecast/montecarlo", { categories, iterations: 20000, seed: 42 });
  const results = res.ok ? res.data.results : monteCarloLocal(categories, 10000);
  const source = res.ok ? "sidecar" : "local";

  const enriched = results.map((r) => ({ ...r, factors: analyzeSpendFactors(r.category).slice(0, 3) }));
  return NextResponse.json({ available: true, source, results: enriched });
}
