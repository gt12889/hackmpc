import { NextResponse } from "next/server";
import { getReports, getReportsSummary } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ reports: getReports(), summary: getReportsSummary() });
}
