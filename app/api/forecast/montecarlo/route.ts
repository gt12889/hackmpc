import { NextRequest, NextResponse } from "next/server";
import { forecastInputs, applyMultipliers } from "@/lib/forecast";
import { callAgentService } from "@/lib/agent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MCResult = {
  category: string;
  p10: number; p25: number; p50: number; p75: number; p90: number;
  mean: number; volatility: number; overrun_probability: number; projected: number;
};
type MCResponse = { results: MCResult[] };

// Probabilistic forecast via the Monte Carlo sidecar. Optional body:
//   { multipliers?: Record<category, number> }  ← what-if levers (1.0 = baseline)
// Degrades gracefully: if the sidecar is unreachable we return { available: false }
// and the UI falls back to the deterministic categoryForecasts() view.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const multipliers = (body?.multipliers ?? {}) as Record<string, number>;
  const categories = applyMultipliers(forecastInputs(8), multipliers);

  const res = await callAgentService<MCResponse>("/forecast/montecarlo", { categories, iterations: 20000, seed: 42 });
  if (!res.ok) return NextResponse.json({ available: false });
  return NextResponse.json({ available: true, results: res.data.results });
}
