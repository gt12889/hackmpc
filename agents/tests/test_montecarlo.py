from app.montecarlo import run_montecarlo
from app.schemas import MCCategory, MCSeriesPoint


def cat(name, spends, budget, multiplier=1.0):
    return MCCategory(
        category=name,
        history=[MCSeriesPoint(period=f"2025-{i+1:02d}", spend=s) for i, s in enumerate(spends)],
        budget=budget,
        multiplier=multiplier,
    )


def test_percentiles_ordered_and_probability_bounded():
    [r] = run_montecarlo([cat("Fuel", [1000, 1200, 1400, 1600, 1800], budget=1700)], iterations=20000, seed=42)
    assert r.p10 <= r.p25 <= r.p50 <= r.p75 <= r.p90
    assert 0.0 <= r.overrun_probability <= 1.0
    assert r.volatility > 0
    # rising series projected above its 1700 budget → meaningful overrun probability
    assert r.overrun_probability > 0.3


def test_deterministic_with_seed():
    a = run_montecarlo([cat("Fuel", [1000, 1200, 1400, 1600], budget=1500)], iterations=10000, seed=7)
    b = run_montecarlo([cat("Fuel", [1000, 1200, 1400, 1600], budget=1500)], iterations=10000, seed=7)
    assert a[0].overrun_probability == b[0].overrun_probability
    assert a[0].p50 == b[0].p50


def test_multiplier_lowers_overrun_probability():
    base = run_montecarlo([cat("Fuel", [1000, 1200, 1400, 1600, 1800], budget=1700, multiplier=1.0)], seed=42)
    cut = run_montecarlo([cat("Fuel", [1000, 1200, 1400, 1600, 1800], budget=1700, multiplier=0.5)], seed=42)
    assert cut[0].overrun_probability < base[0].overrun_probability


def test_flat_low_series_under_budget_near_zero():
    [r] = run_montecarlo([cat("Office & Admin", [200, 205, 198, 202, 199], budget=600)], iterations=20000, seed=1)
    assert r.overrun_probability < 0.05


def test_single_point_degenerate():
    [r] = run_montecarlo([cat("New", [800], budget=500)], iterations=1000, seed=1)
    assert r.overrun_probability == 1.0  # 800 > 500
    assert r.volatility == 0
