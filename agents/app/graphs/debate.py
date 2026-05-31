"""Approval debate graph: Prosecutor ‖ Defender (parallel) → Judge.

A real LangGraph StateGraph - the two advocates fan out from START and run
concurrently, then the Judge joins and weighs both. `traces` uses an additive
reducer so the parallel advocates' traces merge cleanly.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from ..llm import make_llm
from ..policy import POLICY_SUMMARY
from ..schemas import AgentTrace, Argument, DebateResult, JudgeVerdict
from .common import run_agent, safe_int

FEATURE = "approval-debate"


class _State(TypedDict, total=False):
    payload: dict
    subject_key: str
    prosecutor: str
    defender: str
    verdict: dict
    traces: Annotated[list[AgentTrace], operator.add]


def build_debate_graph(llm_factory: Callable[[str], object] = make_llm):
    def prosecutor(state: _State) -> dict:
        res, tr = run_agent(
            feature=FEATURE, role="Prosecutor", subject_key=state.get("subject_key"),
            instruction=(
                "Argue to DENY this expense. Cite policy, budget pressure, weak merchant "
                'familiarity, and cross-border risk. Return {"argument": string}.'
            ),
            input_obj=state["payload"], schema=Argument, llm_factory=llm_factory,
        )
        return {"prosecutor": res.argument if res else "", "traces": [tr]}

    def defender(state: _State) -> dict:
        res, tr = run_agent(
            feature=FEATURE, role="Defender", subject_key=state.get("subject_key"),
            instruction=(
                "Argue to APPROVE this expense. Cite legitimate business need, budget "
                "headroom, merchant history, and operational context. Return "
                '{"argument": string}.'
            ),
            input_obj=state["payload"], schema=Argument, llm_factory=llm_factory,
        )
        return {"defender": res.argument if res else "", "traces": [tr]}

    def judge(state: _State) -> dict:
        res, tr = run_agent(
            feature=FEATURE, role="Judge", subject_key=state.get("subject_key"),
            instruction=(
                POLICY_SUMMARY
                + "\n\nWeigh the prosecutor and defender arguments plus the data. Return "
                '{"recommendation": "approve|deny|review", "confidence": 0..1, "reasoning": string}.'
            ),
            input_obj={
                "request": state["payload"],
                "prosecutor_argument": state.get("prosecutor"),
                "defender_argument": state.get("defender"),
            },
            schema=JudgeVerdict, llm_factory=llm_factory,
        )
        return {"verdict": res.model_dump() if res else {}, "traces": [tr]}

    g = StateGraph(_State)
    g.add_node("prosecutor", prosecutor)
    g.add_node("defender", defender)
    g.add_node("judge", judge)
    g.add_edge(START, "prosecutor")
    g.add_edge(START, "defender")
    g.add_edge("prosecutor", "judge")
    g.add_edge("defender", "judge")
    g.add_edge("judge", END)
    return g.compile()


def run_debate(
    requests: list[dict[str, Any]],
    llm_factory: Callable[[str], object] = make_llm,
) -> tuple[list[DebateResult], list[AgentTrace]]:
    graph = build_debate_graph(llm_factory)
    results: list[DebateResult] = []
    traces: list[AgentTrace] = []
    for req in requests:
        # Contain per-request failures so one bad request can't abort the debate batch.
        try:
            payload = dict(req)
            subject_key = str(payload.get("id"))
            out = graph.invoke({"payload": payload, "subject_key": subject_key, "traces": []})
            traces.extend(out.get("traces", []))
            verdict = out.get("verdict") or {}
            rec = verdict.get("recommendation")
            rid = safe_int(payload.get("id"))
            if rid is not None and rec in ("approve", "deny", "review"):
                try:
                    confidence = float(verdict.get("confidence") or 0.0)
                except (TypeError, ValueError):
                    confidence = 0.0
                results.append(
                    DebateResult(
                        id=rid,
                        recommendation=rec,
                        confidence=confidence,
                        reasoning=verdict.get("reasoning", ""),
                        prosecutor_case=out.get("prosecutor", ""),
                        defender_case=out.get("defender", ""),
                    )
                )
        except Exception as e:  # noqa: BLE001 - one request must not abort the batch
            traces.append(AgentTrace(feature=FEATURE, role="Judge", subject_key=None, ok=False, summary=str(e)[:160]))
    return results, traces
