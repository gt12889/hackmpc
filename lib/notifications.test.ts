import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction, seedViolation } from "../test/helpers/db";
import { alertKey, syncFromViolations, listNotifications, unreadCount, markRead } from "./notifications";

function setup() {
  const db = makeTestDb();
  seedTransaction(db, { id: 1, merchant_name: "MICHELIN TIRE", amount_cad: 9000, transaction_code: "3001" });
  seedTransaction(db, { id: 2, merchant_name: "PILOT FUEL", amount_cad: 200, transaction_code: "3001" });
  return db;
}

describe("alertKey", () => {
  it("uses group_key when present, else txn id, and is stable across re-scans", () => {
    expect(alertKey({ rule_id: 5, group_key: "g-abc", transaction_id: 99 })).toBe("5:g-abc");
    expect(alertKey({ rule_id: 5, group_key: null, transaction_id: 1 })).toBe("5:txn-1");
  });
});

describe("syncFromViolations", () => {
  it("creates one notification per distinct open violation", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    const created = syncFromViolations(db);
    expect(created).toHaveLength(1);
    expect(created[0].severity).toBe("high");
    expect(created[0].alert_key).toBe("1:txn-1");
    expect(listNotifications(db).length).toBe(1);
  });

  it("dedupes across re-scans (running twice creates nothing new)", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    expect(syncFromViolations(db)).toHaveLength(1);
    db.prepare("DELETE FROM violations").run();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    expect(syncFromViolations(db)).toHaveLength(0);
    expect(listNotifications(db).length).toBe(1);
  });

  it("tracks unread count and markRead clears it", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "critical", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    const created = syncFromViolations(db);
    expect(unreadCount(db)).toBe(1);
    markRead(db, created[0].id);
    expect(unreadCount(db)).toBe(0);
  });
});
