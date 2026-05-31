"""Brim It multi-agent orchestration sidecar.

A STATELESS FastAPI + LangGraph service. It never touches the database: the
TypeScript Next.js routes gather context, POST it here, and persist the results
+ per-agent traces themselves. Every endpoint returns {results|insights, traces}.
"""

from fastapi import FastAPI

app = FastAPI(title="Brim Agents", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "brim-agents"}
