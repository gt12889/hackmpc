import type Database from "better-sqlite3";
import { getDb } from "./db";
import { buildRequestPayload, generateRecommendations } from "./approvals";
import { callAgentService } from "./agent-service";
import { recordTraces, recordAgentRun, type AgentTrace } from "./orchestrator";

// Approval debate: send pending requests to the LangGraph sidecar (Prosecutor ‖
// Defender → Judge) and persist the verdict + both advocates' cases. Falls back
// to the single-call generateRecommendations if the sidecar is unreachable.

type DebateResult = {
  id: number;
  recommendation: "approve" | "deny" | "review";
  confidence: number;
  reasoning: string;
  prosecutor_case: string;
  defender_case: string;
};
type DebateResponse = { results: DebateResult[]; traces: AgentTrace[] };

export type DebateOutcome = { debated: number; mode: "debate" | "single" };

export async function debateRequests(
  deps: { db?: Database.Database; fetchImpl?: typeof fetch } = {}
): Promise<DebateOutcome> {
  const db = deps.db ?? getDb();
  const pending = db.prepare(`SELECT * FROM requests WHERE status='pending'`).all() as any[];
  if (!pending.length) return { debated: 0, mode: "debate" };

  const requests = pending.map((r) => buildRequestPayload(db, r));
  const res = await callAgentService<DebateResponse>("/debate", { requests }, { fetchImpl: deps.fetchImpl });

  if (!res.ok) {
    // Sidecar down / disabled → single-call fallback (uses its own getDb()).
    const n = await generateRecommendations();
    recordAgentRun(db, {
      feature: "approval-debate",
      role: "Advisor (single-call)",
      ok: true,
      summary: `Recommended ${n} pending request${n === 1 ? "" : "s"} via single-call fallback (debate sidecar unavailable).`,
    });
    return { debated: n, mode: "single" };
  }

  recordTraces(db, res.data.traces);

  const upd = db.prepare(
    `UPDATE requests SET ai_recommendation=?, ai_confidence=?, ai_reasoning=?, ai_context=? WHERE id=?`
  );
  const byId = new Map(pending.map((r) => [r.id, r]));
  let debated = 0;
  const tx = db.transaction((items: DebateResult[]) => {
    for (const it of items) {
      const row = byId.get(it.id);
      if (!row) continue;
      const ctx = JSON.parse(row.ai_context || "{}");
      ctx.prosecutorCase = it.prosecutor_case;
      ctx.defenderCase = it.defender_case;
      ctx.judgeReasoning = it.reasoning;
      // Back-compat with the existing single-call UI fields.
      ctx.approveCase = it.defender_case;
      ctx.denyCase = it.prosecutor_case;
      upd.run(it.recommendation, Number(it.confidence) || null, it.reasoning ?? null, JSON.stringify(ctx), it.id);
      debated++;
    }
  });
  tx(res.data.results);

  return { debated, mode: "debate" };
}
