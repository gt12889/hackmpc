import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ notifications: listNotifications(db), unread: unreadCount(db) });
}
