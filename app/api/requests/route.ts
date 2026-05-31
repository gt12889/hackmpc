import { NextResponse } from "next/server";
import { getRequests, getApprovalSummary, synthesizeRequests, generateRecommendations } from "@/lib/approvals";
import { debateRequests } from "@/lib/approval-debate";
import { agentsEnabled } from "@/lib/agent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ requests: getRequests(), summary: getApprovalSummary() });
}

// Rebuild the queue + regenerate recommendations. When the agent sidecar is
// enabled, requests go through the Prosecutor/Defender/Judge debate; otherwise
// the single-call path. debateRequests itself falls back if the sidecar is down.
export async function POST() {
  const n = synthesizeRequests();
  if (agentsEnabled()) {
    const out = await debateRequests();
    return NextResponse.json({ ok: true, created: n, debated: out.debated, mode: out.mode });
  }
  const recs = await generateRecommendations();
  return NextResponse.json({ ok: true, created: n, recommended: recs, mode: "single" });
}
