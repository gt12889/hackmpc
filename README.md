# FleetLedger — AI Expense Intelligence

**Brim Financial × MPC Hacks.** An AI-powered expense-intelligence platform built on real (anonymized) SMB card-transaction data and the real Brim expense policy.

> **The twist we found in the data.** The brief describes "~50 employees, multiple departments." The actual dataset is a **cross-border trucking fleet** — 4,235 transactions (Aug 2025–Mar 2026) dominated by government **permits**, **fuel**, **tolls/border crossings**, and **truck scales**. There are **no employees or departments** — only card codes, and one shared fleet card carries 98% of volume. The official expense policy (decoded from the provided PDF) confirms a flat "team member / manager" structure. So we built honestly around the real data: spend categories derived from **MCC codes**, cards as **cost-centers**, and reporting by **jurisdiction** (how fleets actually reconcile IFTA/IRP and permits). We also caught that the largest "transaction" ($264,517) is a **card-balance payment**, not spend — and quarantine $1.2M of such settlements so they don't distort the analytics.

## The four required capabilities

1. **Talk to Your Data** (`/chat`) — Agentic conversational analytics. Google Gemini runs a **function-calling loop** over 5 read-only query tools (aggregate, time-series, top-merchants, list, compare). It auto-renders the right viz (bar/line/pie/table/stat), handles **multi-turn follow-ups** ("now just Texas, monthly" reuses prior filters), and gracefully reframes "which department?" to the real dimensions — never hallucinating numbers.

2. **Policy Compliance Engine** (`/compliance`) — Six rules **digitized from the real Brim policy** ($50 pre-auth, no traffic/parking tickets, alcohol restriction, tips, etc.). Auto-scans transactions, detects **split-charge evasion** (same card+merchant+day crossing a threshold), surfaces **repeat offenders**, and applies an **AI contextual severity pass** — correctly down-ranking legitimate same-day permit batching while keeping genuine threshold-ducking high.

3. **AI Pre-Approval Workflow** (`/approvals`) — Each request shows the card's spend history, prior-vendor count, and **category budget status**, plus a Gemini **approve / deny / review** recommendation with reasoning that cites the real numbers. The approver decides once; decisions persist.

4. **Automated Expense Reports** (`/reports`) — Transactions auto-grouped into **jurisdiction-period reports** with category breakdowns, line items, policy-flag counts, and **AI-written CFO summaries**, ready for one-click CFO approval.

## Optional capabilities (`/insights`)

- **Anomaly & fraud** — duplicate/recurring charges, round-number patterns, outliers (and the settlement-vs-spend context flag).
- **Vendor consolidation** — fuel spend is fragmented across **218 vendors** (top one only 22%); estimated **~$85K** annual savings from consolidation.
- **Forecasting** — linear burn-rate projection per category with **budget-overrun alerts**.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/Radix · Recharts · **better-sqlite3** · **Google Gemini** (`@google/genai`, function-calling) · zod.

## Run it locally

```bash
npm install
cp .env.example .env.local         # add your GEMINI_API_KEY
npm run db:reset                   # ETL the xlsx + seed policies/approvals/reports
npm run dev                        # http://localhost:3000
```

`npm run db:reset` rebuilds the SQLite DB from `data/transactions.xlsx`: normalizes Excel dates, CAD amounts, and MCC→category mapping (`scripts/etl.ts`), then seeds the policy rules, approval queue, and expense reports. Without a Gemini key the app still runs — the rule-based engines populate, only the AI reasoning/summaries are skipped.

## Architecture notes

- **No raw SQL from the model.** The agent calls parameterized, whitelisted, zod-validated query tools (`lib/tools.ts` → `lib/queries.ts`). Same query layer backs the dashboard.
- **Derived dimensions** (`lib/mcc-seed.ts`): 95 MCC codes → human categories; merchant-pattern overrides pin border crossings, scales, and permits; settlements are separated from operational spend.
- **AI is bounded**: each AI feature is one batched Gemini call (severity triage, approval recs, report summaries) with `responseMimeType: application/json`.

## Deploy

`better-sqlite3` needs a persistent filesystem. Deploy to a host with a volume (Railway / Render / Fly) and run `npm run db:reset` on first boot — see `Dockerfile` and `render.yaml`. For a serverless target (Vercel), swap the client in `lib/db.ts` to Turso/libSQL (SQLite-compatible).
