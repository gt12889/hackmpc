import type Database from "better-sqlite3";
import { getClient, generateWithFallback } from "./gemini";
import { getDb } from "./db";

// Reusable multi-agent orchestration over the existing Gemini fallback chain.
// A "role agent" is one bounded, JSON-returning Gemini call cast in a perspective.
// A "swarm" runs role agents concurrently (independent perspectives OR per-item fan-out).
// Everything degrades gracefully: no key / quota-exhausted / parse-fail → ok:false, data:null.

export type AgentSpec = {
  role: string;          // perspective label, e.g. "Prosecutor"
  instruction: string;   // what this agent should do + output shape
  input: unknown;        // the data it reasons over (JSON-serialized into the prompt)
  temperature?: number;  // default 0.3
};

export type AgentOutput<T = any> = {
  role: string;
  ok: boolean;
  data: T | null;
  raw?: string;
  model?: string;
  error?: string;
};

// Injectable for tests — defaults to the real fallback chain.
export type GenerateImpl = (params: any) => Promise<{ resp: any; model: string }>;
// A runner executes one AgentSpec. Swarm features take an injectable runner so tests
// can supply canned agent outputs without touching Gemini.
export type AgentRunner = <T = any>(spec: AgentSpec) => Promise<AgentOutput<T>>;

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

export async function runRoleAgent<T = any>(
  spec: AgentSpec,
  deps: { generateImpl?: GenerateImpl } = {}
): Promise<AgentOutput<T>> {
  const generate =
    deps.generateImpl ??
    (() => {
      const ai = getClient();
      if (!ai) return null;
      return (params: any) => generateWithFallback(ai, params);
    })();

  if (!generate) return { role: spec.role, ok: false, data: null, error: "no-api-key" };

  const prompt = `You are the ${spec.role}. ${spec.instruction}

Respond with ONLY valid JSON — no prose, no markdown code fences.

Input:
${JSON.stringify(spec.input, null, 1)}`;

  try {
    const { resp, model } = await generate({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: spec.temperature ?? 0.3, responseMimeType: "application/json" },
    });
    const text = resp?.text || "";
    const data = parseAgentJson<T>(text);
    return { role: spec.role, ok: data != null, data, raw: text, model };
  } catch (e: any) {
    console.error(`[agent:${spec.role}]`, e);
    return { role: spec.role, ok: false, data: null, error: e?.message || String(e) };
  }
}

/** Run a swarm of agents concurrently; result order matches input order. */
export async function runSwarm<T = any>(
  specs: AgentSpec[],
  deps: { generateImpl?: GenerateImpl } = {}
): Promise<AgentOutput<T>[]> {
  return Promise.all(specs.map((s) => runRoleAgent<T>(s, deps)));
}

export type AgentRunRecord = {
  feature: string;
  role: string;
  subject_key?: string | null;
  ok: boolean;
  model?: string | null;
  summary?: string | null;
  payload?: unknown;
};

export function recordAgentRun(db: Database.Database, r: AgentRunRecord): void {
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

export function getRecentAgentRuns(db: Database.Database = getDb(), limit = 40): any[] {
  return db.prepare(`SELECT * FROM agent_runs ORDER BY id DESC LIMIT ?`).all(limit) as any[];
}

/** Feature flag: swarm orchestration on by default; set AGENTS_SWARM_ENABLED=false to use
 *  the original single-call AI paths (cheaper on free-tier quota; demo can show both). */
export function swarmEnabled(): boolean {
  return (process.env.AGENTS_SWARM_ENABLED ?? "true") !== "false";
}
