# Architecture

Brim It is a Next.js 15 (App Router) app over a local SQLite database, with a Google Gemini AI layer. Everything runs in one process; the AI never touches raw SQL.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind 3 + shadcn/Radix, Recharts, Helvetica Bold, Brim teal/cyan |
| Data | SQLite via `better-sqlite3` (single WAL connection) |
| Ingest | SheetJS (`xlsx`) — CSV + XLSX |
| AI | Google Gemini (`@google/genai`) with per-model fallback |
| Validation | `zod` (AI tool args) |

## Data flow

```
data/transactions.xlsx ─┐
CSV/XLSX upload ─────────┴─► lib/ingest.ts ─► SQLite (.data/hackmpc.db)
                                                  │
              ┌───────────────────────────────────┼───────────────────────────────┐
              ▼                                   ▼                                 ▼
       lib/queries.ts                     rule engines                        AI layer
   (read-only analytics)        compliance / approvals / reports        lib/gemini.ts (+fallback)
              │                  / anomaly / vendors / forecast          lib/agent.ts (tool loop)
              ▼                                   ▼                                 ▼
      Dashboard charts        violations / requests / reports tables     chat answers + AI text
              └───────────────────────────────────┴───────────────────────────────┘
                                          React UI (server components + SWR client views)
```

## Module map (`lib/`)

| File | Responsibility |
|---|---|
| `db.ts` | `better-sqlite3` singleton, WAL, applies `schema.sql` on first open |
| `schema.sql` | All tables: transactions, cards, mcc_category_map, policy_rules, violations, requests, expense_reports, report_line_items, chat_* |
| `ingest.ts` | Shared load pipeline — column aliases, date/amount/MCC normalization, dedup, replace/append modes |
| `mcc-seed.ts` | MCC → category map (95 codes) + merchant overrides + settlements quarantine |
| `queries.ts` | Parameterized read-only analytics (backs dashboard **and** AI tools) |
| `tools.ts` | AI tool schemas (Gemini functionDeclarations) + zod validation + `suggested_viz` |
| `agent.ts` | Agentic chat loop (tool-use, multi-turn) |
| `gemini.ts` | Shared Gemini client + `generateWithFallback` (per-model 429 fallback) |
| `compliance.ts` | Rule scanner, split-charge detection, repeat offenders, AI severity triage |
| `approvals.ts` | Request synthesis, per-card context, AI approve/deny recs |
| `reports.ts` | Jurisdiction-period grouping, line items, AI CFO summaries |
| `anomaly.ts` / `vendors.ts` / `forecast.ts` | Optional insights |
| `utils.ts` | `cn`, `formatCAD`, date helpers |

## Routes

**Pages:** `/` (cinematic hero), `/dashboard`, `/chat`, `/compliance`, `/approvals`, `/reports`, `/insights`.

**API:** `chat`, `import`, `insights`, `policies` (+`/[id]`, `/scan`), `requests` (+`/[id]`), `reports` (+`/[id]`, `/generate`).

## Key patterns

- **Single DB connection** (`getDb()`), WAL, foreign keys on. Server components read it directly; client views fetch JSON via SWR.
- **No raw SQL from the model** — Gemini calls whitelisted, zod-validated query tools (`tools.ts` → `queries.ts`).
- **AI is bounded** — each non-chat AI feature is one batched call with `responseMimeType: application/json`.
- **Per-model fallback** — `gemini.ts` retries 429s down a chain of free models so any available model serves the request.
- **Settlements quarantine** — bank card-payments are categorized separately and excluded from "spend" everywhere.
