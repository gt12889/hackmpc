"""Shared helper for graph nodes: run one role-agent and produce its AgentTrace.

Every LLM node in every graph goes through `run_agent`, so traces are uniform and
failures are contained (a failed agent returns (None, trace.ok=False) rather than
raising — the graph keeps going and the TS side still records the attempt)."""

from __future__ import annotations

import json
from typing import Any, Callable

from pydantic import BaseModel

from ..llm import invoke_structured, make_llm
from ..schemas import AgentTrace


def _summarize(result: BaseModel) -> str:
    d = result.model_dump()
    # pick the most human-meaningful field for the one-line summary
    for k in ("recommendation", "verdict", "argument", "reasoning", "narrative", "title"):
        if d.get(k):
            return str(d[k])[:160]
    return json.dumps(d)[:160]


def run_agent(
    *,
    feature: str,
    role: str,
    subject_key: Any,
    instruction: str,
    input_obj: Any,
    schema: type[BaseModel],
    llm_factory: Callable[[str], object] = make_llm,
) -> tuple[BaseModel | None, AgentTrace]:
    prompt = (
        f"You are the {role}. {instruction}\n\n"
        f"Respond with ONLY valid JSON - no prose, no markdown code fences.\n\n"
        f"Input:\n{json.dumps(input_obj, default=str, indent=1)}"
    )
    key = None if subject_key is None else str(subject_key)
    try:
        result, model = invoke_structured(prompt, schema, llm_factory=llm_factory)
        return result, AgentTrace(
            feature=feature, role=role, subject_key=key, ok=True,
            model=model, summary=_summarize(result), payload=result.model_dump(),
        )
    except Exception as e:  # noqa: BLE001 - contained per-agent failure
        return None, AgentTrace(
            feature=feature, role=role, subject_key=key, ok=False,
            summary=str(e)[:160],
        )
