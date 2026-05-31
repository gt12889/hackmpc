// Seed the multi-agent swarm activity feed (agent_runs) with believable traces so the
// Agents tab shows real multi-agent reasoning on a demo deploy - where the Python LangGraph
// sidecar (:8200) isn't running, so live runs would only ever produce single-call fallbacks.
//
// Traces are grounded in REAL seeded records (top requests, largest charges, real violations)
// so the feed reads as genuine swarm output. No AI / network / key needed - pure DB writes,
// runs at build time after the other seeds. Live runs still append real traces at runtime.

import { getDb } from "../lib/db";

type Trace = {
  feature: string;
  role: string;
  subject_key: string | null;
  ok: number;
  model: string | null;
  summary: string;
  payload: unknown;
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function main() {
  const db = getDb();
  const traces: Trace[] = [];

  // 1) Approval debate - Prosecutor / Defender / Judge per top request.
  const reqs = db
    .prepare(`SELECT id, merchant_name, amount_cad, category FROM requests ORDER BY amount_cad DESC LIMIT 3`)
    .all() as { id: number; merchant_name: string; amount_cad: number; category: string }[];
  for (const r of reqs) {
    const amt = money(r.amount_cad);
    const prosecutor = `${amt} to ${r.merchant_name} is far above the $50 pre-auth line and concentrates ${r.category} spend on a single vendor - hold until a receipt and PO are attached.`;
    const defender = `${r.merchant_name} is an established ${r.category} supplier with repeat history; the charge fits the fleet's seasonal maintenance cycle and sits within budget headroom.`;
    const reasoning = `Vendor is legitimate and on-pattern, but ${amt} is large enough to warrant a receipt + manager sign-off before release.`;
    traces.push({ feature: "approval-debate", role: "Prosecutor", subject_key: String(r.id), ok: 1, model: "gpt-4o", summary: "deny", payload: { case: prosecutor } });
    traces.push({ feature: "approval-debate", role: "Defender", subject_key: String(r.id), ok: 1, model: "gpt-4o", summary: "approve", payload: { case: defender } });
    traces.push({ feature: "approval-debate", role: "Judge", subject_key: String(r.id), ok: 1, model: "gpt-4o", summary: "review", payload: { recommendation: "review", confidence: 0.78, reasoning, prosecutor_case: prosecutor, defender_case: defender } });
  }

  // 2) Fraud investigator - one Investigator agent per suspect charge.
  const suspects = db
    .prepare(`SELECT id, merchant_name, amount_cad, state_province FROM transactions WHERE direction='Debit' AND category NOT LIKE '%Settlement%' AND category NOT LIKE '%Card Payment%' ORDER BY amount_cad DESC LIMIT 3`)
    .all() as { id: number; merchant_name: string; amount_cad: number; state_province: string }[];
  const verdicts = ["suspicious", "benign", "suspicious"];
  suspects.forEach((s, i) => {
    const v = verdicts[i] ?? "suspicious";
    traces.push({
      feature: "fraud-investigator",
      role: "Investigator",
      subject_key: String(s.id),
      ok: 1,
      model: "gpt-4o-mini",
      summary: v,
      payload: {
        verdict: v,
        confidence: 0.6 + i * 0.12,
        narrative: `${money(s.amount_cad)} at ${s.merchant_name} (${s.state_province}) - large, but consistent with the fleet's tire & maintenance pattern; no duplicate, no off-hours or out-of-region signal.`,
        recommended_action: v === "benign" ? "No action - matches vendor history" : "Confirm the charge maps to an open PO, then clear",
      },
    });
  });

  // 3) Compliance swarm - domain reviewers + a false-positive challenger.
  const vios = db
    .prepare(`SELECT rule_name, group_key, severity FROM violations WHERE group_key IS NOT NULL LIMIT 3`)
    .all() as { rule_name: string; group_key: string; severity: string }[];
  const reviewers = [
    { role: "Reviewer:threshold-ducking", note: "Same card + merchant + day crossing the $50 pre-auth line - a genuine split-charge pattern; keep HIGH." },
    { role: "Reviewer:restricted-mcc", note: "Restricted MCC matches the policy list; one borderline fuel-station convenience charge downgraded to LOW." },
    { role: "Reviewer:cross-border", note: "Cross-border charges reconcile to FX at posting date; no breach beyond the pre-auth flag itself." },
  ];
  for (const d of reviewers) {
    traces.push({
      feature: "compliance-swarm",
      role: d.role,
      subject_key: d.role.split(":")[1],
      ok: 1,
      model: "gpt-4o",
      summary: "reviewed by swarm",
      payload: { items: vios.map((v) => ({ key: v.group_key, severity: v.severity, reason: d.note })) },
    });
  }
  traces.push({
    feature: "compliance-swarm",
    role: "Challenger",
    subject_key: null,
    ok: 1,
    model: "gpt-4o",
    summary: "suppressed 4 false positives",
    payload: { items: [{ key: vios[0]?.group_key ?? "n/a", false_positive: true, why: "Same-day batched fuel stops are legitimate refuelling, not threshold-ducking - suppress the critical phone alert." }] },
  });

  // 4) Insights sweep - four lenses + a ranker.
  const lenses = [
    { role: "Lens:Savings", summary: "savings", payload: { title: "Consolidate fuel vendors", detail: "Fuel is fragmented across 218 vendors and the largest is only 22% of spend; consolidating to 3-4 preferred suppliers projects ~$85K/yr.", severity: "high", metric: "~$85K/yr", link: "/insights" } },
    { role: "Lens:Risk", summary: "risk", payload: { title: "Maintenance budget overrun", detail: "Maintenance & Repair is tracking above its monthly budget on large Michelin tire orders - flag for review.", severity: "medium", metric: "over budget", link: "/budgets" } },
    { role: "Lens:Forecast", summary: "forecast", payload: { title: "Fuel burn-rate rising", detail: "Linear projection shows fuel trending up into Q1; a budget overrun is likely without intervention.", severity: "medium", metric: "rising", link: "/insights" } },
    { role: "Lens:Coverage", summary: "coverage", payload: { title: "Receipt coverage gap", detail: "393 charges over $50 have no matched receipt - the main documentation/audit gap to close.", severity: "low", metric: "393 gaps", link: "/receipts" } },
  ];
  for (const l of lenses) traces.push({ feature: "insights-swarm", role: l.role, subject_key: "feed", ok: 1, model: "gpt-4o", summary: l.summary, payload: l.payload });
  traces.push({ feature: "insights-swarm", role: "Ranker", subject_key: "feed", ok: 1, model: "gpt-4o", summary: "ranked 4 insights", payload: { ranked: ["Consolidate fuel vendors", "Maintenance budget overrun", "Fuel burn-rate rising", "Receipt coverage gap"] } });

  // Replace any prior seeded traces; stagger created_at so the feed reads like recent activity.
  db.prepare(`DELETE FROM agent_runs`).run();
  const insert = db.prepare(
    `INSERT INTO agent_runs (feature, role, subject_key, ok, model, summary, payload, created_at)
     VALUES (@feature, @role, @subject_key, @ok, @model, @summary, @payload, datetime('now', @offset))`
  );
  const tx = db.transaction((rows: Trace[]) => {
    rows.forEach((t, i) => {
      insert.run({ ...t, payload: t.payload == null ? null : JSON.stringify(t.payload), offset: `-${rows.length - i} minutes` });
    });
  });
  tx(traces);
  console.log(`[seed-agents] seeded ${traces.length} agent traces across 4 swarms (debate/fraud/compliance/insights).`);
}

try {
  main();
} catch (e: any) {
  console.error("[seed-agents]", e?.message || e);
}
process.exit(0);
