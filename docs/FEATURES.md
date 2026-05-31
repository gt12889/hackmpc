# Features

The four required capabilities, three optional ones, plus data import. Each lists where it lives and how it works.

## Required

### 1. Talk to Your Data — `/chat`
Conversational analytics over company-card spend.
- **Files:** `lib/agent.ts`, `lib/tools.ts`, `lib/queries.ts`, `app/api/chat/route.ts`, `components/chat/*`
- **How:** Gemini runs a **function-calling loop** over 5 read-only tools (`aggregate_spend`, `time_series`, `top_merchants`, `list_transactions`, `compare_periods`). The server tags each result with a `suggested_viz`; the client auto-renders bar/line/pie/table/stat. Multi-turn follow-ups replay full history, so "now just Texas, monthly" reuses prior filters. The model never invents numbers and reframes "which department?" to real dimensions. The chat shows a **data-lineage** trail of which tools were called.

### 2. Policy Compliance Engine — `/compliance`
Digitized policy + automatic violation scanning.
- **Files:** `lib/compliance.ts`, `scripts/seed-policies.ts`, `app/api/policies/*`, `components/compliance/*`
- **How:** Six rules seeded from the **real Brim expense policy** (>$50 pre-auth, no traffic/parking tickets, alcohol restriction, tips, cross-border review, category budget). The scanner flags violations, detects **split-charge evasion** (same card+merchant+day crossing a threshold while each charge stays under it), and rolls up **repeat offenders**. A bounded Gemini pass adjusts **severity by context** (e.g. legitimate same-day permit batching → LOW; a large established-vendor charge → HIGH for visibility). Rules can be toggled/added live; re-scan re-runs the engine.

### 3. AI Pre-Approval Workflow — `/approvals`
Decide once, with full context.
- **Files:** `lib/approvals.ts`, `app/api/requests/*`, `components/approvals/*`
- **How:** Requests are synthesized from real high-value transactions. Each carries the **card's spend history**, prior-vendor count, and **category budget status**. One Gemini call returns an **approve/deny/review** recommendation + confidence + reasoning that cites the real numbers. The approver clicks once; the decision persists.

### 4. Automated Expense Reports — `/reports`
Grouped, policy-checked, CFO-ready.
- **Files:** `lib/reports.ts`, `app/api/reports/*`, `components/reports/*`
- **How:** Transactions are auto-grouped by **location (state/province) + month** — the natural unit for a business reviewing where/when money was spent. Each report has a category breakdown, line items, a policy-flag count, and an **AI-written CFO summary**. One-click CFO approval.

## Optional — `/insights`

- **Anomaly & fraud** (`lib/anomaly.ts`): duplicate/recurring charges, round-number patterns, largest outliers, and a settlement-vs-spend context flag.
- **Vendor consolidation** (`lib/vendors.ts`): per-category vendor fragmentation → estimated savings (e.g. fuel across hundreds of vendors).
- **Forecasting** (`lib/forecast.ts`): linear burn-rate projection per category with budget-overrun alerts.

## Data Import — Dashboard "Import" button
- **Files:** `lib/ingest.ts`, `app/api/import/route.ts`, `components/import-dialog.tsx`
- **How:** Drag-drop a `.csv`/`.xlsx`. New rows are normalized, categorized, and **appended** (existing data kept), **de-duplicated** against existing charges (card+date+merchant+amount+direction). Then compliance re-scans and approvals/reports regenerate. See [DATA-AND-INGEST.md](DATA-AND-INGEST.md).
