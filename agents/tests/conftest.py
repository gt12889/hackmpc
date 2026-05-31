"""Shared test fixtures: a fake LLM factory that returns canned structured output
based on the requested schema, so graph logic is tested without calling Gemini."""

from typing import Callable

import pytest


def make_fake_factory(responder: Callable[[type], object]) -> Callable[[str], object]:
    """responder(schema) -> a pydantic instance of that schema."""

    class _Structured:
        def __init__(self, schema):
            self._schema = schema

        def invoke(self, _prompt):
            return responder(self._schema)

    class _FakeLLM:
        def with_structured_output(self, schema):
            return _Structured(schema)

    def factory(_model: str):
        return _FakeLLM()

    return factory


@pytest.fixture
def fake_factory():
    return make_fake_factory
