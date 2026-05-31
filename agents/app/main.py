"""Brim It multi-agent orchestration sidecar.

A STATELESS FastAPI + LangGraph service. It never touches the database: the
TypeScript Next.js routes gather context, POST it here, and persist the results
+ per-agent traces themselves. Every endpoint returns {results|insights, traces}.
"""

from fastapi import FastAPI

from .graphs.debate import run_debate
from .schemas import DebateRequest, DebateResponse

app = FastAPI(title="Brim Agents", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "brim-agents"}


@app.post("/debate", response_model=DebateResponse)
def debate(body: DebateRequest) -> DebateResponse:
    results, traces = run_debate(body.requests)
    return DebateResponse(results=results, traces=traces)
