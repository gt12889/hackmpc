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
from .common import run_agent, safe_int

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
        # Contain per-suspect failures: a bad record or invoke error becomes a
        # failed trace, not a crashed batch.
        try:
            out = graph.invoke({"suspect": s})
            tr = out.get("trace")
            if tr:
                traces.append(tr)
            case = out.get("case") or {}
            verdict = case.get("verdict")
            tid = safe_int(s.get("transaction_id"))
            if tid is not None and verdict in ("likely_fraud", "suspicious", "benign"):
                results.append(
                    FraudCase(
                        transaction_id=tid,
                        verdict=verdict,
                        confidence=_safe_float(case.get("confidence")),
                        narrative=case.get("narrative", ""),
                        recommended_action=case.get("recommended_action", ""),
                    )
                )
        except Exception as e:  # noqa: BLE001 - one suspect must not abort the swarm
            traces.append(AgentTrace(feature=FEATURE, role="Investigator", subject_key=None, ok=False, summary=str(e)[:160]))
    return results, traces


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0
