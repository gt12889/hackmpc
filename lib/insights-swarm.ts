import type Database from "better-sqlite3";
import { getDb } from "./db";
import { gatherSignals, ruleBasedInsights, setCachedFeed, type Insight } from "./insights-agent";
import { callAgentService } from "./agent-service";
import { recordTraces, recordAgentRun, type AgentTrace } from "./orchestrator";

// Insights multi-lens sweep. Sends the gathered signals to the LangGraph sidecar
// (Savings/Risk/Forecast/Coverage lenses → Ranker) and caches the ranked feed.
// Falls back to the deterministic rule-based insights if the sidecar is down or
// returns nothing.

type SweepResponse = { insights: Insight[]; traces: AgentTrace[] };

export async function generateFeedSwarm(
  deps: { db?: Database.Database; fetchImpl?: typeof fetch; signals?: ReturnType<typeof gatherSignals> } = {}
): Promise<Insight[]> {
  const db = deps.db ?? getDb();
  const signals = deps.signals ?? gatherSignals();
  const fallback = ruleBasedInsights(signals);

  const res = await callAgentService<SweepResponse>("/insights/sweep", { signals }, { fetchImpl: deps.fetchImpl });
  if (!res.ok) {
    // Sidecar down/disabled → rule-based feed. Log the run so the activity
    // feed reflects what happened (the swarm audit trail can't be sidecar-only).
    setCachedFeed(fallback);
    recordAgentRun(db, {
      feature: "insights-swarm",
      role: "Ranker (rule-based)",
      subject_key: "feed",
      ok: true,
      summary: `Ranked ${fallback.length} rule-based insight${fallback.length === 1 ? "" : "s"} (sweep sidecar unavailable).`,
    });
    return fallback;
  }

  // Sidecar answered: persist its traces even if it ranked nothing, then
  // surface its insights (or the rule-based feed when it returned an empty set).
  recordTraces(db, res.data.traces);
  const insights = res.data.insights?.length ? res.data.insights : fallback;
  setCachedFeed(insights);
  return insights;
}
