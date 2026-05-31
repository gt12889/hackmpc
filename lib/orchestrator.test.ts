import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import {
  runRoleAgent,
  runSwarm,
  recordAgentRun,
  getRecentAgentRuns,
  parseAgentJson,
  swarmEnabled,
} from "./orchestrator";

// Fake generateImpl: returns canned JSON, reports which model "served" it.
function fakeGen(json: unknown) {
  return async () => ({ resp: { text: JSON.stringify(json) }, model: "fake-flash" });
}

describe("parseAgentJson", () => {
  it("parses clean JSON and recovers fenced/prose-wrapped JSON", () => {
    expect(parseAgentJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseAgentJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    expect(parseAgentJson("not json")).toBeNull();
    expect(parseAgentJson("")).toBeNull();
  });
});

describe("runRoleAgent", () => {
  it("returns parsed JSON and ok=true on success", async () => {
    const out = await runRoleAgent(
      { role: "Judge", instruction: "decide", input: { x: 1 } },
      { generateImpl: fakeGen({ verdict: "approve" }) as any }
    );
    expect(out.ok).toBe(true);
    expect(out.data).toEqual({ verdict: "approve" });
    expect(out.model).toBe("fake-flash");
  });

  it("recovers JSON wrapped in prose/fences", async () => {
    const out = await runRoleAgent(
      { role: "X", instruction: "i", input: {} },
      { generateImpl: (async () => ({ resp: { text: '```json\n[{"a":1}]\n```' }, model: "m" })) as any }
    );
    expect(out.data).toEqual([{ a: 1 }]);
  });

  it("returns ok=false (not throw) when the model errors", async () => {
    const out = await runRoleAgent(
      { role: "X", instruction: "i", input: {} },
      {
        generateImpl: (async () => {
          throw new Error("429");
        }) as any,
      }
    );
    expect(out.ok).toBe(false);
    expect(out.data).toBeNull();
  });

  it("returns ok=false when the response is not valid JSON", async () => {
    const out = await runRoleAgent(
      { role: "X", instruction: "i", input: {} },
      { generateImpl: (async () => ({ resp: { text: "sorry, no data" }, model: "m" })) as any }
    );
    expect(out.ok).toBe(false);
    expect(out.data).toBeNull();
  });
});

describe("runSwarm", () => {
  it("runs all agents and preserves order", async () => {
    const outs = await runSwarm(
      [
        { role: "A", instruction: "i", input: {} },
        { role: "B", instruction: "i", input: {} },
      ],
      { generateImpl: fakeGen({ ok: true }) as any }
    );
    expect(outs.map((o) => o.role)).toEqual(["A", "B"]);
    expect(outs.every((o) => o.ok)).toBe(true);
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
