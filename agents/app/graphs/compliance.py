"""Compliance reviewer swarm: domain Reviewers (parallel) → Challenger.

Violations are partitioned by policy domain; a specialized Reviewer agent judges
each domain's slice in parallel (LangGraph Send fan-out). A skeptical Challenger
then tries to refute the critical/high flags - any it calls a false positive is
downgraded one tier. This trims unnecessary criticals before they trigger phone
alerts (dispatchAlertCalls only calls on 'critical').
"""

from __future__ import annotations

import operator
from collections import defaultdict
from typing import Annotated, Any, Callable

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from typing_extensions import TypedDict

from ..llm import make_llm
from ..policy import POLICY_SUMMARY
from ..schemas import AgentTrace, ChallengeBatch, ReviewBatch, ReviewResult
from .common import run_agent

FEATURE = "compliance-swarm"

# Map a violation rule_type to its review domain.
_DOMAIN = {
    "split_charge": "threshold-ducking",
    "txn_threshold": "threshold-ducking",
    "category_limit": "threshold-ducking",
    "restricted_mcc": "restricted",
    "restricted_merchant": "restricted",
    "no_tickets": "restricted",
    "cross_border_review": "cross-border",
    "missing_receipt": "receipts",
}

_TIER = ["low", "medium", "high", "critical"]

_DOMAIN_GUIDANCE = {
    "threshold-ducking": "Focus on whether amounts look engineered to sit just under an approval limit (genuine evasion → critical/high) vs. legitimate operational batching (→ low/medium).",
    "restricted": "Restricted MCCs, tickets/citations, and restricted merchants are policy breaches; weigh whether the merchant truly matches a restricted category.",
    "cross-border": "Large cross-border charges need pre-auth visibility; an established vendor is high (not critical) unless the amount is anomalous.",
    "receipts": "Missing receipts on material charges are a controls gap; severity scales with amount and how routine the vendor is.",
    "general": "Apply the policy and judge by amount shape and merchant type.",
}


def partition_by_domain(violations: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for v in violations:
        out[_DOMAIN.get(v.get("type"), "general")].append(v)
    return dict(out)


def _downgrade(sev: str) -> str:
    i = _TIER.index(sev) if sev in _TIER else 1
    return _TIER[max(0, i - 1)]


def apply_challenger(reviews: dict[str, dict], challenges: list[dict]) -> dict[str, dict]:
    """Downgrade one tier any critical/high review the challenger calls a false positive."""
    for ch in challenges:
        key = ch.get("key")
        if ch.get("false_positive") and key in reviews and reviews[key]["severity"] in ("critical", "high"):
            reviews[key]["severity"] = _downgrade(reviews[key]["severity"])
            why = ch.get("why")
            if why:
                reviews[key]["reason"] = f"{reviews[key].get('reason', '')} (challenged: {why})".strip()
    return reviews


class _State(TypedDict, total=False):
    violations: list[dict]
    reviews: Annotated[list[dict], operator.add]
    final: list[dict]
    traces: Annotated[list[AgentTrace], operator.add]


def build_review_graph(llm_factory: Callable[[str], object] = make_llm):
    def dispatch(state: _State):
        partitions = partition_by_domain(state["violations"])
        return [Send("reviewer", {"domain": d, "violations": v}) for d, v in partitions.items()]

    def reviewer(payload: dict) -> dict:
        domain = payload["domain"]
        res, tr = run_agent(
            feature=FEATURE, role=f"Reviewer:{domain}", subject_key=domain,
            instruction=(
                POLICY_SUMMARY
                + f"\n\nYou review the '{domain}' domain. {_DOMAIN_GUIDANCE.get(domain, '')}"
                + ' For each flagged item decide the TRUE severity and a one-sentence reason. '
                'Return {"items": [{"key": str, "severity": "critical|high|medium|low", "reason": str}]}.'
            ),
            input_obj={"violations": payload["violations"]}, schema=ReviewBatch, llm_factory=llm_factory,
        )
        items = [i.model_dump() for i in res.items] if res else []
        return {"reviews": items, "traces": [tr]}

    def challenger(state: _State) -> dict:
        reviews = {r["key"]: r for r in state.get("reviews", [])}
        targets = [reviews[k] for k in reviews if reviews[k]["severity"] in ("critical", "high")]
        traces: list[AgentTrace] = []
        if targets:
            res, tr = run_agent(
                feature=FEATURE, role="Challenger", subject_key=None,
                instruction=(
                    "You are a skeptical reviewer. For each flagged item, argue whether it is a "
                    "FALSE POSITIVE given normal SMB operations (recurring permits/fuel/tolls are routine). "
                    'Return {"items": [{"key": str, "false_positive": bool, "why": str}]}.'
                ),
                input_obj={"items": targets}, schema=ChallengeBatch, llm_factory=llm_factory,
            )
            traces.append(tr)
            challenges = [c.model_dump() for c in res.items] if res else []
            apply_challenger(reviews, challenges)
        return {"final": list(reviews.values()), "traces": traces}

    g = StateGraph(_State)
    g.add_node("reviewer", reviewer)
    g.add_node("challenger", challenger)
    g.add_conditional_edges(START, dispatch, ["reviewer"])
    g.add_edge("reviewer", "challenger")
    g.add_edge("challenger", END)
    return g.compile()


def run_review(
    violations: list[dict[str, Any]],
    llm_factory: Callable[[str], object] = make_llm,
) -> tuple[list[ReviewResult], list[AgentTrace]]:
    if not violations:
        return [], []
    graph = build_review_graph(llm_factory)
    out = graph.invoke({"violations": violations, "reviews": [], "traces": []})
    finals = out.get("final", [])
    valid = {"critical", "high", "medium", "low"}
    results = [
        ReviewResult(key=r["key"], severity=r["severity"] if r.get("severity") in valid else "medium", reason=r.get("reason", ""))
        for r in finals
    ]
    return results, out.get("traces", [])
