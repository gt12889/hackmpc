import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import {
  recordAgentRun,
  recordTraces,
  getRecentAgentRuns,
  parseAgentJson,
  swarmEnabled,
  type AgentTrace,
} from "./orchestrator";

describe("parseAgentJson", () => {
  it("parses clean JSON and recovers fenced/prose-wrapped JSON", () => {
    expect(parseAgentJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseAgentJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    expect(parseAgentJson("not json")).toBeNull();
    expect(parseAgentJson("")).toBeNull();
  });
});

describe("agent_runs persistence", () => {
  it("records and reads back recent runs (newest first)", () => {
    const db = makeTestDb();
    recordAgentRun(db, { feature: "approval-debate", role: "Prosecutor", subject_key: "7", ok: true, model: "m", summary: "deny case" });
    recordAgentRun(db, { feature: "approval-debate", role: "Judge", subject_key: "7", ok: true, model: "m", summary: "approve", payload: { v: 1 } });
    const rows = getRecentAgentRuns(db, 10);
    expect(rows.length).toBe(2);
    expect(rows[0].role).toBe("Judge"); // newest first
    expect(JSON.parse(rows[0].payload).v).toBe(1);
    expect(rows[1].payload).toBeNull();
  });

  it("recordTraces writes a batch and returns the count", () => {
    const db = makeTestDb();
    const traces: AgentTrace[] = [
      { feature: "fraud-investigator", role: "Investigator", subject_key: "1", ok: true, model: "m" },
      { feature: "fraud-investigator", role: "Investigator", subject_key: "2", ok: false, model: "m" },
    ];
    expect(recordTraces(db, traces)).toBe(2);
    expect(getRecentAgentRuns(db).length).toBe(2);
    expect(recordTraces(db, [])).toBe(0);
    expect(recordTraces(db, undefined)).toBe(0);
  });
});

describe("swarmEnabled", () => {
  it("defaults to true and respects the env flag", () => {
    const prev = process.env.AGENTS_SWARM_ENABLED;
    delete process.env.AGENTS_SWARM_ENABLED;
    expect(swarmEnabled()).toBe(true);
    process.env.AGENTS_SWARM_ENABLED = "false";
    expect(swarmEnabled()).toBe(false);
    process.env.AGENTS_SWARM_ENABLED = "true";
    expect(swarmEnabled()).toBe(true);
    if (prev === undefined) delete process.env.AGENTS_SWARM_ENABLED;
    else process.env.AGENTS_SWARM_ENABLED = prev;
  });
});
