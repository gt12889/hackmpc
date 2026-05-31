from app.graphs.fraud import run_investigation
from app.schemas import FraudVerdict
from tests.conftest import make_fake_factory


def responder(schema):
    assert schema is FraudVerdict
    return FraudVerdict(
        verdict="suspicious",
        confidence=0.7,
        narrative="Duplicate charge to the same vendor within minutes.",
        recommended_action="Hold the card and confirm with the driver.",
    )


def test_investigation_produces_a_case_per_suspect():
    factory = make_fake_factory(responder)
    suspects = [
        {"transaction_id": 1, "score": 70, "reasons": ["Duplicate charge (2x)"], "merchant": "ACME"},
        {"transaction_id": 2, "score": 45, "reasons": ["Round-number amount"], "merchant": "BETA"},
    ]
    results, traces = run_investigation(suspects, factory)

    assert {r.transaction_id for r in results} == {1, 2}
    assert all(r.verdict == "suspicious" for r in results)
    assert all(r.recommended_action for r in results)
    assert len(traces) == 2
    assert all(t.role == "Investigator" and t.feature == "fraud-investigator" for t in traces)


def test_invalid_verdict_is_dropped_but_traced():
    def bad(schema):
        return FraudVerdict(verdict="???", confidence=0.1, narrative="n", recommended_action="a")

    factory = make_fake_factory(bad)
    results, traces = run_investigation([{"transaction_id": 9}], factory)
    assert results == []
    assert len(traces) == 1
