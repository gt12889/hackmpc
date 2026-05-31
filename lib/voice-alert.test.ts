import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { buildDynamicVars, placeAlertCall, dispatchAlertCalls } from "./voice-alert";
import type { Notification } from "./notifications";

const CONFIG = { apiKey: "k", agentId: "a", phoneNumberId: "p", toNumber: "+15551230000" };

function notif(over: Partial<Notification> = {}): Notification {
  return {
    id: 1, alert_key: "1:txn-1", severity: "critical", title: "CRITICAL risk: MICHELIN TIRE",
    body: "$9,000 · Large charge", merchant_name: "MICHELIN TIRE", amount_involved: 9000,
    rule_name: "Large charge", link: "/compliance", read: 0, call_status: null, call_id: null,
    call_error: null, called_at: null, created_at: "2026-01-15 00:00:00", ...over,
  };
}

describe("buildDynamicVars", () => {
  it("includes the alert fields and a card recent summary", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, merchant_name: "MICHELIN TIRE", amount_cad: 9000, transaction_code: "3001", category: "Maintenance & Repair" });
    seedTransaction(db, { id: 2, merchant_name: "PILOT FUEL", amount_cad: 500, transaction_code: "3001", category: "Fuel" });
    const vars = buildDynamicVars(db, notif());
    expect(vars.severity).toBe("critical");
    expect(vars.merchant).toBe("MICHELIN TIRE");
    expect(vars.amount).toContain("9,000");
    expect(typeof vars.card_recent_summary).toBe("string");
  });
});

describe("placeAlertCall", () => {
  it("POSTs the ElevenLabs outbound-call payload and returns the call id", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ callSid: "CA123", conversation_id: "conv_1" }),
    });
    const res = await placeAlertCall(db, notif(), { config: CONFIG, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(true);
    expect(res.callId).toBe("conv_1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect((init.headers as any)["xi-api-key"]).toBe("k");
    const body = JSON.parse(init.body);
    expect(body.agent_id).toBe("a");
    expect(body.agent_phone_number_id).toBe("p");
    expect(body.to_number).toBe("+15551230000");
    expect(body.conversation_initiation_client_data.dynamic_variables.severity).toBe("critical");
  });

  it("returns ok:false on a non-2xx response", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: "bad" }) });
    const res = await placeAlertCall(db, notif(), { config: CONFIG, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("422");
  });

  it("returns ok:false when fetch throws", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await placeAlertCall(db, notif(), { config: CONFIG, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
  });
});

describe("dispatchAlertCalls", () => {
  it("calls at most 3 critical alerts sequentially and skips the rest (high never calls)", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const created = [
      notif({ id: 1, severity: "critical" }), notif({ id: 2, severity: "critical" }),
      notif({ id: 3, severity: "critical" }), notif({ id: 4, severity: "critical" }),
      notif({ id: 5, severity: "high" }), notif({ id: 6, severity: "medium" }),
    ];
    for (const c of created) db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(c.id, c.alert_key + c.id, c.severity, c.title);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ conversation_id: "c" }) });
    const summary = await dispatchAlertCalls(db, created, { enabled: true, config: CONFIG, fetchImpl: fetchImpl as any });
    expect(summary.called).toBe(3);
    expect(summary.skipped).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("marks all critical disabled when calling is off", async () => {
    const db = makeTestDb();
    const created = [notif({ id: 1, severity: "critical" })];
    db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(1, "k1", "critical", "t");
    const fetchImpl = vi.fn();
    const summary = await dispatchAlertCalls(db, created, { enabled: false, config: CONFIG, fetchImpl: fetchImpl as any });
    expect(summary.called).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    const row = db.prepare("SELECT call_status FROM notifications WHERE id=1").get() as any;
    expect(row.call_status).toBe("disabled");
  });

  it("counts failed calls and records the failed status", async () => {
    const db = makeTestDb();
    const created = [notif({ id: 1, severity: "critical" })];
    db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(1, "kf", "critical", "t");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: "boom" }) });
    const summary = await dispatchAlertCalls(db, created, { enabled: true, config: CONFIG, fetchImpl: fetchImpl as any });
    expect(summary.failed).toBe(1);
    expect(summary.called).toBe(0);
    const row = db.prepare("SELECT call_status FROM notifications WHERE id=1").get() as any;
    expect(row.call_status).toBe("failed");
  });

  it("marks critical unconfigured when credentials are missing", async () => {
    const db = makeTestDb();
    const created = [notif({ id: 1, severity: "critical" })];
    db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(1, "ku", "critical", "t");
    const fetchImpl = vi.fn();
    const summary = await dispatchAlertCalls(db, created, { enabled: true, config: { apiKey: "", agentId: "", phoneNumberId: "", toNumber: "" }, fetchImpl: fetchImpl as any });
    expect(summary.disabled).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    const row = db.prepare("SELECT call_status FROM notifications WHERE id=1").get() as any;
    expect(row.call_status).toBe("unconfigured");
  });
});
