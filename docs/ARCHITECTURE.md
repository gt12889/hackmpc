# Architecture

Brim It is a single-process Next.js 15 (App Router) application over a local SQLite database, with a Google Gemini AI layer layered on top of a fully deterministic analytics core. The guiding principle is **deterministic core, AI augmentation**: every number the product shows is computed by parameterized SQL against real data, and the language model is used only for things models are good at (turning a sentence into a query, judging context, writing prose). The model never has direct database access and never emits raw SQL.

This document explains how the pieces fit, how a request flows end to end, and why the system is designed the way it is.

---

## 1. System overview

```
                              ┌──────────────────────────────────────────────┐
                              │            Next.js 15 process (Node)          │
  data/transactions.xlsx ─┐   │                                              │
  CSV / XLSX upload ───────┼──▶│  lib/ingest.ts ──▶ SQLite (.data/hackmpc.db) │
                          │   │                          │ (better-sqlite3,    │
                          │   │                          │  single WAL conn)   │
                          │   │     ┌────────────────────┼───────────────────┐│
                          │   │     ▼                    ▼                   ▼ │
                          │   │  lib/queries.ts     domain engines       AI layer
                          │   │ (read-only,      compliance/approvals/  lib/gemini.ts
                          │   │  parameterized)  reports/anomaly/fraud/  (model fallback)
                          │   │     │            vendors/forecast/fx/    lib/agent.ts
                          │   │     │            recurring/profiles      (tool-use loop)
                          │   │     ▼                    ▼                   ▼ │
                          │   │  RSC pages /        violations/requests/   chat answers
                          │   │  /api JSON          reports/notifications/  + AI prose
                          │   │     │               anchors tables          │ │
                          │   │     └────────────────────┴───────────────────┘│
                          │   │                          │                     │
                          │   │            React UI (server components +       │
                          │   │            client views via SWR + JSON API)    │
                          │   └──────────────────────────────────────────────┘
                          │                              │
                          └──────────────────────────────┴──▶ Solana devnet (Memo anchor, optional)
                                                              ElevenLabs + Twilio (voice alerts, optional)
                                                              Google Gemini API (AI, optional)
```

Three external services are all **optional and env-gated**. With none of them configured the app still runs: the rule engines populate, the dashboards render, only the AI prose, the phone calls, and the on-chain proofs are skipped.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router + TypeScript | Server Components by default; route handlers run on the Node runtime |
| UI | Tailwind 3 + shadcn/Radix, Recharts | Arimo (Helvetica substitute) + Fraunces display; Brim teal `#007d93` / cyan `#00c1d5` |
| Data | SQLite via `better-sqlite3` | Single synchronous WAL connection; schema applied on first open |
| Ingest | SheetJS (`xlsx`) | One pipeline for the bundled XLSX and user CSV/XLSX uploads |
| AI | Google Gemini (`@google/genai`) | Function-calling agent + batched reasoning passes, per-model 429 fallback |
| Blockchain | Solana (`@solana/web3.js` + `@solana/spl-memo`) | Devnet Memo anchoring, server keypair, server-only |
| Voice | ElevenLabs Conversational AI + Twilio | Outbound calls for CRITICAL alerts |
| Validation | `zod` | Validates every AI tool-call argument before it reaches the DB |
| Tests | Vitest | Unit tests for fraud scoring, notifications, settings, voice-alert |

---

## 3. Runtime and process model

Everything runs in one Next.js process. There is no separate API server, job queue, or cache tier.

- **Server Components read the database directly.** A page like `app/reports/page.tsx` calls a `lib/` function (`getReports()`) at render time and passes plain data to a client component. No fetch round-trip for the initial render.
- **Client views mutate through `/api` route handlers** and re-read with SWR. Anything interactive (approve a report, run a scan, verify an anchor) posts JSON to a route handler, which calls the same `lib/` function the server component would.
- **All route handlers declare `runtime = "nodejs"` and `dynamic = "force-dynamic"`.** The Node runtime is required because `better-sqlite3` is a native addon and several libs (`@solana/web3.js`, `crypto`) are Node-only; `force-dynamic` disables caching so every read reflects the live DB.
- **`better-sqlite3` is marked `serverExternalPackages`** in `next.config.mjs` so the native module is never bundled into the client or the server webpack output. `@solana/web3.js` stays server-only by being imported exclusively from route handlers, so it never enters the client bundle either.

