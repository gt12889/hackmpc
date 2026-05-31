import { NextResponse } from "next/server";
import { duplicateCharges, roundNumberCharges, largestCharges, anomalySummary } from "@/lib/anomaly";
import { consolidationOpportunities, topVendors, vendorSummary, vendorTrustMap } from "@/lib/vendors";
import { categoryForecasts, forecastSummary } from "@/lib/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    anomaly: {
      summary: anomalySummary(),
      duplicates: duplicateCharges(12),
      roundNumbers: roundNumberCharges(12),
      largest: largestCharges(10),
    },
    vendors: { summary: vendorSummary(), opportunities: consolidationOpportunities(3), top: topVendors(24), trustByVendor: vendorTrustMap() },
    forecast: { summary: forecastSummary(), categories: categoryForecasts(6) },
  });
}
