import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { markRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  markRead(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
