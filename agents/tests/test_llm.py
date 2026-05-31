from pydantic import BaseModel

from app.llm import invoke_structured, should_try_next


class Verdict(BaseModel):
    recommendation: str
    confidence: float


class _Structured:
    def __init__(self, result):
        self._result = result

    def invoke(self, _prompt):
        return self._result


class _FakeLLM:
    """Stub matching the langchain ChatModel surface we use."""

    def __init__(self, result):
        self._result = result

    def with_structured_output(self, _schema):
        return _Structured(self._result)


def test_returns_structured_result_and_model():
    def factory(model):
        return _FakeLLM(Verdict(recommendation="approve", confidence=0.9))

    result, model = invoke_structured(
        "decide", Verdict, llm_factory=factory, models=["m1", "m2"]
    )
    assert isinstance(result, Verdict)
    assert result.recommendation == "approve"
    assert model == "m1"


def test_falls_back_to_next_model_on_quota():
    calls: list[str] = []

    def factory(model):
        calls.append(model)
        if model == "m1":
            raise RuntimeError("429 RESOURCE_EXHAUSTED")
        return _FakeLLM(Verdict(recommendation="deny", confidence=0.5))

    result, model = invoke_structured(
        "decide", Verdict, llm_factory=factory, models=["m1", "m2"]
    )
    assert model == "m2"
    assert result.recommendation == "deny"
    assert calls == ["m1", "m2"]


def test_raises_real_errors_immediately():
    def factory(model):
        raise ValueError("malformed prompt")

    try:
        invoke_structured("x", Verdict, llm_factory=factory, models=["m1", "m2"])
    except ValueError as e:
        assert "malformed" in str(e)
    else:  # pragma: no cover
        raise AssertionError("expected ValueError to surface")


def test_should_try_next_classifies_quota_and_notfound():
    assert should_try_next(RuntimeError("429 RESOURCE_EXHAUSTED")) is True
    assert should_try_next(RuntimeError("404 NOT_FOUND")) is True
    assert should_try_next(RuntimeError("model is not found")) is True
    assert should_try_next(ValueError("bad request")) is False
