import { NextRequest, NextResponse } from "next/server";
import { anchorRecord, isAnchorConfigured } from "@/lib/solana";
import {
  listVendorTrust,
  setVendorTrust,
  topVendors,
  vendorTrustMap,
  type VendorTrustStatus,
} from "@/lib/vendors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: VendorTrustStatus[] = ["approved", "watch", "blocked"];

export async function GET() {
  return NextResponse.json({
    configured: isAnchorConfigured(),
    vendors: topVendors(24),
    trust: listVendorTrust(),
    trustByVendor: vendorTrustMap(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const vendorNorm = typeof body.vendorNorm === "string" ? body.vendorNorm.trim() : "";
  const status = body.status as VendorTrustStatus;

  if (!vendorNorm || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "vendorNorm and status (approved|watch|blocked) are required" }, { status: 400 });
  }

  const row = setVendorTrust({
    vendorNorm,
    displayName: typeof body.displayName === "string" ? body.displayName : undefined,
    status,
    note: typeof body.note === "string" ? body.note : null,
    reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy : "Finance Manager",
  });

  const anchor = isAnchorConfigured()
    ? await anchorRecord({ recordType: "vendor", recordId: vendorNorm })
    : { configured: false };

  return NextResponse.json({ ok: true, vendor: row, anchor });
}
