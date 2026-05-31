import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isCallingEnabled, setSetting, ALERTS_CALLING_ENABLED } from "@/lib/settings";
import { isVoiceConfigured } from "@/lib/voice-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ enabled: isCallingEnabled(db), configured: isVoiceConfigured() });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const db = getDb();
  if (typeof b.enabled === "boolean") setSetting(db, ALERTS_CALLING_ENABLED, b.enabled ? "true" : "false");
  return NextResponse.json({ enabled: isCallingEnabled(db), configured: isVoiceConfigured() });
}
