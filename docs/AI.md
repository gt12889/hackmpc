# AI Layer

All AI runs through **Google Gemini** (`@google/genai`). Five integrations, all bounded, all routed through a shared client with per-model fallback.

## Shared client + model fallback (`lib/gemini.ts`)

Google's free tier meters quota **per model**, so a single rate-limited model would otherwise break features. `generateWithFallback(ai, params)` retries the same request down a chain of free models on `429`:

```
GEMINI_MODEL (default gemini-2.5-flash) → gemini-2.5-flash-lite → gemini-2.0-flash → gemini-2.0-flash-lite
```

As long as **any** free model has quota, the request succeeds. `getClient()` returns null if no key, so features degrade gracefully (rule-based data still populates).

> **Quota tip:** under tight free limits, set `GEMINI_MODEL=gemini-2.5-flash-lite` in `.env.local` so the chain *starts* with a model that has budget instead of wasting a call on a rate-limited one. Enabling billing removes the limits entirely.

## 1. Agentic chat (`lib/agent.ts` + `lib/tools.ts` + `lib/queries.ts`)

A tool-use loop, **not** a single prompt:
1. System instruction = a "reality primer" (no departments; cards = cost-centers; CAD; settlements excluded; live category/state/date facts).
2. Gemini is given 5 `functionDeclarations`. It picks tools + whitelisted args; **zod validates** before any DB read. The model never writes SQL.
3. Loop (max 5 iterations): tool calls → run prepared queries → feed results back → model answers or calls more tools.
4. Each tool result carries a `suggested_viz` the client auto-renders; the response includes a **lineage trail** of tools called.

Multi-turn works because full history (including tool results) replays each turn.

## 2–4. Batched reasoning passes

Each is **one** Gemini call returning JSON (`responseMimeType: application/json`):

| Pass | File | Output |
|---|---|---|
| Severity triage | `compliance.adjustSeverityWithAI()` | per-violation severity + reasoning (context over rules) |
| Approval recs | `approvals.generateRecommendations()` | approve/deny/review + confidence + reasoning citing budget figures |
| Report summaries | `reports.summarizeReports()` | CFO-ready summary per report |

All are best-effort: on error (e.g. quota) they return 0 and the rule-based data stands. Re-run via the in-page **Re-scan / Rebuild queue / Regenerate** buttons or the seed scripts.

## Configuration

`.env.local`:
```
GEMINI_API_KEY=...          # required for AI features
GEMINI_MODEL=gemini-2.5-flash   # optional; primary model for the fallback chain
```

Get a key at https://aistudio.google.com/apikey. Without a key the app runs fully on rule-based logic; only AI reasoning/summaries are skipped.
