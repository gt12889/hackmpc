import { NextResponse } from "next/server";
import { generateFeed, getCachedFeed } from "@/lib/insights-agent";
import { generateFeedSwarm } from "@/lib/insights-swarm";
import { agentsEnabled } from "@/lib/agent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ feed: getCachedFeed() });
}

// Multi-lens sweep (Savings/Risk/Forecast/Coverage → Ranker) when enabled;
// generateFeedSwarm falls back to rule-based insights if the sidecar is down.
export async function POST() {
  const feed = agentsEnabled() ? await generateFeedSwarm() : await generateFeed();
  return NextResponse.json({ feed });
}
