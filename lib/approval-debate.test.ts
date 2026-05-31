import { describe, it, expect } from "vitest";
import type Database from "better-sqlite3";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { debateRequests } from "./approval-debate";
import { getRecentAgentRuns } from "./orchestrator";

function seedPendingRequest(db: Database.Database, id = 1) {
  seedTransaction(db, { id, transaction_code: "3001", merchant_name: "BIG FUEL CO", category: "Fuel", amount_cad: 9000 });
  db.prepare(
    `INSERT INTO requests (id, transaction_id, transaction_code, category, merchant_name, amount_cad, reason, status, ai_context)
     VALUES (@id, @id, '3001', 'Fuel', 'BIG FUEL CO', 9000, 'bulk fuel', 'pending', '{}')`
  ).run({ id });
}

function debateResponse(): Response {
  const body = {
    results: [
      { id: 1, recommendation: "approve", confidence: 0.8, reasoning: "budget headroom is ample", prosecutor_case: "risk: large single charge", defender_case: "established fuel vendor" },
    ],
    traces: [
      { feature: "approval-debate", role: "Prosecutor", subject_key: "1", ok: true, model: "fake", summary: "deny" },
      { feature: "approval-debate", role: "Defender", subject_key: "1", ok: true, model: "fake", summary: "approve" },
      { feature: "approval-debate", role: "Judge", subject_key: "1", ok: true, model: "fake", summary: "approve" },
    ],
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("debateRequests", () => {
  it("persists the judge verdict + both cases and records traces", async () => {
    const db = makeTestDb();
    seedPendingRequest(db);
    const fetchImpl = (async () => debateResponse()) as unknown as typeof fetch;

    const out = await debateRequests({ db, fetchImpl });
    expect(out).toEqual({ debated: 1, mode: "debate" });

    const row = db.prepare(`SELECT * FROM requests WHERE id=1`).get() as any;
    expect(row.ai_recommendation).toBe("approve");
    expect(row.ai_confidence).toBe(0.8);
    expect(row.ai_reasoning).toContain("budget headroom");
    const ctx = JSON.parse(row.ai_context);
    expect(ctx.prosecutorCase).toContain("risk");
    expect(ctx.defenderCase).toContain("established");
    expect(ctx.judgeReasoning).toContain("budget headroom");
    expect(ctx.approveCase).toBe(ctx.defenderCase); // back-compat
    expect(ctx.denyCase).toBe(ctx.prosecutorCase);

    expect(getRecentAgentRuns(db).length).toBe(3);
  });

  it("falls back to single-call mode when the sidecar is down (no throw)", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY; // generateRecommendations short-circuits before any DB/network
    delete process.env.GOOGLE_API_KEY;
    try {
      const db = makeTestDb();
      seedPendingRequest(db);
      const fetchImpl = (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch;
      const out = await debateRequests({ db, fetchImpl });
      expect(out.mode).toBe("single");
      const row = db.prepare(`SELECT ai_recommendation FROM requests WHERE id=1`).get() as any;
      expect(row.ai_recommendation).toBeNull(); // not updated by the debate path
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
      if (prevGoogle !== undefined) process.env.GOOGLE_API_KEY = prevGoogle;
    }
  });
});
