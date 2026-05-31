import { describe, it, expect } from "vitest";
import { applyMultipliers, type ForecastInput } from "./forecast";

const inputs: ForecastInput[] = [
  { category: "Fuel", history: [{ period: "2025-01", spend: 1000 }], budget: 1100, multiplier: 1 },
  { category: "Telecom", history: [{ period: "2025-01", spend: 500 }], budget: 550, multiplier: 1 },
];

describe("applyMultipliers", () => {
  it("applies a multiplier only to the named category", () => {
    const out = applyMultipliers(inputs, { Fuel: 0.85 });
    expect(out.find((i) => i.category === "Fuel")!.multiplier).toBe(0.85);
    expect(out.find((i) => i.category === "Telecom")!.multiplier).toBe(1);
  });

  it("ignores missing, zero, and negative multipliers", () => {
    const out = applyMultipliers(inputs, { Fuel: 0, Telecom: -1 });
    expect(out.every((i) => i.multiplier === 1)).toBe(true);
  });

  it("defaults to baseline when no multipliers given", () => {
    expect(applyMultipliers(inputs).every((i) => i.multiplier === 1)).toBe(true);
  });
});
