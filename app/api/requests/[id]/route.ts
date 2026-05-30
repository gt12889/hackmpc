import { NextRequest, NextResponse } from "next/server";
import { decideRequest } from "@/lib/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const decision = b.decision === "approved" || b.decision === "denied" ? b.decision : null;
  if (!decision) return NextResponse.json({ error: "decision must be 'approved' or 'denied'" }, { status: 400 });
  const updated = decideRequest(Number(id), decision, b.by || "Finance Manager");
  return NextResponse.json({ ok: true, request: updated });
}
