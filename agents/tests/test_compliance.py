from app.graphs.compliance import apply_challenger, partition_by_domain, run_review
from app.schemas import ChallengeBatch, ReviewBatch, ReviewItem, ChallengeItem
from tests.conftest import make_fake_factory


def test_partition_by_domain_routes_rule_types():
    parts = partition_by_domain(
        [
            {"key": "a", "type": "split_charge"},
            {"key": "b", "type": "restricted_mcc"},
            {"key": "c", "type": "cross_border_review"},
            {"key": "d", "type": "missing_receipt"},
            {"key": "e", "type": "something_new"},
        ]
    )
    assert parts["threshold-ducking"][0]["key"] == "a"
    assert parts["restricted"][0]["key"] == "b"
    assert parts["cross-border"][0]["key"] == "c"
    assert parts["receipts"][0]["key"] == "d"
    assert parts["general"][0]["key"] == "e"


def test_apply_challenger_downgrades_only_false_positive_criticals():
    reviews = {
        "a": {"key": "a", "severity": "critical", "reason": "x"},
        "b": {"key": "b", "severity": "high", "reason": "y"},
        "c": {"key": "c", "severity": "medium", "reason": "z"},
    }
    apply_challenger(
        reviews,
        [
            {"key": "a", "false_positive": True, "why": "routine permit batch"},
            {"key": "b", "false_positive": False, "why": ""},
            {"key": "c", "false_positive": True, "why": "n/a"},  # not critical/high → untouched
        ],
    )
    assert reviews["a"]["severity"] == "high"  # critical → high
    assert "challenged" in reviews["a"]["reason"]
    assert reviews["b"]["severity"] == "high"  # not a false positive
    assert reviews["c"]["severity"] == "medium"  # was not critical/high


def test_run_review_end_to_end_single_domain():
    # Both violations in one domain so a single reviewer runs (fake ignores input).
    violations = [
        {"key": "v1", "type": "split_charge", "merchant": "ACME", "base_severity": "high"},
        {"key": "v2", "type": "split_charge", "merchant": "BETA", "base_severity": "medium"},
    ]

    def responder(schema):
        if schema is ReviewBatch:
            return ReviewBatch(items=[
                ReviewItem(key="v1", severity="critical", reason="just under limit"),
                ReviewItem(key="v2", severity="medium", reason="legit"),
            ])
        if schema is ChallengeBatch:
            return ChallengeBatch(items=[ChallengeItem(key="v1", false_positive=True, why="routine vendor")])
        raise AssertionError(schema)

    results, traces = run_review(violations, make_fake_factory(responder))
    by_key = {r.key: r for r in results}
    assert by_key["v1"].severity == "high"  # critical downgraded by challenger
    assert by_key["v2"].severity == "medium"
    roles = sorted(t.role for t in traces)
    assert "Challenger" in roles
    assert any(r.startswith("Reviewer:") for r in roles)
