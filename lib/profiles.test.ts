import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { monthlyCv, cardVolatility } from "./profiles";

describe("monthlyCv", () => {
  it("is 0 for a perfectly steady series", () => {
    expect(monthlyCv([500, 500, 500, 500])).toBe(0);
  });
  it("is higher for a spikier series", () => {
    expect(monthlyCv([100, 2000, 50, 1800])).toBeGreaterThan(monthlyCv([500, 520, 480, 510]));
  });
  it("returns 0 for <2 points or non-positive mean", () => {
    expect(monthlyCv([900])).toBe(0);
    expect(monthlyCv([])).toBe(0);
  });
});

describe("cardVolatility", () => {
  it("scores a steady card lower than a volatile one and ranks vs the median", () => {
    const db = makeTestDb();
    let id = 1;
    // steady card 3001: ~same spend each month
    for (const m of ["2025-01", "2025-02", "2025-03", "2025-04"]) {
      seedTransaction(db, { id: id++, transaction_code: "3001", category: "Fuel", amount_cad: 500, txn_date: `${m}-10` });
    }
    // volatile card 3002: big swings
    const swings = { "2025-01": 100, "2025-02": 3000, "2025-03": 80, "2025-04": 2500 } as Record<string, number>;
    for (const [m, amt] of Object.entries(swings)) {
      seedTransaction(db, { id: id++, transaction_code: "3002", category: "Fuel", amount_cad: amt, txn_date: `${m}-10` });
    }

    const steady = cardVolatility("3001", db);
    const volatile = cardVolatility("3002", db);
    expect(steady.volatility).toBeLessThan(volatile.volatility);
    expect(volatile.vsBaseline).toBeGreaterThanOrEqual(steady.vsBaseline);
  });
});
