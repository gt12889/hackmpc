"""Insights multi-lens sweep: four lens agents (parallel) → Ranker.

Each lens reads a different slice of the analysis signals and proposes candidate
insights; the Ranker dedupes them and keeps the 5-7 most important. Lenses fan out
from START and the Ranker joins (additive reducers merge candidates + traces).
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Callable

from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from ..llm import make_llm
from ..schemas import AgentTrace, InsightBatch, InsightItem, RankedInsights
from .common import run_agent

FEATURE = "insights-swarm"

# Which signal keys each lens sees, and what it looks for.
_LENSES = {
    "Savings": (["vendors", "topConsolidation", "recurring"], "vendor consolidation and recurring/committed spend you could cut"),
    "Risk": (["anomaly", "dups", "fx"], "duplicate charges, anomalies, and cross-border FX exposure"),
    "Forecast": (["forecast", "risers", "budgets"], "rising categories and budget-overrun risk"),
    "Coverage": (["receipts"], "receipt coverage gaps and controls"),
}

_LINKS = "/insights | /budgets | /receipts | /compliance"


class _State(TypedDict, total=False):
    signals: dict
    candidates: Annotated[list[dict], operator.add]
    insights: list[dict]
    traces: Annotated[list[AgentTrace], operator.add]


def _slice(signals: dict, keys: list[str]) -> dict:
    return {k: signals.get(k) for k in keys if k in signals}


def build_sweep_graph(llm_factory: Callable[[str], object] = make_llm):
    def make_lens(name: str, keys: list[str], focus: str):
        def lens(state: _State) -> dict:
            res, tr = run_agent(
                feature=FEATURE, role=f"Lens:{name}", subject_key="feed",
                instruction=(
                    f"You are the {name} analyst for a small business's company-card spend. From these "
                    f"signals, surface the most important, actionable insights about {focus}. Be specific "
                    "with the dollar figures provided; DO NOT invent numbers. Return "
                    '{"items": [{"title": str, "detail": <1 sentence>, "severity": "high|medium|low", '
                    f'"metric": <short $ or %>, "link": one of [{_LINKS}]}}]}}.'
                ),
                input_obj=_slice(state["signals"], keys), schema=InsightBatch, llm_factory=llm_factory,
            )
            items = [i.model_dump() for i in res.items] if res else []
            return {"candidates": items, "traces": [tr]}

        return lens

    def ranker(state: _State) -> dict:
        candidates = state.get("candidates", [])
        if not candidates:
            return {"insights": [], "traces": []}
        res, tr = run_agent(
            feature=FEATURE, role="Ranker", subject_key="feed",
            instruction=(
                "You are the lead analyst. Given candidate insights from several lenses, dedupe "
                "overlapping ones and keep the 5-7 MOST important and actionable for a finance manager. "
                "Preserve the exact figures; do not invent numbers. Return "
                '{"items": [{"title", "detail", "severity", "metric", "link"}]}.'
            ),
            input_obj={"candidates": candidates}, schema=RankedInsights, llm_factory=llm_factory,
        )
        insights = [i.model_dump() for i in res.items] if res and res.items else candidates
        return {"insights": insights, "traces": [tr]}

    g = StateGraph(_State)
    g.add_node("ranker", ranker)
    for name, (keys, focus) in _LENSES.items():
        node = f"lens_{name.lower()}"
        g.add_node(node, make_lens(name, keys, focus))
        g.add_edge(START, node)
        g.add_edge(node, "ranker")
    g.add_edge("ranker", END)
    return g.compile()


def run_sweep(
    signals: dict[str, Any],
    llm_factory: Callable[[str], object] = make_llm,
) -> tuple[list[InsightItem], list[AgentTrace]]:
    graph = build_sweep_graph(llm_factory)
    out = graph.invoke({"signals": signals, "candidates": [], "traces": []})
    insights = [InsightItem(**i) for i in out.get("insights", [])]
    return insights, out.get("traces", [])
