import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  getRules,
  getViolations,
  getViolationSummary,
  getRepeatOffenders,
  runScan,
  adjustSeverityWithAI,
} from "@/lib/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    rules: getRules(),
    violations: getViolations(),
    summary: getViolationSummary(),
    offenders: getRepeatOffenders(),
  });
}

// Create a new rule, then re-scan.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const db = getDb();
  db.prepare(
    `INSERT INTO policy_rules (name, rule_type, description, threshold_amount, window, scope_category, scope_merchant, severity_base, enabled, policy_clause)
     VALUES (@name,@rule_type,@description,@threshold_amount,@window,@scope_category,@scope_merchant,@severity_base,1,@policy_clause)`
  ).run({
    name: b.name || "Custom Rule",
    rule_type: b.rule_type,
    description: b.description || null,
    threshold_amount: b.threshold_amount ?? null,
    window: b.window ?? null,
    scope_category: b.scope_category ?? null,
    scope_merchant: b.scope_merchant ?? null,
    severity_base: b.severity_base || "medium",
    policy_clause: b.policy_clause ?? null,
  });
  const scan = runScan();
  const useAi = b.ai !== false;
  if (useAi) await adjustSeverityWithAI();
  return NextResponse.json({ ok: true, scan });
}