---

## 4. Data layer

### 4.1 The connection (`lib/db.ts`)

A single lazily-initialized `better-sqlite3` connection, cached in a module-level singleton:

```ts
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");   // concurrent reads alongside the writer
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(".../lib/schema.sql"));  // idempotent, runs on first open
```

- **One writable connection** for the whole process. `better-sqlite3` is synchronous, so there is no connection-pool or async-race surface; reads and writes are ordinary function calls.
- **WAL mode** lets readers proceed while the single writer is active.
- **Schema-on-open**: `schema.sql` is entirely `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so opening the DB applies any newly-added tables idempotently. New columns are added the same way (edit `schema.sql`; next open applies them). There is no migration framework and no version table by design: the schema is declarative and additive.
- The DB file lives in `.data/hackmpc.db` (gitignored). `HACKMPC_DB_DIR` / `HACKMPC_DB_PATH` override the location for a deploy volume.

### 4.2 Schema (17 tables)

| Group | Tables | Purpose |
|---|---|---|
| Reference | `mcc_category_map`, `cards` | MCC to category lookup; card (cost-center) registry |
| Core ledger | `transactions` | The wide, fully-normalized transaction row (see below) |
| Compliance | `policy_rules`, `violations` | Digitized policy; scanner output |
| Workflows | `requests`, `expense_reports`, `report_line_items` | Pre-approval queue; jurisdiction-period reports |
| Receipts/Budgets | `receipts`, `budgets` | OCR receipt matches; per-category/card monthly limits |
| Chat | `chat_sessions`, `chat_messages` | Multi-turn agent memory |
| Alerting | `notifications`, `app_settings` | Alert ledger + call dedup; feature toggles |
| Audit | `anchors` | Solana on-chain anchor records |
| Agents | `agent_runs`, `fraud_cases` | Multi-agent run audit trail; fraud investigator case files |

The **`transactions`** table is the spine. It is deliberately wide and pre-normalized so the read path is pure aggregation with no per-query parsing:

```
txn_date (ISO), posting_date, txn_serial      -- canonical + original Excel serial
merchant_name, merchant_norm                  -- raw + normalized (consolidation + split detection)
amount_original, amount_cad, currency,        -- money, with conversion
  conversion_rate, signed_amount, direction   -- signed_amount = +debit / -credit (CAD)
mcc, category, subcategory, raw_category      -- MCC-derived taxonomy
country, state_province, merchant_city, …     -- geography
is_cross_border, is_round_number, trip_id     -- precomputed analytic flags
```

Pre-computing `merchant_norm`, `signed_amount`, `is_cross_border`, and `is_round_number` at ingest time means the compliance, anomaly, vendor-consolidation, and FX engines are simple `GROUP BY` queries rather than runtime string-munging.

### 4.3 Ingest pipeline (`lib/ingest.ts`)

One pipeline serves both the bundled-data ETL (`scripts/etl.ts`) and the in-app Import button (`app/api/import/route.ts`), so manual uploads and the seed data go through identical normalization:

1. **Parse** CSV or XLSX via SheetJS.
2. **Column aliasing**: tolerant header matching (Date / Merchant / Amount / MCC / Card and common variants).
3. **Date normalization**: accepts both Excel serial numbers and real date strings, emits ISO `yyyy-mm-dd`.
4. **Money normalization**: original amount + currency, CAD conversion, signed amount by debit/credit direction.
5. **Categorization**: MCC to category via `lib/mcc-seed.ts` (95 codes) plus merchant-pattern overrides.
6. **Settlement quarantine**: bank card-balance payments are tagged `Payments & Settlements` (`NON_OPERATIONAL`) and excluded from "spend" everywhere downstream.
7. **Flagging**: cross-border and round-number flags computed once.
8. **Dedup + mode**: rows are de-duplicated on (card + date + merchant + amount + direction). ETL runs in **replace** mode; uploads run in **append** mode (existing data kept), after which compliance re-scans and approvals/reports regenerate.

---

## 5. The query layer (`lib/queries.ts`)

This is the single chokepoint through which **all** analytics flow, for both the dashboard and the AI agent.

- **`buildWhere(filters)`** turns a whitelisted `Filters` object into a parameterized `WHERE` clause + bind array. Every value is a bound parameter (`?`), never interpolated.
- **Dimensions and metrics are enums**, not strings: `GroupDim` (category, state_province, transaction_code, month, merchant_norm, …) maps to a fixed `GROUP_EXPR`; `Metric` (sum/count/avg) maps to a fixed `METRIC_EXPR`. The caller (including the model) can only pick from these.
- **Settlements are excluded by default** (`category NOT IN (NON_OPERATIONAL)`) unless `include_settlements` is explicitly set, so a bank payment can never silently inflate a spend number.

Because the dashboard and the AI tools call the same functions, "what the chart shows" and "what the model can compute" are guaranteed identical. There is no second analytics path to drift.

---

## 6. The AI layer

The AI is organized in three tiers, all funneled through one client with model fallback.

### 6.1 Model fallback (`lib/gemini.ts`)

Google's free tier meters quota **per model per day**. `generateWithFallback()` takes any `generateContent` request minus the model name and tries each model in `MODEL_CHAIN` (eight free flash models spanning the 2.x and 3.x generations) in order. It advances to the next model only on a "try another" error (429 / `RESOURCE_EXHAUSTED`, or 404 / model-unavailable); any other error surfaces immediately as a real bug. This keeps every AI feature working as long as any single model still has quota, and the chain is overridable via `GEMINI_MODELS`.

### 6.2 Agentic chat (`lib/agent.ts` + `lib/tools.ts`)

The conversational analytics feature is a bounded tool-use loop (`MAX_ITERS = 5`):

```
buildSystemInstruction()   // reality primer + LIVE schema facts (categories, date bounds,
                           // top states, card list) re-derived each turn from the DB
      │
      ▼
