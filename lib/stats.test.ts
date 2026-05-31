import { describe, it, expect } from "vitest";
import { quantile, sampleFromQuantiles, percentiles, coeffVariation } from "./stats";

describe("quantile", () => {
  it("interpolates known values", () => {
    const v = [0, 10, 20, 30, 40];
    expect(quantile(v, 0)).toBe(0);
    expect(quantile(v, 1)).toBe(40);
    expect(quantile(v, 0.5)).toBe(20);
  });
  it("handles empty / single", () => {
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([7], 0.9)).toBe(7);
  });
});

describe("sampleFromQuantiles", () => {
  it("draws within tails and centers on p50", () => {
    const p10 = 100, p50 = 200, p90 = 400;
    const N = 20000;
    const s = Array.from({ length: N }, () => sampleFromQuantiles(p10, p50, p90));
    const pc = percentiles(s);
    // median should be close to p50, p10/p90 close to the anchors (±15%)
    expect(Math.abs(pc.p50 - p50) / p50).toBeLessThan(0.15);
    expect(Math.abs(pc.p10 - p10) / p10).toBeLessThan(0.2);
    expect(Math.abs(pc.p90 - p90) / p90).toBeLessThan(0.2);
    // never negative
    expect(Math.min(...s)).toBeGreaterThanOrEqual(0);
    // ascending bands
    expect(pc.p10).toBeLessThanOrEqual(pc.p50);
    expect(pc.p50).toBeLessThanOrEqual(pc.p90);
  });
});

describe("coeffVariation", () => {
  it("is 0 for constant series and positive for variable", () => {
    expect(coeffVariation([5, 5, 5])).toBe(0);
    expect(coeffVariation([1, 5, 9])).toBeGreaterThan(0);
  });
});
