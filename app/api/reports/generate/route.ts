import { NextResponse } from "next/server";
import { generateReports, summarizeReports } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const n = generateReports(12);
  const s = await summarizeReports();
  return NextResponse.json({ ok: true, generated: n, summarized: s });
}
