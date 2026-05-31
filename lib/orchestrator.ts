import type Database from "better-sqlite3";
import { getDb } from "./db";

// Persistence + config for multi-agent orchestration. The agent *reasoning* runs
// in the Python LangGraph sidecar (see lib/agent-service.ts); this module owns the
// TS-side concerns: the agent_runs audit trail and the feature flag. Each sidecar
// response carries `traces` (one per role-agent) which we write here for the
// "swarm at work" UI.

export function parseAgentJson<T = any>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through to fragment extraction */
  }
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      /* give up */
    }
  }
  return null;
}

// One role-agent's contribution to a feature run, as returned by the sidecar.
export type AgentTrace = {
  feature: string; // 'approval-debate' | 'fraud-investigator' | 'compliance-swarm' | 'insights-swarm'
  role: string; // 'Prosecutor' | 'Defender' | 'Judge' | 'Investigator' | 'Reviewer:...' | 'Ranker' | ...
  subject_key?: string | null;
  ok: boolean;
  model?: string | null;
  summary?: string | null;
  payload?: unknown;
};

export function recordAgentRun(db: Database.Database, r: AgentTrace): void {
  db.prepare(
    `INSERT INTO agent_runs (feature, role, subject_key, ok, model, summary, payload)
     VALUES (@feature,@role,@subject_key,@ok,@model,@summary,@payload)`
  ).run({
    feature: r.feature,
    role: r.role,
    subject_key: r.subject_key ?? null,
    ok: r.ok ? 1 : 0,
    model: r.model ?? null,
    summary: r.summary ?? null,
    payload: r.payload == null ? null : JSON.stringify(r.payload),
  });
}

/** Persist a batch of traces from one sidecar response. */
export function recordTraces(db: Database.Database, traces: AgentTrace[] | undefined | null): number {
  if (!traces?.length) return 0;
  const tx = db.transaction((rows: AgentTrace[]) => rows.forEach((t) => recordAgentRun(db, t)));
  tx(traces);
  return traces.length;
}

export function getRecentAgentRuns(db: Database.Database = getDb(), limit = 40): any[] {
  return db.prepare(`SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?`).all(limit) as any[];
}

/** Feature flag: when true (default), routes call the Python agent sidecar; set
 *  AGENTS_SWARM_ENABLED=false to use the original single-call AI paths. */
export function swarmEnabled(): boolean {
  return (process.env.AGENTS_SWARM_ENABLED ?? "true") !== "false";
}
