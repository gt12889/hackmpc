from app.graphs.debate import run_debate
from app.schemas import Argument, JudgeVerdict
from tests.conftest import make_fake_factory


def responder(schema):
    if schema is JudgeVerdict:
        return JudgeVerdict(recommendation="approve", confidence=0.8, reasoning="budget headroom is ample")
    if schema is Argument:
        return Argument(argument="canned argument")
    raise AssertionError(f"unexpected schema {schema}")


def test_debate_produces_verdict_and_both_cases():
    factory = make_fake_factory(responder)
    results, traces = run_debate([{"id": 7, "merchant": "BIG FUEL", "amount_cad": 9000}], factory)

    assert len(results) == 1
    r = results[0]
    assert r.id == 7
    assert r.recommendation == "approve"
    assert r.confidence == 0.8
    assert r.prosecutor_case == "canned argument"
    assert r.defender_case == "canned argument"
    assert r.reasoning == "budget headroom is ample"

    # one trace per role
    roles = sorted(t.role for t in traces)
    assert roles == ["Defender", "Judge", "Prosecutor"]
    assert all(t.feature == "approval-debate" for t in traces)
    assert all(t.subject_key == "7" for t in traces)


def test_debate_skips_request_when_judge_fails():
    # Judge returns an invalid recommendation → result dropped, traces still recorded.
    def bad_judge(schema):
        if schema is JudgeVerdict:
            return JudgeVerdict(recommendation="maybe", confidence=0.1, reasoning="unsure")
        return Argument(argument="x")

    factory = make_fake_factory(bad_judge)
    results, traces = run_debate([{"id": 1}], factory)
    assert results == []
    assert len(traces) == 3
