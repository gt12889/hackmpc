import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { fraudScan, fraudSummary } from "./fraud";

describe("fraudScan", () => {
  it("flags a duplicate charge (same card+merchant+amount twice)", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "ACME", category: "Maintenance & Repair", amount_cad: 900 });
    seedTransaction(db, { id: 2, transaction_code: "3001", merchant_name: "ACME", category: "Maintenance & Repair", amount_cad: 900 });
    const s = fraudScan(20, db);
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.some((x) => x.reasons.some((r) => r.startsWith("Duplicate")))).toBe(true);
  });

  it("flags a just-under-$50 charge", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "X", category: "Office & Admin", amount_cad: 49 });
    const s = fraudScan(20, db);
    expect(s.some((x) => x.reasons.includes("Just under $50 pre-auth"))).toBe(true);
  });

  it("flags a round-number large charge", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "X", category: "Office & Admin", amount_cad: 5000 });
    const s = fraudScan(20, db);
    expect(s.some((x) => x.reasons.includes("Round-number amount"))).toBe(true);
  });

  it("flags a category outlier", () => {
    const db = makeTestDb();
    // many small fuel charges + one huge → outlier
    for (let i = 1; i <= 12; i++) seedTransaction(db, { id: i, transaction_code: "3001", merchant_name: `F${i}`, category: "Fuel", amount_cad: 200 });
    seedTransaction(db, { id: 99, transaction_code: "3001", merchant_name: "BIG", category: "Fuel", amount_cad: 9000 });
    const s = fraudScan(20, db);
    expect(s.some((x) => x.id === 99 && x.reasons.some((r) => r.startsWith("Outlier")))).toBe(true);
  });

  it("does NOT flag a normal single small charge", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "X", category: "Fuel", amount_cad: 137.42 });
    expect(fraudScan(20, db).length).toBe(0);
  });

  it("summary tallies flagged + exposure + a top reason", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001", merchant_name: "X", category: "Office & Admin", amount_cad: 49 });
    seedTransaction(db, { id: 2, transaction_code: "3001", merchant_name: "Y", category: "Office & Admin", amount_cad: 47 });
    const sum = fraudSummary(db);
    expect(sum.flagged).toBeGreaterThanOrEqual(2);
    expect(sum.exposure).toBeGreaterThan(0);
    expect(sum.topReason).toBeTruthy();
  });
});
