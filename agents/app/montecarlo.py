"""Monte Carlo budget-overrun simulation. Pure numpy — NOT agentic (no LLM).

For each category we fit a linear trend over its monthly spend, project the next
month, then draw `iterations` samples around that projection using the series'
own residual volatility. We return percentile outcomes (p10..p90) and the
probability the next month exceeds budget — a distribution, not a point estimate.
The `multiplier` is the what-if lever (e.g. 0.85 = "cut this category 15%").
"""

from __future__ import annotations

import numpy as np

from .schemas import MCCategory, MonteCarloResult


def _round(x: float, n: int = 2) -> float:
    return float(round(float(x), n))


def _simulate(c: MCCategory, iterations: int, seed: int) -> MonteCarloResult:
    y = np.array([p.spend for p in c.history], dtype=float)
    n = len(y)

    if n < 2:
        last = float(y[0]) if n == 1 else 0.0
        projected = max(0.0, last * c.multiplier)
        over = 1.0 if projected > c.budget else 0.0
        return MonteCarloResult(
            category=c.category,
            p10=_round(projected), p25=_round(projected), p50=_round(projected),
            p75=_round(projected), p90=_round(projected),
            mean=_round(projected), volatility=0.0,
            overrun_probability=over, projected=_round(projected),
        )

    x = np.arange(n, dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    trendline = slope * x + intercept
    projected_mean = max(0.0, (slope * n + intercept)) * c.multiplier

    mean_y = float(y.mean())
    residual_std = float(np.std(y - trendline))
    # Avoid a degenerate spike when the series sits exactly on its trend line.
    if residual_std < 1e-9:
        residual_std = 0.15 * mean_y
    volatility = float(np.std(y) / mean_y) if mean_y > 0 else 0.0

    rng = np.random.default_rng(seed)
    draws = np.clip(rng.normal(projected_mean, residual_std, iterations), 0, None)
    p10, p25, p50, p75, p90 = np.percentile(draws, [10, 25, 50, 75, 90])

    return MonteCarloResult(
        category=c.category,
        p10=_round(p10), p25=_round(p25), p50=_round(p50), p75=_round(p75), p90=_round(p90),
        mean=_round(draws.mean()),
        volatility=_round(volatility, 3),
        overrun_probability=_round(float((draws > c.budget).mean()), 3),
        projected=_round(projected_mean),
    )


def run_montecarlo(categories: list[MCCategory], iterations: int = 20000, seed: int = 42) -> list[MonteCarloResult]:
    return [_simulate(c, iterations, seed) for c in categories]
