import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { placeAlertCall, isVoiceConfigured } from "@/lib/voice-alert";
import type { Notification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isVoiceConfigured()) {
    return NextResponse.json({ ok: false, error: "ElevenLabs/recipient not configured (check .env.local)" }, { status: 400 });
  }
  const db = getDb();
  const sample: Notification = {
    id: 0, alert_key: "test", severity: "critical",
    title: "CRITICAL risk: TEST MERCHANT", body: "$9,000 · Test alert",
    merchant_name: "TEST MERCHANT", amount_involved: 9000, rule_name: "Test alert",
    link: "/compliance", read: 0, call_status: null, call_id: null, call_error: null,
    called_at: null, created_at: new Date().toISOString(),
  };
  const res = await placeAlertCall(db, sample);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
