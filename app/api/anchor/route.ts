import { NextRequest, NextResponse } from "next/server";
import { anchorRecord, verifyAnchor, listAnchors, isAnchorConfigured, type RecordType } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: RecordType[] = ["report", "request", "alert"];
const isType = (t: unknown): t is RecordType => typeof t === "string" && TYPES.includes(t as RecordType);

// GET /api/anchor                          -> list all anchors (audit page)
// GET /api/anchor?recordType=&recordId=    -> existing anchor + verify (tamper check)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recordType = searchParams.get("recordType");
  const recordId = searchParams.get("recordId");

  if (recordType || recordId) {
    if (!isType(recordType) || !recordId) {
      return NextResponse.json({ error: "recordType (report|request|alert) and recordId required" }, { status: 400 });
    }
    const verify = await verifyAnchor(recordType, recordId);
    return NextResponse.json({ configured: isAnchorConfigured(), verify });
  }

  return NextResponse.json({ configured: isAnchorConfigured(), anchors: listAnchors() });
}

// POST /api/anchor  { recordType, recordId }  -> anchor (or re-anchor) on-chain
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { recordType, recordId } = body || {};
  if (!isType(recordType) || recordId == null) {
    return NextResponse.json({ error: "recordType (report|request|alert) and recordId required" }, { status: 400 });
  }
  const result = await anchorRecord({ recordType, recordId: String(recordId) });
  return NextResponse.json({ anchor: result });
}
