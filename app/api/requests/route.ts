import { NextResponse } from "next/server";
import { getRequests, getApprovalSummary, synthesizeRequests, generateRecommendations } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ requests: getRequests(), summary: getApprovalSummary() });
}

// Rebuild the queue + regenerate AI recommendations.
export async function POST() {
  const n = synthesizeRequests();
  const recs = await generateRecommendations();
  return NextResponse.json({ ok: true, created: n, recommended: recs });
}
