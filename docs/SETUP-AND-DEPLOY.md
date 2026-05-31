# Setup & Deploy

## Prerequisites
- Node 20+ and npm
- A Google Gemini API key (optional but needed for AI features)

## Local setup

```bash
npm install
cp .env.example .env.local        # add GEMINI_API_KEY
npm run db:reset                  # build SQLite + seed policies/approvals/reports
npm run dev                       # http://localhost:3000
```

## npm scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js dev / production build / production server |
| `etl` | Load `data/transactions.xlsx` into SQLite (replace mode) |
| `seed:policies` | Seed policy rules + scan + AI severity |
| `seed:approvals` | Build approval queue + AI recs |
| `seed:reports` | Generate reports + AI summaries |
| `db:reset` | Wipe DB and run etl + all three seeds (full clean state) |
| `type-check` | `tsc --noEmit` |

## Environment (`.env.local`)
```
GEMINI_API_KEY=...                 # required for AI
GEMINI_MODEL=gemini-2.5-flash      # optional primary model (fallback chain handles 429s)
```
The DB path can be overridden with `HACKMPC_DB_DIR` / `HACKMPC_DB_PATH` (used by the deploy volume).

## Deploy

`better-sqlite3` needs a persistent filesystem.

**Render (recommended)** — `render.yaml` is included:
- Docker web service + a 1 GB persistent disk mounted at `/data` (`HACKMPC_DB_DIR=/data`)
- Set `GEMINI_API_KEY` in the dashboard
- `Dockerfile` runs `db:reset` on boot, then `next start`

**Railway / Fly** — same idea: a volume + the `Dockerfile`.

**Vercel (serverless)** — the local filesystem is ephemeral; swap the client in `lib/db.ts` to **Turso/libSQL** (SQLite-compatible). Only that file changes.

## Troubleshooting

- **Gemini `429` / quota** — the model-fallback chain handles it; under very tight free limits set `GEMINI_MODEL=gemini-2.5-flash-lite` or enable billing. See [AI.md](AI.md).
- **AI text missing** (violations/requests/reports) — re-run the in-page Re-scan / Rebuild / Regenerate buttons, or `npm run db:reset`.
- **Dev server killed under WSL / sandboxed shells** — launch it detached so task-cleanup can't stop it:
  ```bash
  setsid nohup npm run dev > /tmp/hackmpc-dev.log 2>&1 < /dev/null &
  ```
- **Reset to a clean demo dataset** — `npm run db:reset` restores the canonical ~4,235 transactions.
