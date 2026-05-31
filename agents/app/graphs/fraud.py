"""Fraud investigator swarm: one Investigator agent per flagged suspect.

The deterministic TS `fraudScan` does the cheap scoring; this graph adds the
expensive judgment layer - each suspect gets an agent that reads its risk
signals + card/merchant context and writes a case file. Suspects are independent,
so each runs through its own graph invocation (the swarm).
"""

from __future__ import annotations

from typing import Any, Callable

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from ..llm import make_llm
from ..schemas import AgentTrace, FraudCase, FraudVerdict
from .common import run_agent

FEATURE = "fraud-investigator"

_INSTRUCTION = (
    "You are a fraud analyst. Given a flagged company-card transaction, its "
    "deterministic risk signals, the card's recent history with this merchant, and "
    "the category's spend norms, decide whether this is fraud. Be concrete and cite "
    "the signals. Return {\"verdict\": \"likely_fraud|suspicious|benign\", "
    "\"confidence\": 0..1, \"narrative\": <2-3 sentences>, \"recommended_action\": <short>}."
)


class _State(TypedDict, total=False):
    suspect: dict
    case: dict
    trace: AgentTrace


def build_investigation_graph(llm_factory: Callable[[str], object] = make_llm):
    def investigator(state: _State) -> dict:
        suspect = state["suspect"]
        res, tr = run_agent(
            feature=FEATURE, role="Investigator", subject_key=suspect.get("transaction_id"),
            instruction=_INSTRUCTION, input_obj=suspect, schema=FraudVerdict, llm_factory=llm_factory,
        )
        return {"case": res.model_dump() if res else {}, "trace": tr}

    g = StateGraph(_State)
    g.add_node("investigator", investigator)
    g.add_edge(START, "investigator")
    g.add_edge("investigator", END)
    return g.compile()


def run_investigation(
    suspects: list[dict[str, Any]],
    llm_factory: Callable[[str], object] = make_llm,
) -> tuple[list[FraudCase], list[AgentTrace]]:
    graph = build_investigation_graph(llm_factory)
    results: list[FraudCase] = []
    traces: list[AgentTrace] = []
    for s in suspects:
        out = graph.invoke({"suspect": s})
        tr = out.get("trace")
        if tr:
            traces.append(tr)
        case = out.get("case") or {}
        verdict = case.get("verdict")
        if verdict in ("likely_fraud", "suspicious", "benign"):
            results.append(
                FraudCase(
                    transaction_id=int(s.get("transaction_id")),
                    verdict=verdict,
                    confidence=float(case.get("confidence") or 0.0),
                    narrative=case.get("narrative", ""),
                    recommended_action=case.get("recommended_action", ""),
                )
            )
    return results, traces
