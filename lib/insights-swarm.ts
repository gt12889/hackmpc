import type Database from "better-sqlite3";
import { getDb } from "./db";
import { gatherSignals, ruleBasedInsights, setCachedFeed, type Insight } from "./insights-agent";
import { callAgentService } from "./agent-service";
import { recordTraces, type AgentTrace } from "./orchestrator";

// Insights multi-lens sweep. Sends the gathered signals to the LangGraph sidecar
// (Savings/Risk/Forecast/Coverage lenses → Ranker) and caches the ranked feed.
// Falls back to the deterministic rule-based insights if the sidecar is down or
// returns nothing.

type SweepResponse = { insights: Insight[]; traces: AgentTrace[] };

export async function generateFeedSwarm(
  deps: { db?: Database.Database; fetchImpl?: typeof fetch; signals?: ReturnType<typeof gatherSignals> } = {}
): Promise<Insight[]> {
  const signals = deps.signals ?? gatherSignals();
  const fallback = ruleBasedInsights(signals);

  const res = await callAgentService<SweepResponse>("/insights/sweep", { signals }, { fetchImpl: deps.fetchImpl });
  if (!res.ok || !res.data.insights?.length) {
    setCachedFeed(fallback);
    return fallback;
  }

  recordTraces(deps.db ?? getDb(), res.data.traces);
  setCachedFeed(res.data.insights);
  return res.data.insights;
}
