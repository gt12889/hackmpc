# Design: Voice-Call Alerts + In-App Notification System

- **Date:** 2026-05-30
- **Project:** Brim It (hackmpc) - AI Expense Intelligence
- **Status:** Design approved, pending spec review → implementation plan
- **Author:** brainstormed interactively (Claude + user)

## Goal

When a **high-risk transaction alert** is added, the system should:

1. **Call the user's phone** with an interactive **ElevenLabs Conversational AI** agent that reads the alert and answers follow-up questions, and
2. surface the alert in an **in-app notification system** (bell + feed).

"High-risk alert" = a compliance violation that lands at severity **high** or **critical** after the AI contextual severity pass in `lib/compliance.ts`.

## Context discovered in the codebase

- Compliance violations are produced by `runScan()` in `lib/compliance.ts`, then re-graded by `adjustSeverityWithAI()`. Both run from `POST /api/policies/scan`.
- Severities: `critical | high | medium | low`.
- **Critical constraint:** `runScan()` executes `DELETE FROM violations` and **rebuilds the table on every scan**, and severity is **not final** until the AI pass runs afterward. Therefore we cannot store a "notified" flag on the violation row (it would be wiped) and cannot fire alerts at insert-time (severity isn't final yet).
- No telephony/voice dependencies or phone/ElevenLabs env vars exist yet.
- Stack: Next.js 15 (App Router), TypeScript, better-sqlite3, Google Gemini. Single-user app (hackathon).

## Decisions log

Each decision below was made interactively. Alternatives and rationale are recorded so future changes understand *why*.

| # | Decision | Choice | Alternatives considered | Rationale |
|---|----------|--------|-------------------------|-----------|
| 1 | **Call mechanism** | **ElevenLabs Conversational AI agent + Twilio (interactive)** | (a) ElevenLabs TTS + Twilio one-way playback; (b) ElevenLabs-only audio, stub the dial-out; (c) other provider | Most compelling/demoable: the agent calls, reads the alert, and can converse. ElevenLabs can't dial PSTN alone - it places outbound calls via an imported **Twilio** number, so Twilio is required regardless. |
| 2 | **Call trigger** | **High + Critical, one call per alert** (deduped) | (a) critical only; (b) one summary call per scan; (c) configurable threshold | Matches "high transaction risk" literally. Dedup (one call per distinct alert) prevents re-scans from re-calling. |
| 3 | **On-call capability** | **Read-only interactive** - read alert + answer follow-ups from pre-loaded context, no write-back | (a) voice actions that approve/deny/escalate via agent-tool webhooks; (b) acknowledge-only | Avoids building secure inbound action webhooks. A rich pre-loaded context bundle still lets the agent answer "why critical?" / "what else did this card spend?". |
| 4 | **In-app notifications** | **Notification bell + persisted feed** (unread badge, all severities on screen; calls only for high/critical) | (a) toast + ephemeral activity log; (b) bell + toast; (c) phone call only | A persisted feed doubles as the dedup ledger (see architecture) and gives durable, clickable history. |
| 5 | **Config / recipient** | **Env vars for credentials + recipient, plus a DB-backed enable toggle and a "Test call" button** | (a) env-only, no UI; (b) full DB-backed settings UI | Mirrors the existing `GEMINI_API_KEY` env pattern; the toggle + test button give safe demo control (no surprise calls). |
| 6 | **Architecture** | **Approach A - notification ledger** + **call-storm guard** (sequential calls, cap 3 per scan, rest to feed) | Approach B (fire at insert-time); Approach C (background queue/worker) | A is the cleanest fit given the wipe-and-rebuild violations table; the storm guard borrows C's safety without a worker process. |

## Approaches considered (and the logic)

### Approach A - Notification ledger (CHOSEN)
A new `notifications` table is the single source of truth, serving **double duty**:

- the **on-screen bell feed**, and
- the **dedup ledger** (a `UNIQUE` constraint on a stable `alert_key`).

Flow: after the scan's AI severity pass, `syncFromViolations()` diffs current open violations against the ledger (`INSERT OR IGNORE` by `alert_key`), returns the genuinely-new rows, and the new high/critical ones are dispatched to the voice-call layer.

- **Why chosen:** The violations table is wiped and rebuilt every scan, so notification state must live *outside* it. A ledger keyed by stable alert identity gives correct dedup across re-scans for free, and the same table powers the UI.

### Approach B - Fire at insert-time (REJECTED)
Emit notifications/calls directly inside `runScan()` as violations are inserted.

- **Why rejected:** Violations are deleted and rebuilt on every scan (would double-fire), and severity is not final until `adjustSeverityWithAI()` runs *after* insertion (would use pre-AI severity). Fundamentally incompatible with the existing scan lifecycle.

### Approach C - Background queue / worker (REJECTED for now)
A separate poller + job queue places calls with retries and backpressure.

- **Why rejected:** Most production-robust (best for call storms and retries) but requires a long-running worker process - overkill for a single-user Next.js hackathon app. **We borrowed its best idea** - a sequential dispatch guard with a per-scan cap - into Approach A without the infrastructure.

## Call-storm guard (the safety behavior)

The first scan can produce many high/critical alerts at once. To avoid a phone-call storm:

- Place calls **sequentially** (no parallel dial-out).
- **Cap at 3 calls per scan.**
- Remaining new high/critical alerts get `call_status='skipped'` and appear in the bell feed with a note ("N more high-risk alerts in the app").

## Final design

### Modules (isolated responsibilities)
- `lib/notifications.ts` - ledger logic: `alertKey()`, `syncFromViolations()`, `listNotifications()`, `markRead()`, `unreadCount()`.
- `lib/voice-alert.ts` - thin ElevenLabs outbound-call wrapper: `placeAlertCall()`, `buildDynamicVars()`, config/enabled checks, sequential dispatch + cap.
- `lib/settings.ts` - tiny KV accessor for the calling toggle (`getSetting`/`setSetting`).

### Data model (added to `lib/schema.sql`)
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT UNIQUE NOT NULL,   -- stable identity: ruleId:groupKey|txnId (dedup)
  severity TEXT NOT NULL,           -- critical|high|medium|low
  title TEXT NOT NULL,
  body TEXT,                        -- merchant · $amount · rule
  merchant_name TEXT,
  amount_involved REAL,
  rule_name TEXT,
  link TEXT,                        -- e.g. /compliance?focus=<key>
  read INTEGER NOT NULL DEFAULT 0,
  call_status TEXT,                 -- null|queued|called|skipped|failed|disabled
  call_id TEXT,
  call_error TEXT,
  called_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);  -- e.g. alerts_calling_enabled = 'true' | 'false'
