import { NextResponse } from "next/server";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";
import { getDb } from "@/lib/db";
import { syncFromViolations } from "@/lib/notifications";
import { dispatchAlertCalls } from "@/lib/voice-alert";
import { isCallingEnabled } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-scan all rules, apply AI severity, then sync notifications + place alert calls.
export async function POST() {
  try {
    const scan = runScan();
    const adjusted = await adjustSeverityWithAI();

    const db = getDb();
    const created = syncFromViolations(db);
    const calls = await dispatchAlertCalls(db, created, { enabled: isCallingEnabled(db) });

    return NextResponse.json({
      ok: true,
      scan,
      adjusted,
      notifications: { created: created.length },
      calls,
    });
  } catch (e: any) {
    console.error("[/api/policies/scan]", e);
    return NextResponse.json({ ok: false, error: e?.message || "Scan failed" }, { status: 500 });
  }
}
