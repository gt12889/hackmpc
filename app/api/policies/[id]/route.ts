import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Toggle enabled / update threshold or severity, then re-scan.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const db = getDb();
  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ["enabled", "threshold_amount", "severity_base", "name", "description"]) {
    if (b[k] !== undefined) {
      fields.push(`${k} = ?`);
      vals.push(b[k]);
    }
  }
  if (fields.length) {
    db.prepare(`UPDATE policy_rules SET ${fields.join(", ")} WHERE id = ?`).run(...vals, id);
  }
  const scan = runScan();
  if (b.ai !== false) await adjustSeverityWithAI();
  return NextResponse.json({ ok: true, scan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  db.prepare(`DELETE FROM violations WHERE rule_id = ?`).run(id);
  db.prepare(`DELETE FROM policy_rules WHERE id = ?`).run(id);
  const scan = runScan();
  await adjustSeverityWithAI();
  return NextResponse.json({ ok: true, scan });
}
