# Brim It — AI Expense Intelligence

**Brim Financial × MPC Hacks.** An AI-powered expense-intelligence platform for SMB credit-card spending — built on real (anonymized) company-card transaction data and the real Brim expense policy. *Make the data talk.*

A non-technical finance manager can chat with their company's spend in plain English, manage a digitized expense policy and triage violations, run an AI pre-approval queue, and generate review-ready expense reports — all grounded in real numbers.

## Working with the real data

The dataset is **4,235 anonymized company-card transactions** (Aug 2025–Mar 2026, CAD). A few things shaped the build:

- **No department/employee columns** — the data is organized by **card** (cost-center), **merchant**, **category**, **location**, and **time**. The app uses those real dimensions instead of inventing an org chart, and the AI reframes "which department?" questions accordingly.
- **Categories are derived from MCC codes** (`lib/mcc-seed.ts`, 95 codes), since the file's own category column is unusable (99% one value).
- **The single largest line ($264,517) is a card-balance payment, not spend** — we detect and **quarantine $1.2M of such settlements** so they don't distort the analytics.

## The four required capabilities

1. **Talk to Your Data** (`/chat`) — Agentic conversational analytics. Google Gemini runs a **function-calling loop** over 5 read-only query tools (aggregate, time-series, top-merchants, list, compare), auto-renders the right viz (bar/line/pie/table/stat), and handles **multi-turn follow-ups** ("now just Texas, monthly" reuses prior filters) — never inventing numbers.

2. **Policy Compliance Engine** (`/compliance`) — Six rules **digitized from the real Brim policy** ($50 pre-auth, no traffic/parking tickets, alcohol restriction, tips, etc.). Auto-scans transactions, detects **split-charge evasion** (same card+merchant+day crossing a threshold), surfaces **repeat offenders**, and applies an **AI contextual severity pass** — distinguishing legitimate same-day batching from genuine threshold-ducking.

3. **AI Pre-Approval Workflow** (`/approvals`) — Each request shows the card's spend history, prior-vendor count, and **category budget status**, plus a Gemini **approve / deny / review** recommendation citing the real numbers. The approver decides once; decisions persist.

4. **Automated Expense Reports** (`/reports`) — Transactions auto-grouped by **location + month** with category breakdowns, line items, policy-flag counts, and **AI-written CFO summaries**, ready for one-click approval.

## Optional capabilities (`/insights`)

- **Anomaly & fraud** — duplicate/recurring charges, round-number patterns, outliers (plus the settlement-vs-spend context flag).
- **Vendor consolidation** — fragmented spend (e.g. fuel across 218 vendors, top one only 22%) → estimated **~$85K** annual savings.
- **Forecasting** — linear burn-rate projection per category with **budget-overrun alerts**.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/Radix · Recharts · **better-sqlite3** · **Google Gemini** (`@google/genai`, function-calling) · zod. Branded in Brim's teal/cyan (`#007d93` / `#00c1d5`).

## Run it locally

```bash
npm install
cp .env.example .env.local         # add your GEMINI_API_KEY
npm run db:reset                   # ETL the data + seed policies/approvals/reports
npm run dev                        # http://localhost:3000
```

`npm run db:reset` rebuilds the SQLite DB from `data/transactions.xlsx`: normalizes dates, CAD amounts, and MCC→category mapping (`scripts/etl.ts`), then seeds policy rules, the approval queue, and expense reports. Without a Gemini key the app still runs — the rule-based engines populate; only the AI reasoning/summaries are skipped.

**Upload your own data:** the **Import** button (top bar) accepts a `.csv` or `.xlsx` card export. It runs the same ingest pipeline (`lib/ingest.ts`, shared with the ETL script) — tolerant of common column-name variants (Date/Merchant/Amount/MCC/Card…) and of either Excel-serial or real date strings — then re-scans compliance, rebuilds the approval queue, and regenerates reports.

## Architecture notes

- **No raw SQL from the model.** The agent calls parameterized, whitelisted, zod-validated query tools (`lib/tools.ts` → `lib/queries.ts`). The same query layer backs the dashboard.
- **AI is bounded**: each AI feature is one batched Gemini call (severity triage, approval recs, report summaries) with `responseMimeType: application/json`.

## Deploy

`better-sqlite3` needs a persistent filesystem. Deploy to a host with a volume (Railway / Render / Fly) and run `npm run db:reset` on first boot — see `Dockerfile` and `render.yaml`. For a serverless target (Vercel), swap the client in `lib/db.ts` to Turso/libSQL (SQLite-compatible).
