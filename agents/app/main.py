"""Brim It multi-agent orchestration sidecar.

A STATELESS FastAPI + LangGraph service. It never touches the database: the
TypeScript Next.js routes gather context, POST it here, and persist the results
+ per-agent traces themselves. Every endpoint returns {results|insights, traces}.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .graphs.compliance import run_review
from .graphs.debate import run_debate
from .graphs.fraud import run_investigation
from .graphs.insights import run_sweep
from .schemas import (
    ComplianceRequest,
    ComplianceResponse,
    DebateRequest,
    DebateResponse,
    FraudRequest,
    FraudResponse,
    InsightsRequest,
    InsightsResponse,
)

logger = logging.getLogger("brim-agents")

app = FastAPI(title="Brim Agents", version="0.1.0")


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort safety net: log the failure and return a clean 503 (not a raw
    500 stack). The TS callAgentService treats any non-2xx as `{ ok: false }` and
    falls back to the single-call AI path, so the app never breaks on a sidecar error."""
    logger.exception("sidecar error on %s", request.url.path)
    return JSONResponse(status_code=503, content={"error": str(exc)[:200], "service": "brim-agents"})


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "brim-agents"}


@app.post("/debate", response_model=DebateResponse)
def debate(body: DebateRequest) -> DebateResponse:
    results, traces = run_debate(body.requests)
    return DebateResponse(results=results, traces=traces)


@app.post("/fraud/investigate", response_model=FraudResponse)
def fraud_investigate(body: FraudRequest) -> FraudResponse:
    results, traces = run_investigation(body.suspects)
    return FraudResponse(results=results, traces=traces)


@app.post("/compliance/review", response_model=ComplianceResponse)
def compliance_review(body: ComplianceRequest) -> ComplianceResponse:
    results, traces = run_review(body.violations)
    return ComplianceResponse(results=results, traces=traces)


@app.post("/insights/sweep", response_model=InsightsResponse)
def insights_sweep(body: InsightsRequest) -> InsightsResponse:
    insights, traces = run_sweep(body.signals)
    return InsightsResponse(insights=insights, traces=traces)
