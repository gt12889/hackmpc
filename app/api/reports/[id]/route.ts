import { NextRequest, NextResponse } from "next/server";
import { getReport, setReportStatus } from "@/lib/reports";
import { anchorRecord, isAnchorConfigured } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(Number(id));
  if (!report) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const status = ["draft", "approved", "flagged"].includes(b.status) ? b.status : null;
  if (!status) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const report = setReportStatus(Number(id), status);

  // Notarize CFO sign-off on Solana (best-effort; never blocks the approval).
  let anchor;
  if (status === "approved" && isAnchorConfigured()) {
    anchor = await anchorRecord({ recordType: "report", recordId: id });
  }
  return NextResponse.json({ ok: true, report, anchor });
}
