import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { markAllRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  markAllRead(getDb());
  return NextResponse.json({ ok: true });
}
