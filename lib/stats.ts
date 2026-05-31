// Pure statistical helpers for the in-process Monte Carlo fallback (no deps).
// Mirrors the numpy sidecar's math so results are interchangeable.

/** Linear-interpolated quantile of an unsorted numeric array. p in [0,1]. */
export function quantile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = Math.min(Math.max(p, 0), 1) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Sample one value from a distribution defined by its p10/p50/p90 anchors,
 * using piecewise-linear inverse-CDF interpolation (with linear tails). Clamped
 * to >= 0 (spend can't be negative).
 */
export function sampleFromQuantiles(p10: number, p50: number, p90: number): number {
  const u = Math.random();
  let v: number;
  if (u <= 0.1) {
    const p0 = Math.max(0, p10 - (p50 - p10)); // extrapolated lower tail
    v = lerp(p0, p10, u / 0.1);
  } else if (u <= 0.5) {
    v = lerp(p10, p50, (u - 0.1) / 0.4);
  } else if (u <= 0.9) {
    v = lerp(p50, p90, (u - 0.5) / 0.4);
  } else {
    const p100 = p90 + (p90 - p50); // extrapolated upper tail
    v = lerp(p90, p100, (u - 0.9) / 0.1);
  }
  return Math.max(0, v);
}

/** Five-number percentile summary of a sample set. */
export function percentiles(samples: number[]): { p10: number; p25: number; p50: number; p75: number; p90: number } {
  return {
    p10: quantile(samples, 0.1),
    p25: quantile(samples, 0.25),
    p50: quantile(samples, 0.5),
    p75: quantile(samples, 0.75),
    p90: quantile(samples, 0.9),
  };
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Coefficient of variation (stdev / mean) — unitless volatility. */
export function coeffVariation(values: number[]): number {
  const m = mean(values);
  if (!m) return 0;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance) / m;
}
