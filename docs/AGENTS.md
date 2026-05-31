# Brim Agents — multi-agent orchestration

A **Python LangGraph sidecar** that adds multi-agent reasoning on top of the
single-call AI. Where one Gemini call used to answer alone, a small swarm of
specialized agents now debates, investigates, reviews, or sweeps — and you can
watch them work.

## Why a separate service

The agent *reasoning* is the only part that benefits from a real graph
framework, so it lives in its own process; everything else (UI, routes, DB
writes) stays in TypeScript. Key properties:

- **Stateless.** The sidecar never touches the database. The Next.js routes
  gather context (reusing existing query helpers), POST it, get back
  `{ results, traces }`, and persist everything via `better-sqlite3`.
- **Graceful degradation.** If the sidecar is down, `AGENTS_SWARM_ENABLED=false`,
  or there's no `GEMINI_API_KEY`, every route falls back to the original
  single-call AI path (`generateRecommendations` / `adjustSeverityWithAI` /
  `generateFeed`) or deterministic output. The app never hard-fails on it.
- **Same fallback chain.** `agents/app/llm.py` mirrors `lib/gemini.ts`'s
  per-model 429/404 fallback so a rate-limited model never breaks a run.

```
client → TS route → gather context (existing TS query fns) → POST to sidecar
   → LangGraph runs agents (Gemini) → { results, traces }
   → TS persists results + recordTraces() → respond
   (sidecar unreachable/disabled → TS calls the single-call AI instead)
```

## The four swarms

| Endpoint | Graph | Wired into | Persists |
|---|---|---|---|
| `POST /debate` | Prosecutor ‖ Defender (parallel) → Judge | `/api/requests` POST | `requests.ai_*` + `ai_context.{prosecutorCase,defenderCase,judgeReasoning}` |
| `POST /fraud/investigate` | one Investigator per suspect (fan-out) | `/api/fraud/investigate` | `fraud_cases` table |
| `POST /compliance/review` | domain Reviewers (Send fan-out) → false-positive Challenger | `/api/policies/scan` | `violations.severity/ai_severity/ai_reasoning` |
| `POST /insights/sweep` | 4 lens agents (Savings/Risk/Forecast/Coverage) → Ranker | `/api/insights/feed` POST | insights cache (`setCachedFeed`) |

Every endpoint also returns `traces: [{ feature, role, subject_key, ok, model,
summary, payload }]` — one per role-agent — which the TS side writes to the
`agent_runs` table.

### Debate (approvals)
Replaces the old single call where one model argued *both* sides with itself. A
**Prosecutor** argues deny and a **Defender** argues approve in parallel; a
**Judge** (grounded in `POLICY_SUMMARY`) weighs both and returns
`{recommendation, confidence, reasoning}`. Shown as a two-column debate + judge
verdict on `/workflow` (Approvals).

### Fraud investigator
The deterministic `fraudScan` (in `lib/fraud.ts`) still does the cheap scoring;
the swarm adds the judgment layer — one **Investigator** per suspect reads its
risk signals + card/merchant history and writes a case file
(`{verdict, confidence, narrative, recommended_action}`). Shown atop the score
chips in Insights → Fraud Watch.

### Compliance reviewer + challenger
Violations are partitioned by policy domain (threshold-ducking / restricted /
cross-border / receipts); a **Reviewer** per domain runs in parallel (LangGraph
`Send`), then a skeptical **Challenger** downgrades any critical/high it judges a
false positive one tier. This trims unnecessary `critical`s **before** they
trigger phone alerts (`dispatchAlertCalls` only calls on critical).

### Insights multi-lens sweep
Four **lens** agents each read a slice of the signals and propose candidate
insights; a **Ranker** dedupes and keeps the 5–7 most important. Falls back to
the deterministic `ruleBasedInsights` on failure.

## Watch it work (demo)

The **Agents** tab on `/workflow` has a live visualizer
(`components/agents/agent-swarm-visualizer.tsx`): demo buttons fire the real
endpoint and animate the graph's topology (input → parallel agents →
synthesizer → output) while it runs, then the activity feed
(`components/agents/agent-activity.tsx`, polling `GET /api/agents`) refreshes
with the actual runs. The animation is illustrative, not a literal trace.

## Run it

```bash
cd agents
uv sync                              # Python 3.12 venv + deps (one time)
# from repo root, alongside `npm run dev`:
npm run agents                       # uvicorn on :8200 (--reload)
```

- Reads `GEMINI_API_KEY` from the environment (shared with the app).
- TS reaches it at `AGENT_SERVICE_URL` (default `http://127.0.0.1:8200`) and only
  calls it when `AGENTS_SWARM_ENABLED != false`.
- The app works without it (fallback), so the sidecar is optional to run.

## Test

```bash
cd agents && uv run pytest           # graph logic via a fake LLM — no Gemini calls
npm test                             # TS client + persistence via injected fetch
```

Both sides inject fakes (Python `llm_factory`, TS `fetchImpl`), so the full suite
runs with **no network and no Gemini quota**.

## Layout

```
agents/
  app/
    main.py            # FastAPI: /health + the 4 endpoints
    llm.py             # Gemini model-fallback chain (mirrors lib/gemini.ts)
    policy.py          # POLICY_SUMMARY (mirror of lib/compliance.ts)
    schemas.py         # Pydantic request/response + agent output models
    graphs/
      common.py        # run_agent helper → (result, AgentTrace)
      debate.py        # prosecutor ‖ defender → judge
      fraud.py         # per-suspect investigation
      compliance.py    # domain reviewers (Send) → challenger
      insights.py      # lens agents → ranker
  tests/               # pytest + fake LLM fixture (conftest.py)
```

TS side: `lib/agent-service.ts` (HTTP client, injectable fetch),
`lib/orchestrator.ts` (`agent_runs` audit + `recordTraces` + `swarmEnabled`),
and one wiring module per feature (`lib/approval-debate.ts`,
`lib/fraud-investigator.ts`, `lib/compliance-swarm.ts`, `lib/insights-swarm.ts`).
