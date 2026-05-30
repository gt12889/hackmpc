import { NextRequest, NextResponse } from "next/server";
import { getReport, setReportStatus } from "@/lib/reports";

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
  return NextResponse.json({ ok: true, report: setReportStatus(Number(id), status) });
}
