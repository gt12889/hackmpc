import { NextResponse } from "next/server";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-scan all rules and apply the AI contextual severity pass.
export async function POST() {
  const scan = runScan();
  const adjusted = await adjustSeverityWithAI();
  return NextResponse.json({ ok: true, scan, adjusted });
}
