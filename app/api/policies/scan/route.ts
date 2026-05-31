import { NextResponse } from "next/server";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";
import { reviewViolationsSwarm } from "@/lib/compliance-swarm";
import { agentsEnabled } from "@/lib/agent-service";
import { getDb } from "@/lib/db";
import { syncFromViolations, HIGH_RISK } from "@/lib/notifications";
import { dispatchAlertCalls } from "@/lib/voice-alert";
import { isCallingEnabled } from "@/lib/settings";
import { anchorRecord, isAnchorConfigured } from "@/lib/solana";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap on-chain anchors per scan so a large violation batch doesn't flood devnet.
const ANCHOR_CAP_PER_SCAN = 5;

// Re-scan all rules, apply AI severity, then sync notifications + place alert calls.
export async function POST() {
  try {
    const scan = runScan();
    // Multi-agent reviewer swarm (domain reviewers → false-positive challenger)
    // when enabled; reviewViolationsSwarm itself falls back to the single call.
    const adjusted = agentsEnabled() ? await reviewViolationsSwarm() : { reviewed: await adjustSeverityWithAI(), mode: "single" as const };

    const db = getDb();
    const created = syncFromViolations(db);
    const calls = await dispatchAlertCalls(db, created, { enabled: isCallingEnabled(db) });

    // Notarize newly-raised HIGH/CRITICAL alerts on Solana (best-effort, capped).
    let anchored = 0;
    if (isAnchorConfigured()) {
      const highRisk = created.filter((n) => HIGH_RISK.has(n.severity)).slice(0, ANCHOR_CAP_PER_SCAN);
      for (const n of highRisk) {
        const res = await anchorRecord({ recordType: "alert", recordId: n.alert_key });
        if (res.status === "confirmed") anchored++;
      }
    }

    return NextResponse.json({
      ok: true,
      scan,
      adjusted,
      notifications: { created: created.length },
      calls,
      anchors: { anchored },
    });
  } catch (e: any) {
    console.error("[/api/policies/scan]", e);
    return NextResponse.json({ ok: false, error: e?.message || "Scan failed" }, { status: 500 });
  }
}
