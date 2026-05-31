import { NextResponse } from "next/server";
import { getRecentAgentRuns } from "@/lib/orchestrator";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recent multi-agent orchestration runs — the "swarm at work" feed.
export async function GET() {
  return NextResponse.json({ runs: getRecentAgentRuns(getDb(), 40) });
}
