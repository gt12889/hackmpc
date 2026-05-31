from app.graphs.insights import run_sweep
from app.schemas import InsightBatch, InsightItem, RankedInsights
from tests.conftest import make_fake_factory


def test_sweep_returns_ranked_insights_with_lens_and_ranker_traces():
    def responder(schema):
        if schema is RankedInsights:
            return RankedInsights(items=[
                InsightItem(title="Consolidate fuel vendors", detail="Save ~$12k/yr", severity="medium", metric="$12k", link="/insights"),
                InsightItem(title="3 categories over budget", detail="Review", severity="high", metric="3", link="/budgets"),
            ])
        if schema is InsightBatch:
            return InsightBatch(items=[InsightItem(title="lens candidate", detail="d", severity="low")])
        raise AssertionError(schema)

    signals = {"vendors": {}, "anomaly": {}, "forecast": {}, "receipts": {}, "budgets": {}}
    insights, traces = run_sweep(signals, make_fake_factory(responder))

    # the Ranker's curated output is returned (not the raw lens candidates)
    assert len(insights) == 2
    assert insights[0].title == "Consolidate fuel vendors"

    roles = sorted(t.role for t in traces)
    assert "Ranker" in roles
    assert sum(1 for r in roles if r.startswith("Lens:")) == 4  # four lenses ran


def test_sweep_falls_back_to_candidates_when_ranker_empty():
    def responder(schema):
        if schema is RankedInsights:
            return RankedInsights(items=[])  # ranker yields nothing
        return InsightBatch(items=[InsightItem(title="candidate", detail="d", severity="low")])

    insights, _ = run_sweep({"vendors": {}}, make_fake_factory(responder))
    assert len(insights) >= 1  # candidates surfaced instead of empty
