# Brim Agents — LangGraph orchestration sidecar

Stateless FastAPI + LangGraph service powering Brim It's multi-agent features
(approval debate, fraud investigation, compliance review, insights sweep).

It **never touches the database**. The Next.js app gathers context, POSTs it
here, receives `{ results, traces }`, and persists everything itself. If this
service isn't running, the app degrades gracefully to its single-call AI paths.

## Setup

```bash
cd agents
uv sync            # creates .venv with Python 3.12 + deps
```

## Run

```bash
# from repo root:
npm run agents     # uvicorn on :8200 (--reload)
# or directly:
cd agents && uv run uvicorn app.main:app --port 8200 --reload
```

## Env

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) — shared with the Next.js app.
- The Next.js app reaches this service at `AGENT_SERVICE_URL` (default
  `http://127.0.0.1:8200`) and only calls it when `AGENTS_SWARM_ENABLED != false`.

## Test

```bash
cd agents && uv run pytest      # graph logic via a fake LLM — no Gemini calls
```

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok }` |
| POST | `/debate` | `{ requests: [...] }` | `{ results, traces }` |
| POST | `/fraud/investigate` | `{ suspects: [...] }` | `{ results, traces }` |
| POST | `/compliance/review` | `{ violations: [...] }` | `{ results, traces }` |
| POST | `/insights/sweep` | `{ signals: {...} }` | `{ insights, traces }` |