for iter in 0..5:
   generateWithFallback(contents, { tools: FUNCTION_DECLARATIONS, temperature: 0.2 })
      │
      ├─ model returned functionCalls?
      │     ├─ echo the model's function-call turn into `contents`
      │     ├─ for each call: runTool(name, args)
      │     │      • zod-validate args against the tool's schema
      │     │      • call lib/queries.ts (parameterized)
      │     │      • attach a `suggested_viz` (bar/line/pie/table/stat)
      │     │      • record a ToolCallTrace (args, rowCount, sample rows, meta) for lineage
      │     ├─ push functionResponse parts back into `contents`
      │     └─ continue (let the model read results, then answer or call more tools)
      │
      └─ no calls → final text answer  +  lastViz  +  toolCalls[]
```

Key properties:

- **The model never writes SQL.** It can only call five whitelisted tools (`aggregate_spend`, `time_series`, `top_merchants`, `list_transactions`, `compare_periods`). Each tool zod-validates its arguments (the same `filterShape` enums as the query layer) before touching the DB.
- **Auto-visualization without a second model call.** The server tags each tool result with `suggested_viz`; the client switch-renders the matching Recharts component. The system prompt explicitly tells the model not to describe the chart, only the insight, so prose and chart are complementary, not redundant.
- **Multi-turn context.** Prior turns are replayed verbatim, so "now just Texas, monthly" adds `state=TX` to the previous query instead of starting over.
- **Data lineage.** Every answer carries a `ToolCallTrace[]` (which tool, which validated args, row count, sample rows). The chat UI renders this as a provenance trail, so any number traces back to the rows behind it.
- **Grounding against hallucination.** The system instruction is rebuilt each turn from live DB facts (real categories, real date bounds, real card list), and is byte-identical across turns for prompt-cache friendliness. The model is told to never invent figures and to reframe "which department?" into the real dimensions the data actually has.

### 6.3 Bounded reasoning passes

The non-chat AI features are each a **single batched Gemini call** with `responseMimeType: "application/json"`, not an open-ended agent:

- Compliance **severity triage** (`lib/compliance.ts`): re-rank rule violations by context.
- Approval **recommendations** (`lib/approvals.ts`): approve / deny / review + confidence + reasoning.
- Report **CFO summaries** (`lib/reports.ts`).
- **Insights feed** (`lib/insights-agent.ts`) and receipt **Vision OCR** (`lib/receipts.ts`).

Each is bounded in cost (one call), structured (JSON schema), and **degrades gracefully**: if the key is missing or all models are exhausted, the feature falls back to its rule-based output and never errors.

### 6.4 Multi-agent swarms (Python LangGraph sidecar)

A fourth tier upgrades four of the bounded passes into **multi-agent graphs** running in a separate, **stateless** Python service (`agents/`, FastAPI + LangGraph + langchain; LLM is OpenAI `gpt-4o-mini` when `OPENAI_API_KEY` is set, else Gemini). The TS routes gather context, POST it, receive `{ results, traces }`, and persist results + per-agent traces (`agent_runs`). Each route **degrades gracefully** to its single-call pass above if the sidecar is down or `AGENTS_SWARM_ENABLED=false`.

| Swarm | Graph | Replaces |
|---|---|---|
| Approval **debate** | Prosecutor ‖ Defender → Judge | `generateRecommendations` |
| **Fraud investigator** | one Investigator per suspect (fan-out) | — (adds to `fraudScan`) |
| **Compliance reviewer** | domain Reviewers (`Send`) → false-positive Challenger | `adjustSeverityWithAI` |
| **Insights sweep** | 4 lens agents → Ranker | `generateFeed` |

TS wiring: `lib/agent-service.ts` (HTTP client), `lib/orchestrator.ts` (`agent_runs` audit + `swarmEnabled`), and `lib/{approval-debate,fraud-investigator,compliance-swarm,insights-swarm}.ts`. The **Agents** tab on `/workflow` visualizes a run live. Full detail in [AGENTS.md](AGENTS.md).

---

## 7. Domain engines

All of these are deterministic-first; AI is an optional enrichment layer on top.

| Engine | File | What it computes (deterministically) | AI augmentation |
|---|---|---|---|
| Compliance | `compliance.ts` | 6 policy rules, split-charge evasion (same card+merchant+day crossing a threshold), repeat offenders | Contextual severity re-rank |
| Pre-approval | `approvals.ts` | Request synthesis from high-value txns, per-card history + budget context | Approve/deny/review rec |
| Reports | `reports.ts` | Jurisdiction (state/province) + month grouping, line items, policy-flag counts | CFO summary prose |
| Anomaly | `anomaly.ts` | Duplicates, round numbers, outliers, settlement-context flag | - |
| Fraud | `fraud.ts` | Per-transaction explainable fraud score with reason chips (unit-tested) | - |
| Vendors | `vendors.ts` | Per-category vendor fragmentation, consolidation savings | - |
| Forecast | `forecast.ts` | Linear burn-rate projection, budget-overrun alerts | - |
| Recurring | `recurring.ts` | Cadence detection across months | - |
| FX | `fx.ts` | USD/CAD split, estimated cross-border FX cost | - |
| Profiles | `profiles.ts` | Per-category/card benchmarking vs baseline | - |

---

## 8. Notifications and alerting

- **`notifications` table doubles as the in-app bell feed and the call-dedup ledger.** Each row has a stable `alert_key` = `{ruleId}:{groupKey|txn-<id>}` with a UNIQUE constraint, so re-scanning is idempotent (an existing alert is never re-created).
- **`syncFromViolations()`** diffs current open violations into the ledger and returns only the rows created this call.
- **Voice alerts (`lib/voice-alert.ts`)**: newly-created CRITICAL alerts trigger an outbound call via an ElevenLabs Conversational AI agent over Twilio. Calls are capped per scan, deduped via `call_status`, and gated by the `app_settings` toggle (`isCallingEnabled`). All alerts appear in the bell regardless of phone config.

---

## 9. On-chain audit anchor (`lib/solana.ts`)

A tamper-evidence subsystem that notarizes financial decisions on Solana devnet. Server-only, env-gated, best-effort.

- **Anchor**: on report approval / request decision / new HIGH-CRITICAL alert, `canonicalHash()` computes a sorted-key SHA-256 of a stable snapshot, `anchorRecord()` writes `brim:v1:<type>:<id>:<hash>` into a Solana **Memo** transaction signed by a server keypair, and upserts the `anchors` row. Failures (including an unfunded wallet) are caught and recorded as `status: failed`; they never block the approval.
- **Verify**: `verifyAnchor()` re-hashes the live record (`currentHash`), reads the memo back from chain (`onChainHash`), and compares against the stored hash. `tampered: true` when the live record no longer matches; `matches: true` when all three agree.
- Exposed through `app/api/anchor/route.ts` and surfaced on the `/audit` page plus an `AnchorBadge` on reports/approvals/compliance. Full detail in [SOLANA.md](SOLANA.md).

---

## 10. Frontend architecture

- **App Router, Server Components first.** Each page is a server component that reads the DB synchronously and hands an `initial` snapshot to a `"use client"` view. Interactive state and mutations live in the client view; subsequent reads use SWR against `/api`.
- **Auto-viz pipeline.** Tool results carry `suggested_viz`; `components/chat/chart-renderer.tsx` switch-renders the matching Recharts wrapper from `components/charts.tsx` (`SpendBar`, `TrendLine`, `CategoryPie`) or a table/stat card. The dashboard uses the same chart components, so chat and dashboard are visually consistent.
- **Global chrome** (`app/layout.tsx`): a flat top-nav (`TopNav`), a bottom-docked Ask-AI prompt that expands to full-page chat (`ChatDock`), and Sonner toasts. Fonts are Arimo (body, Helvetica substitute) and Fraunces (display).
- **Progressive disclosure** keeps each page lean (view-more / expand, single-card paginated approval queue).

---

## 11. Auth

A lightweight session layer (`lib/auth.ts`, `app/api/auth/{login,logout,session}`) gates the app behind a simple login, with the session read by the profile menu and protected surfaces. It is intentionally minimal (demo-grade), not a full identity provider.

---

## 12. Request lifecycles (end to end)

**A chat question** ("monthly fuel spend as a trend"):
`ChatDock` POST `/api/chat` -> `runAgent()` -> Gemini calls `time_series({interval:"month", filters:{category:"Fuel"}})` -> `runTool` zod-validates -> `lib/queries.ts` runs the parameterized aggregate -> result tagged `suggested_viz:"line"` -> model writes a one-line insight -> response `{ text, viz, toolCalls }` -> client renders prose + `TrendLine` + lineage trail.

**A report approval** (with anchoring on):
`reports-view` PATCH `/api/reports/[id]` `{status:"approved"}` -> `setReportStatus()` writes the row -> `anchorRecord({recordType:"report", recordId})` hashes a snapshot, sends a Memo tx, upserts `anchors` -> response includes `{ report, anchor:{signature, explorerUrl} }` -> `AnchorBadge` shows the Explorer link and a Verify button.

**A policy scan**:
POST `/api/policies/scan` -> `runScan()` (deterministic rules + split detection) -> `adjustSeverityWithAI()` (one batched Gemini call) -> `syncFromViolations()` creates new `notifications` -> `dispatchAlertCalls()` places capped CRITICAL calls if enabled -> newly-raised HIGH/CRITICAL alerts are anchored (capped) -> response summarizes scan + notifications + calls + anchors.

---

## 13. Build, runtime, and deploy

- **`next.config.mjs`**: `serverExternalPackages: ["better-sqlite3"]` (native module stays external); `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are on for hackathon velocity, so a stray type error never blocks a build (correctness is enforced by `npm run type-check` and the Vitest suite, run separately).
- **Deploy** needs a persistent filesystem for `better-sqlite3`. `Dockerfile` + `render.yaml` target Render (Docker web service + a volume mounted at `/data`, `HACKMPC_DB_DIR=/data`), running `npm run db:reset` on first boot. Railway/Fly follow the same volume pattern. For a serverless target (Vercel) only `lib/db.ts` changes, swapping the client to Turso/libSQL.
- **Testing**: Vitest unit tests cover the deterministic engines that most need it (`fraud.test.ts`, `notifications.test.ts`, `settings.test.ts`, `voice-alert.test.ts`).

