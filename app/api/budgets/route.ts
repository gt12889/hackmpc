import { NextRequest, NextResponse } from "next/server";
import { getBudgetStatus, setBudget, deleteBudget } from "@/lib/budgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBudgetStatus());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b?.scope_value || b?.limit_amount == null) {
    return NextResponse.json({ error: "scope_value and limit_amount required" }, { status: 400 });
  }
  setBudget(b.scope || "category", String(b.scope_value), Number(b.limit_amount), b.period || "month");
  return NextResponse.json(getBudgetStatus());
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id) deleteBudget(id);
  return NextResponse.json(getBudgetStatus());
}
