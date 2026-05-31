# Data & Ingest

## The dataset

`data/transactions.xlsx` — ~4,235 anonymized company-card transactions, Aug 2025 → Mar 2026, CAD. A fresh `npm run db:reset` always loads the canonical set (the live count drifts as you upload more).

Three realities shaped the build:

1. **No department/employee columns.** The data is organized by **card** (cost-center), **merchant**, **category**, **location**, and **time**. The app uses those real dimensions instead of inventing an org chart; the AI reframes "which department?" questions.
2. **Categories are derived from MCC codes** (`lib/mcc-seed.ts`, 95 codes + merchant-pattern overrides), because the file's own category column is unusable (99% one value).
3. **The single largest line (~$264K) is a card-balance payment, not spend.** Such bank settlements (~$1.2M) are categorized as `Payments & Settlements` and **excluded from "spend"** everywhere (`NON_OPERATIONAL` in `mcc-seed.ts`).

Canonical figures after a clean load: **~$1.5M operational spend** (Fuel, Permits & Compliance, Maintenance top), **$1.2M settlements quarantined**, 9 cards.

## Schema (`lib/schema.sql`)

- **Reference:** `mcc_category_map`, `cards`
- **Fact:** `transactions` (normalized: ISO dates, `amount_cad`, `signed_amount`, `category`, `merchant_norm`, `is_cross_border`, `is_round_number`, …)
- **Engines (writable):** `policy_rules`, `violations`, `requests`, `expense_reports`, `report_line_items`
- **Chat:** `chat_sessions`, `chat_messages`

## Ingest pipeline (`lib/ingest.ts`)

Shared by the ETL script **and** the in-app upload, so both behave identically.

**`ingestRows(db, rows, { mode })`:**
- **Column aliases** — resolves `Date`/`Transaction Date`, `Merchant`/`Payee`/`Vendor`, `Amount`/`Transaction Amount`, `MCC`, `Card`/`Account`, etc. (case-insensitive).
- **Dates** — handles both Excel serials (the sample) and real date strings (`2026-01-15`, `01/18/2026`).
- **Amounts** — CAD normalization; credits/payments detected (`Credit`, `Cr`, or negative amount) → `Payments & Settlements`.
- **Merchant normalization** — strips store numbers, processor prefixes (`VCN*…`), phone fragments → `merchant_norm` (powers vendor consolidation + split-charge grouping).
- **MCC → category** via `classify()` (curated map + merchant overrides).
- **Modes:**
  - `replace` (default; used by `npm run etl` / `db:reset`) — FK-safe clear of transactions/cards/violations/requests/reports, then rebuild.
  - `append` (used by upload) — keeps existing data, adds new rows, `INSERT OR IGNORE` new cards.
- **Dedup (append only)** — skips rows matching an existing charge on **card + date + merchant + amount + direction**, including duplicates within the uploaded file. Returns `added` vs `skipped`.

## ETL vs Upload

| | ETL (`scripts/etl.ts`) | Upload (`/api/import`) |
|---|---|---|
| Trigger | `npm run etl` / `db:reset` | Dashboard "Import" button |
| Mode | replace | append + dedup |
| Source | `data/transactions.xlsx` | uploaded CSV/XLSX |
| After | seed scripts regenerate engines | route re-scans + regenerates inline |