---

## 14. Module map (`lib/`)

| File | Responsibility |
|---|---|
| `db.ts` | `better-sqlite3` singleton, WAL, applies `schema.sql` on first open |
| `schema.sql` | All 17 tables (declarative, additive, `IF NOT EXISTS`) |
| `ingest.ts` | Shared load pipeline: column aliases, date/amount/MCC normalization, dedup, replace/append |
| `mcc-seed.ts` | MCC to category map (95 codes), merchant overrides, `NON_OPERATIONAL` settlement set |
| `queries.ts` | Parameterized read-only analytics; backs the dashboard and the AI tools |
| `tools.ts` | Gemini `functionDeclarations` + zod arg validation + `suggested_viz` tagging |
| `agent.ts` | Agentic chat loop (tool-use, multi-turn, lineage, live grounding) |
| `gemini.ts` | Shared client + `generateWithFallback` (per-model 429/404 fallback chain) |
| `compliance.ts` | Rule scanner, split-charge detection, repeat offenders, AI severity triage |
| `approvals.ts` | Request synthesis, per-card context, AI approve/deny recs |
| `reports.ts` | Jurisdiction-period grouping, line items, AI CFO summaries |
| `anomaly.ts` / `fraud.ts` / `vendors.ts` / `forecast.ts` / `recurring.ts` / `fx.ts` / `profiles.ts` | Insights engines (deterministic) |
| `insights-agent.ts` | AI insights feed (batched) |
| `receipts.ts` / `budgets.ts` | Receipt OCR matching; budget burn-down |
| `notifications.ts` / `voice-alert.ts` / `settings.ts` | Alert ledger, ElevenLabs/Twilio calls, feature toggles |
| `solana.ts` | On-chain audit anchor: hash, snapshot, anchor (Memo tx), verify |
| `agent-service.ts` | HTTP client to the Python LangGraph sidecar (injectable fetch, graceful failure) |
| `orchestrator.ts` | `agent_runs` audit trail (`recordTraces`/`getRecentAgentRuns`) + `swarmEnabled` flag |
| `approval-debate.ts` / `fraud-investigator.ts` / `compliance-swarm.ts` / `insights-swarm.ts` | Per-feature swarm wiring: gather context → call sidecar → persist + fallback |
| `auth.ts` | Minimal session auth |
| `utils.ts` / `use-count-up.ts` / `use-in-view.ts` | `cn`, `formatCAD`, date + UI hooks |

