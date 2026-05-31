import { NextResponse } from "next/server";
import { investigateSuspects, getFraudCases } from "@/lib/fraud-investigator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cases: getFraudCases() });
}

// Run the investigator swarm over the top deterministic fraud suspects.
export async function POST() {
  const out = await investigateSuspects();
  return NextResponse.json({ ok: true, ...out, cases: getFraudCases() });
}
