"""Pydantic I/O models for the sidecar endpoints + agent structured outputs.

`AgentTrace` is the shared shape every endpoint returns (one per role-agent);
the TS side writes each into the agent_runs table for the "swarm at work" feed.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentTrace(BaseModel):
    feature: str
    role: str
    subject_key: str | None = None
    ok: bool
    model: str | None = None
    summary: str | None = None
    payload: Any | None = None


# ---- agent structured outputs (what each LLM node must return) ----

class Argument(BaseModel):
    argument: str


class JudgeVerdict(BaseModel):
    recommendation: str = Field(description="approve | deny | review")
    confidence: float = 0.0
    reasoning: str = ""


# ---- /debate ----

class DebateRequest(BaseModel):
    requests: list[dict[str, Any]]


class DebateResult(BaseModel):
    id: int
    recommendation: str
    confidence: float
    reasoning: str
    prosecutor_case: str
    defender_case: str


class DebateResponse(BaseModel):
    results: list[DebateResult]
    traces: list[AgentTrace]