**Sidecar** (`agents/`, Python): `app/main.py` (FastAPI endpoints), `app/llm.py` (Gemini fallback chain), `app/graphs/{debate,fraud,compliance,insights}.py` (LangGraph graphs). See [AGENTS.md](AGENTS.md).

**Pages**: `/` (cinematic hero) + four nav surfaces with sub-tabs - **`/overview`** (Spending · Budgets), **`/insights`**, **`/governance`** (Violations · Receipts · Audit), **`/workflow`** (Approvals · Reports · Agents) - plus a floating **Ask AI** chat. The earlier per-feature routes (`/dashboard`, `/chat`, `/compliance`, `/approvals`, `/reports`, `/receipts`, `/budgets`, `/audit`) still exist and redirect into the surfaces above.

**API**: `chat`, `import`, `insights` (+`/feed`), `policies` (+`/[id]`, `/scan`), `requests` (+`/[id]`), `reports` (+`/[id]`, `/generate`), `receipts`, `budgets`, `fraud/investigate`, `agents`, `notifications` (+`/[id]`, `/read-all`, `/test-call`), `settings/alerts`, `anchor`, `auth/{login,logout,session}`.

**Sidecar API** (Python, :8200): `health`, `debate`, `fraud/investigate`, `compliance/review`, `insights/sweep`.

---

## 15. Design principles (why it is shaped this way)

1. **Deterministic core, AI augmentation.** Numbers come from SQL; the model interprets, judges, and narrates. This is what makes the output trustworthy and the AI failures non-fatal.
2. **One analytics path.** Dashboard and AI share `lib/queries.ts`, so they cannot disagree.
3. **No raw SQL from the model.** Whitelisted enums + zod validation make the tool surface injection-proof by construction.
4. **Bounded AI.** Non-chat AI is one batched JSON call each: predictable cost, structured output, graceful degradation.
5. **Everything degrades.** Missing Gemini key, exhausted quota, unfunded Solana wallet, unconfigured Twilio: each feature falls back to its deterministic baseline and never throws into a user flow.
6. **Single process, local-first.** One SQLite connection, no external infra required to run. External services are additive, optional, and env-gated.
7. **Declarative, additive schema.** `CREATE ... IF NOT EXISTS` everywhere; adding a table or column is a one-line edit applied on next open.
