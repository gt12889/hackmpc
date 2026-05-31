import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AuthRole, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const role = body.role as AuthRole;
  if (role !== "user" && role !== "admin") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const res = NextResponse.json({
    ok: true,
    loggedIn: true,
    role,
    label: role === "admin" ? "Admin" : "Finance User",
  });
  res.cookies.set(AUTH_COOKIE, role, cookieOptions());
  return res;
}