```

### Data flow
1. "Run scan" → `POST /api/policies/scan`.
2. `runScan()` rebuilds violations → `adjustSeverityWithAI()` sets final severity.
3. `syncFromViolations()` - `INSERT OR IGNORE` each open violation by `alert_key`; collect newly-inserted rows.
4. **Dispatch** (if enabled + configured): take up to 3 new high/critical (severity desc, amount desc), place calls sequentially via `lib/voice-alert.ts`; remaining high/critical → `call_status='skipped'`; set statuses.
5. Scan response gains `{ newNotifications, called, skipped }`.
6. Bell polls `/api/notifications` (~20s + on window focus) → unread badge + feed; shows "📞 called you at HH:MM" when `call_status='called'`.

### ElevenLabs + Twilio integration
**One-time manual setup (documented, not code):**
- Create a Conversational AI agent in ElevenLabs. System prompt ≈ *"You are Brim It's compliance alert line. Read the alert, then answer the finance manager's questions using only the provided context. Be concise."*
- Import the Twilio number into ElevenLabs (Twilio credentials live inside ElevenLabs, not in our app).

**Place call (in `lib/voice-alert.ts`):**
```
POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
Header: xi-api-key: <ELEVENLABS_API_KEY>
Body: {
  agent_id, agent_phone_number_id, to_number,
  conversation_initiation_client_data: { dynamic_variables: { ... } }
}
```

**Dynamic variables = the read-only context bundle** (so the agent answers follow-ups without a live DB tool): `severity`, `merchant`, `amount`, `card` (transaction_code), `date`, `rule_name`, `category`, `state`, `ai_reasoning`, and `card_recent_summary` (that card's recent top spend). Open-ended questions are bounded by what we pre-load - acceptable for read-only.

### Config (env + toggle)
`.env.example` gains:
```
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=
ALERT_PHONE_NUMBER=        # recipient, E.164 e.g. +15551234567
```
Toggle persisted in `app_settings` (`alerts_calling_enabled`). New routes:
- `GET/PATCH /api/settings/alerts` - read/set toggle; report "configured?" status.
- `POST /api/notifications/test-call` - place a one-off test call to the recipient.

### UI
- `components/notifications/notification-bell.tsx` - bell + unread badge + dropdown feed; click marks read and jumps to `/compliance`. Polls `/api/notifications`.
- Wired into `components/top-nav.tsx`.
- A compact alerts control (enable toggle + **Test call** button) on the `/compliance` page.

### Error handling
- Missing creds → `call_status='disabled'`; notifications still created (never blocks the scan).
- ElevenLabs API error/timeout → `call_status='failed'` + `call_error`, logged, surfaced in feed. All dial-out runs in try/catch so a failure never breaks the scan response.
- Toggle off → `call_status='skipped'`.
- Dedup race → `UNIQUE(alert_key)` + `INSERT OR IGNORE`.
- **Twilio trial caveat:** trial accounts can only call **verified** numbers - documented in README/`.env.example`.

### Testing
- **Unit:** `alertKey()` stability; `syncFromViolations()` dedup (scan twice → 0 new rows); high/critical classification; cap-3 logic; `buildDynamicVars()` shape; `placeAlertCall()` request body with an injected fake fetch (no real network).
- **Integration:** scan route with calling disabled → notifications created, 0 calls.
- **Manual:** real **Test call** button once creds are set.

## Out of scope (YAGNI)
Voice write-back actions (approve/deny by voice), multiple recipients, SMS/email channels, websockets/realtime push (polling instead), authentication/multi-user.

## Setup prerequisites (for whoever runs it)
1. ElevenLabs account + Conversational AI agent (capture `agent_id`).
2. Twilio account + number, imported into ElevenLabs (capture `agent_phone_number_id`).
3. Fill the four env vars; verify the recipient number if Twilio is on trial.
4. Enable calling via the toggle; use **Test call** to confirm end-to-end.
