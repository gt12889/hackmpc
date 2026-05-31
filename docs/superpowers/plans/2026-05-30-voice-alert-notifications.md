# Voice-Call Alerts + In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a compliance scan produces a high/critical alert, persist it to a notification ledger (powering an in-app bell feed) and place an interactive ElevenLabs+Twilio phone call for new high/critical alerts (deduped, capped at 3 per scan).

**Architecture:** A new `notifications` table is the single source of truth - both the bell feed and the dedup ledger (UNIQUE on a stable `alert_key`). After a scan's AI severity pass, `syncFromViolations()` inserts genuinely-new alerts; new high/critical ones are dispatched to `lib/voice-alert.ts`, which calls the ElevenLabs outbound-call API. The ledger lives outside the wiped `violations` table, so dedup survives re-scans.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · better-sqlite3 · vitest (new) · ElevenLabs Conversational AI REST API · Twilio (imported into ElevenLabs).

**Spec:** `docs/superpowers/specs/2026-05-30-voice-alert-notifications-design.md`

---

## File Structure

**New files:**
- `vitest.config.ts` - test runner config
- `test/helpers/db.ts` - in-memory test DB factory (applies `lib/schema.sql`)
- `lib/settings.ts` - KV accessor for the calling toggle
- `lib/notifications.ts` - ledger logic (alertKey, sync, list, unread, mark-read)
- `lib/voice-alert.ts` - ElevenLabs outbound-call wrapper + dispatch guard
- `lib/notifications.test.ts`, `lib/settings.test.ts`, `lib/voice-alert.test.ts` - unit tests
- `app/api/notifications/route.ts` - GET feed + unread count
- `app/api/notifications/[id]/route.ts` - PATCH mark-read
- `app/api/notifications/read-all/route.ts` - POST mark-all-read
- `app/api/notifications/test-call/route.ts` - POST place a test call
- `app/api/settings/alerts/route.ts` - GET/PATCH calling toggle + configured status
- `components/notifications/notification-bell.tsx` - bell + badge + dropdown feed
- `components/compliance/alert-settings.tsx` - toggle + Test-call control

**Modified files:**
- `lib/schema.sql` - add `notifications` + `app_settings` tables
- `lib/compliance.ts` - `getViolations()` gains optional injected `db` param
- `app/api/policies/scan/route.ts` - sync + dispatch after AI severity pass
- `components/top-nav.tsx` - mount the bell in the logo bar
- `app/compliance/page.tsx` - mount the alert-settings control
- `.env.example` - add ElevenLabs/recipient vars
- `package.json` - add `test` script + vitest dev deps
- `README.md` - setup notes + Twilio-trial caveat

---

## Task 1: Test infrastructure (vitest + in-memory DB)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `test/helpers/db.ts`
- Create: `test/smoke.test.ts`

- [ ] **Step 1: Install vitest**

Run:
```bash
npm install -D vitest@^2
```
Expected: vitest added to devDependencies, no errors.

- [ ] **Step 2: Add the `test` script**

Modify `package.json` `"scripts"` - add this line after `"type-check": ...`:
```json
    "test": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Create the in-memory DB helper `test/helpers/db.ts`**

```ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/** Fresh in-memory DB with the full app schema applied. Each test gets isolation. */
export function makeTestDb(): Database.Database {
  const db = new Database(":memory:");
  // FKs OFF: these tests exercise notification/call logic, not referential
  // integrity. Leaving FKs off lets us seed transactions/violations without
  // also seeding parent cards/policy_rules rows. (Prod db.ts enables FKs.)
  db.pragma("foreign_keys = OFF");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

/** Insert a minimal transaction row (only the columns our features read). */
export function seedTransaction(
  db: Database.Database,
  t: { id: number; transaction_code?: string; merchant_name?: string; category?: string; amount_cad?: number; txn_date?: string; state_province?: string; mcc?: string; direction?: string }
) {
  db.prepare(
    `INSERT INTO transactions (id, transaction_code, merchant_name, merchant_norm, category, amount_cad, txn_date, state_province, mcc, direction, currency)
     VALUES (@id, @transaction_code, @merchant_name, @merchant_norm, @category, @amount_cad, @txn_date, @state_province, @mcc, @direction, 'CAD')`
  ).run({
    id: t.id,
    transaction_code: t.transaction_code ?? "3001",
    merchant_name: t.merchant_name ?? "TEST MERCHANT",
    merchant_norm: (t.merchant_name ?? "TEST MERCHANT").toUpperCase(),
    category: t.category ?? "Fuel",
    amount_cad: t.amount_cad ?? 100,
    txn_date: t.txn_date ?? "2026-01-15",
    state_province: t.state_province ?? "TX",
    mcc: t.mcc ?? "5541",
    direction: t.direction ?? "Debit",
  });
}

/** Insert a violation row directly (mimics what runScan produces). */
export function seedViolation(
  db: Database.Database,
  v: { rule_id: number; rule_name: string; rule_type?: string; transaction_id: number | null; group_key?: string | null; severity: string; amount_involved: number; merchant_name: string; txn_date?: string }
) {
  db.prepare(
    `INSERT INTO violations (rule_id, rule_name, rule_type, transaction_id, group_key, severity, amount_involved, merchant_name, txn_date, status)
     VALUES (@rule_id, @rule_name, @rule_type, @transaction_id, @group_key, @severity, @amount_involved, @merchant_name, @txn_date, 'open')`
  ).run({
    rule_id: v.rule_id,
    rule_name: v.rule_name,
    rule_type: v.rule_type ?? "txn_threshold",
    transaction_id: v.transaction_id,
    group_key: v.group_key ?? null,
    severity: v.severity,
    amount_involved: v.amount_involved,
    merchant_name: v.merchant_name,
    txn_date: v.txn_date ?? "2026-01-15",
  });
}
```

- [ ] **Step 5: Write a smoke test `test/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";

describe("test infrastructure", () => {
  it("creates an in-memory db with the app schema", () => {
    const db = makeTestDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("transactions");
    expect(names).toContain("violations");
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npm test`
Expected: PASS - this first smoke test only checks for `transactions`/`violations` (which exist in the current schema). The `notifications`/`app_settings` assertions are added in Task 2.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/helpers/db.ts test/smoke.test.ts
git commit -m "test: add vitest + in-memory DB test harness"
```

---

## Task 2: Schema - notifications + app_settings tables

**Files:**
- Modify: `lib/schema.sql` (append at end)
- Test: `test/smoke.test.ts` (extend)

- [ ] **Step 1: Extend the smoke test to require the new tables**

Add to `test/smoke.test.ts` inside the existing `describe`:
```ts
  it("includes notifications and app_settings tables", () => {
    const db = makeTestDb();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
    expect(names).toContain("notifications");
    expect(names).toContain("app_settings");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL - the new test cannot find `notifications`/`app_settings`.

- [ ] **Step 3: Append the tables to `lib/schema.sql`**

```sql

-- Notification ledger: doubles as the in-app bell feed AND the call dedup ledger.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT UNIQUE NOT NULL,        -- stable identity: ruleId:groupKey|txn-<id>
  severity TEXT NOT NULL,                -- critical|high|medium|low
  title TEXT NOT NULL,
  body TEXT,
  merchant_name TEXT,
  amount_involved REAL,
  rule_name TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  call_status TEXT,                      -- null|called|skipped|failed|disabled
  call_id TEXT,
  call_error TEXT,
  called_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple key/value app settings (e.g. alerts_calling_enabled).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test`
Expected: PASS (all smoke tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/schema.sql test/smoke.test.ts
git commit -m "feat: add notifications + app_settings tables to schema"
```

---

## Task 3: lib/settings.ts - KV calling toggle

**Files:**
- Create: `lib/settings.ts`
- Test: `lib/settings.test.ts`

- [ ] **Step 1: Write the failing test `lib/settings.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "../test/helpers/db";
import { getSetting, setSetting, isCallingEnabled } from "./settings";

describe("settings KV", () => {
  it("returns undefined for an unset key", () => {
    const db = makeTestDb();
    expect(getSetting(db, "missing")).toBeUndefined();
  });

  it("sets and reads back a value (upsert)", () => {
    const db = makeTestDb();
    setSetting(db, "alerts_calling_enabled", "true");
    expect(getSetting(db, "alerts_calling_enabled")).toBe("true");
    setSetting(db, "alerts_calling_enabled", "false");
    expect(getSetting(db, "alerts_calling_enabled")).toBe("false");
  });

  it("isCallingEnabled defaults to false when unset and reflects the toggle", () => {
    const db = makeTestDb();
    expect(isCallingEnabled(db)).toBe(false);
    setSetting(db, "alerts_calling_enabled", "true");
    expect(isCallingEnabled(db)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/settings.test.ts`
Expected: FAIL - `./settings` does not exist.

- [ ] **Step 3: Implement `lib/settings.ts`**

```ts
import type Database from "better-sqlite3";
import { getDb } from "./db";

export const ALERTS_CALLING_ENABLED = "alerts_calling_enabled";

export function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function isCallingEnabled(db: Database.Database = getDb()): boolean {
  return getSetting(db, ALERTS_CALLING_ENABLED) === "true";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/settings.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/settings.ts lib/settings.test.ts
git commit -m "feat: app settings KV with calling-enabled toggle"
```

---

## Task 4: lib/notifications.ts - alertKey + ledger sync

**Files:**
- Create: `lib/notifications.ts`
- Modify: `lib/compliance.ts` (make `getViolations` accept an injected db)
- Test: `lib/notifications.test.ts`

- [ ] **Step 1: Make `getViolations` injectable**

In `lib/compliance.ts`, change the signature:
```ts
export function getViolations(severity?: string): any[] {
  const db = getDb();
```
to:
```ts
export function getViolations(severity?: string, db: import("better-sqlite3").Database = getDb()): any[] {
```
(Leave the rest of the function body unchanged - it already uses the local `db`.)

- [ ] **Step 2: Write the failing test `lib/notifications.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb, seedTransaction, seedViolation } from "../test/helpers/db";
import { alertKey, syncFromViolations, listNotifications, unreadCount, markRead } from "./notifications";

function setup() {
  const db = makeTestDb();
  seedTransaction(db, { id: 1, merchant_name: "MICHELIN TIRE", amount_cad: 9000, transaction_code: "3001" });
  seedTransaction(db, { id: 2, merchant_name: "PILOT FUEL", amount_cad: 200, transaction_code: "3001" });
  return db;
}

describe("alertKey", () => {
  it("uses group_key when present, else txn id, and is stable across re-scans", () => {
    expect(alertKey({ rule_id: 5, group_key: "g-abc", transaction_id: 99 })).toBe("5:g-abc");
    expect(alertKey({ rule_id: 5, group_key: null, transaction_id: 1 })).toBe("5:txn-1");
  });
});

describe("syncFromViolations", () => {
  it("creates one notification per distinct open violation", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    const created = syncFromViolations(db);
    expect(created).toHaveLength(1);
    expect(created[0].severity).toBe("high");
    expect(created[0].alert_key).toBe("1:txn-1");
    expect(listNotifications(db).length).toBe(1);
  });

  it("dedupes across re-scans (running twice creates nothing new)", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    expect(syncFromViolations(db)).toHaveLength(1);
    // Simulate a re-scan: wipe + re-insert violations (new ids), same logical alert.
    db.prepare("DELETE FROM violations").run();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "high", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    expect(syncFromViolations(db)).toHaveLength(0);
    expect(listNotifications(db).length).toBe(1);
  });

  it("tracks unread count and markRead clears it", () => {
    const db = setup();
    seedViolation(db, { rule_id: 1, rule_name: "Large charge", transaction_id: 1, severity: "critical", amount_involved: 9000, merchant_name: "MICHELIN TIRE" });
    const created = syncFromViolations(db);
    expect(unreadCount(db)).toBe(1);
    markRead(db, created[0].id);
    expect(unreadCount(db)).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/notifications.test.ts`
Expected: FAIL - `./notifications` does not exist.

- [ ] **Step 4: Implement `lib/notifications.ts`**

```ts
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getViolations } from "./compliance";

export type Notification = {
  id: number;
  alert_key: string;
  severity: string;
  title: string;
  body: string | null;
  merchant_name: string | null;
  amount_involved: number | null;
  rule_name: string | null;
  link: string | null;
  read: number;
  call_status: string | null;
  call_id: string | null;
  call_error: string | null;
  called_at: string | null;
  created_at: string;
};

export const HIGH_RISK = new Set(["high", "critical"]);

/** Stable identity for an alert, independent of the wiped violations.id. */
export function alertKey(v: { rule_id: number | string; group_key?: string | null; transaction_id?: number | null }): string {
  const ref = v.group_key ?? (v.transaction_id != null ? `txn-${v.transaction_id}` : "unknown");
  return `${v.rule_id}:${ref}`;
}

function cad(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);
}

/** Diff current open violations into the ledger; return rows created this call. */
export function syncFromViolations(db: Database.Database = getDb()): Notification[] {
  const violations = getViolations(undefined, db);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO notifications (alert_key, severity, title, body, merchant_name, amount_involved, rule_name, link)
     VALUES (@alert_key, @severity, @title, @body, @merchant_name, @amount_involved, @rule_name, @link)`
  );
  const createdKeys: string[] = [];
  const tx = db.transaction((rows: any[]) => {
    for (const v of rows) {
      const key = alertKey(v);
      const title = `${String(v.severity).toUpperCase()} risk: ${v.merchant_name ?? "Unknown merchant"}`;
      const body = `${cad(v.amount_involved)} · ${v.rule_name ?? "policy violation"}`;
      const info = insert.run({
        alert_key: key,
        severity: v.severity,
        title,
        body,
        merchant_name: v.merchant_name ?? null,
        amount_involved: v.amount_involved ?? null,
        rule_name: v.rule_name ?? null,
        link: `/compliance?focus=${encodeURIComponent(key)}`,
      });
      if (info.changes > 0) createdKeys.push(key);
    }
  });
  tx(violations);
  if (createdKeys.length === 0) return [];
  const placeholders = createdKeys.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM notifications WHERE alert_key IN (${placeholders}) ORDER BY id`)
    .all(...createdKeys) as Notification[];
}

export function listNotifications(db: Database.Database = getDb(), limit = 50): Notification[] {
  return db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit) as Notification[];
}

export function unreadCount(db: Database.Database = getDb()): number {
  return (db.prepare(`SELECT COUNT(*) n FROM notifications WHERE read = 0`).get() as { n: number }).n;
}

export function markRead(db: Database.Database = getDb(), id: number): void {
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id);
}

export function markAllRead(db: Database.Database = getDb()): void {
  db.prepare(`UPDATE notifications SET read = 1 WHERE read = 0`).run();
}

export function updateCallStatus(
  db: Database.Database,
  id: number,
  fields: { call_status: string; call_id?: string | null; call_error?: string | null; called_at?: string | null }
): void {
  db.prepare(
    `UPDATE notifications SET call_status = @call_status, call_id = @call_id, call_error = @call_error, called_at = @called_at WHERE id = @id`
  ).run({
    id,
    call_status: fields.call_status,
    call_id: fields.call_id ?? null,
    call_error: fields.call_error ?? null,
    called_at: fields.called_at ?? null,
  });
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run lib/notifications.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/notifications.ts lib/notifications.test.ts lib/compliance.ts
git commit -m "feat: notification ledger with dedup sync from violations"
```

---

## Task 5: lib/voice-alert.ts - ElevenLabs call wrapper + dispatch guard

**Files:**
- Create: `lib/voice-alert.ts`
- Test: `lib/voice-alert.test.ts`

- [ ] **Step 1: Write the failing test `lib/voice-alert.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { makeTestDb, seedTransaction } from "../test/helpers/db";
import { buildDynamicVars, placeAlertCall, dispatchAlertCalls } from "./voice-alert";
import type { Notification } from "./notifications";

const CONFIG = { apiKey: "k", agentId: "a", phoneNumberId: "p", toNumber: "+15551230000" };

function notif(over: Partial<Notification> = {}): Notification {
  return {
    id: 1, alert_key: "1:txn-1", severity: "critical", title: "CRITICAL risk: MICHELIN TIRE",
    body: "$9,000 · Large charge", merchant_name: "MICHELIN TIRE", amount_involved: 9000,
    rule_name: "Large charge", link: "/compliance", read: 0, call_status: null, call_id: null,
    call_error: null, called_at: null, created_at: "2026-01-15 00:00:00", ...over,
  };
}

describe("buildDynamicVars", () => {
  it("includes the alert fields and a card recent summary", () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, merchant_name: "MICHELIN TIRE", amount_cad: 9000, transaction_code: "3001", category: "Maintenance & Repair" });
    seedTransaction(db, { id: 2, merchant_name: "PILOT FUEL", amount_cad: 500, transaction_code: "3001", category: "Fuel" });
    const vars = buildDynamicVars(db, notif());
    expect(vars.severity).toBe("critical");
    expect(vars.merchant).toBe("MICHELIN TIRE");
    expect(vars.amount).toContain("9,000");
    expect(typeof vars.card_recent_summary).toBe("string");
  });
});

describe("placeAlertCall", () => {
  it("POSTs the ElevenLabs outbound-call payload and returns the call id", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ callSid: "CA123", conversation_id: "conv_1" }),
    });
    const res = await placeAlertCall(db, notif(), { config: CONFIG, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(true);
    expect(res.callId).toBe("conv_1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/twilio/outbound-call");
    expect((init.headers as any)["xi-api-key"]).toBe("k");
    const body = JSON.parse(init.body);
    expect(body.agent_id).toBe("a");
    expect(body.agent_phone_number_id).toBe("p");
    expect(body.to_number).toBe("+15551230000");
    expect(body.conversation_initiation_client_data.dynamic_variables.severity).toBe("critical");
  });

  it("returns ok:false on a non-2xx response", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: "bad" }) });
    const res = await placeAlertCall(db, notif(), { config: CONFIG, fetchImpl: fetchImpl as any });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("422");
  });
});

describe("dispatchAlertCalls", () => {
  it("calls at most 3 high/critical alerts sequentially and skips the rest", async () => {
    const db = makeTestDb();
    seedTransaction(db, { id: 1, transaction_code: "3001" });
    const created = [
      notif({ id: 1, severity: "critical" }), notif({ id: 2, severity: "high" }),
      notif({ id: 3, severity: "high" }), notif({ id: 4, severity: "critical" }),
      notif({ id: 5, severity: "medium" }),
    ];
    // Insert matching ledger rows so updateCallStatus has rows to update.
    for (const c of created) db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(c.id, c.alert_key + c.id, c.severity, c.title);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ conversation_id: "c" }) });
    const summary = await dispatchAlertCalls(db, created, { enabled: true, config: CONFIG, fetchImpl: fetchImpl as any });
    expect(summary.called).toBe(3);
    expect(summary.skipped).toBe(1); // 4 high/critical, cap 3 → 1 skipped; medium ignored
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("marks all high/critical disabled when calling is off", async () => {
    const db = makeTestDb();
    const created = [notif({ id: 1, severity: "critical" })];
    db.prepare("INSERT INTO notifications (id, alert_key, severity, title) VALUES (?,?,?,?)").run(1, "k1", "critical", "t");
    const fetchImpl = vi.fn();
    const summary = await dispatchAlertCalls(db, created, { enabled: false, config: CONFIG, fetchImpl: fetchImpl as any });
    expect(summary.called).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    const row = db.prepare("SELECT call_status FROM notifications WHERE id=1").get() as any;
    expect(row.call_status).toBe("disabled");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/voice-alert.test.ts`
Expected: FAIL - `./voice-alert` does not exist.

- [ ] **Step 3: Implement `lib/voice-alert.ts`**

```ts
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { HIGH_RISK, updateCallStatus, type Notification } from "./notifications";

const ELEVENLABS_CALL_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";
const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const CALL_CAP_PER_SCAN = 3;

export type VoiceConfig = { apiKey?: string; agentId?: string; phoneNumberId?: string; toNumber?: string };
type CallDeps = { config?: VoiceConfig; fetchImpl?: typeof fetch };

export function voiceConfig(): VoiceConfig {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    agentId: process.env.ELEVENLABS_AGENT_ID,
    phoneNumberId: process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
    toNumber: process.env.ALERT_PHONE_NUMBER,
  };
}

export function isVoiceConfigured(c: VoiceConfig = voiceConfig()): boolean {
  return !!(c.apiKey && c.agentId && c.phoneNumberId && c.toNumber);
}

function cad(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n || 0);
}

/** Pre-loaded context bundle so the read-only agent can answer follow-ups. */
export function buildDynamicVars(db: Database.Database, n: Notification): Record<string, string> {
  // Resolve the card behind this alert (via the alert_key's txn ref or merchant).
  const card = (db.prepare(
    `SELECT transaction_code FROM transactions WHERE merchant_name = ? ORDER BY amount_cad DESC LIMIT 1`
  ).get(n.merchant_name) as { transaction_code?: string } | undefined)?.transaction_code;

  let cardSummary = "No card history available.";
  if (card) {
    const rows = db.prepare(
      `SELECT category, ROUND(SUM(amount_cad),2) spend FROM transactions
       WHERE transaction_code = ? AND direction='Debit'
       GROUP BY category ORDER BY spend DESC LIMIT 5`
    ).all(card) as { category: string; spend: number }[];
    if (rows.length) cardSummary = `Card ${card} recent spend - ` + rows.map((r) => `${r.category}: ${cad(r.spend)}`).join(", ") + ".";
  }

  return {
    severity: n.severity,
    merchant: n.merchant_name ?? "an unknown merchant",
    amount: cad(n.amount_involved ?? 0),
    card: card ?? "unknown",
    rule_name: n.rule_name ?? "a policy rule",
    alert_summary: n.title,
    card_recent_summary: cardSummary,
  };
}

export type CallResult = { ok: boolean; callId?: string; error?: string };

export async function placeAlertCall(db: Database.Database, n: Notification, deps: CallDeps = {}): Promise<CallResult> {
  const config = deps.config ?? voiceConfig();
  const doFetch = deps.fetchImpl ?? fetch;
  if (!isVoiceConfigured(config)) return { ok: false, error: "ElevenLabs not configured" };

  const payload = {
    agent_id: config.agentId,
    agent_phone_number_id: config.phoneNumberId,
    to_number: config.toNumber,
    conversation_initiation_client_data: { dynamic_variables: buildDynamicVars(db, n) },
  };
  try {
    const res = await doFetch(ELEVENLABS_CALL_URL, {
      method: "POST",
      headers: { "xi-api-key": config.apiKey as string, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `ElevenLabs ${res.status}: ${JSON.stringify(data).slice(0, 200)}` };
    return { ok: true, callId: data.conversation_id ?? data.callSid ?? data.call_sid ?? undefined };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export type DispatchSummary = { called: number; skipped: number; failed: number };

/** Place calls for new high/critical alerts: sequential, capped, dedup-safe. */
export async function dispatchAlertCalls(
  db: Database.Database = getDb(),
  created: Notification[],
  deps: { enabled: boolean; config?: VoiceConfig; fetchImpl?: typeof fetch }
): Promise<DispatchSummary> {
  const config = deps.config ?? voiceConfig();
  const summary: DispatchSummary = { called: 0, skipped: 0, failed: 0 };
  const targets = created
    .filter((n) => HIGH_RISK.has(n.severity))
    .sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || ((b.amount_involved ?? 0) - (a.amount_involved ?? 0)));

  for (let i = 0; i < targets.length; i++) {
    const n = targets[i];
    if (!deps.enabled) { updateCallStatus(db, n.id, { call_status: "disabled" }); continue; }
    if (!isVoiceConfigured(config)) { updateCallStatus(db, n.id, { call_status: "disabled" }); continue; }
    if (i >= CALL_CAP_PER_SCAN) { updateCallStatus(db, n.id, { call_status: "skipped" }); summary.skipped++; continue; }

    const res = await placeAlertCall(db, n, { config, fetchImpl: deps.fetchImpl });
    if (res.ok) {
      updateCallStatus(db, n.id, { call_status: "called", call_id: res.callId, called_at: new Date().toISOString() });
      summary.called++;
    } else {
      updateCallStatus(db, n.id, { call_status: "failed", call_error: res.error });
      summary.failed++;
    }
  }
  return summary;
}
```

> Note: `new Date().toISOString()` runs only in the API/runtime path (not in unit tests, which assert counts and request bodies, not timestamps), so it does not affect deterministic tests.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run lib/voice-alert.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all suites: smoke, settings, notifications, voice-alert).

- [ ] **Step 6: Commit**

```bash
git add lib/voice-alert.ts lib/voice-alert.test.ts
git commit -m "feat: ElevenLabs outbound-call wrapper + capped sequential dispatch"
```

---

## Task 6: Wire sync + dispatch into the scan route

**Files:**
- Modify: `app/api/policies/scan/route.ts`

- [ ] **Step 1: Replace the scan route with sync + dispatch**

Full new contents of `app/api/policies/scan/route.ts`:
```ts
import { NextResponse } from "next/server";
import { runScan, adjustSeverityWithAI } from "@/lib/compliance";
import { getDb } from "@/lib/db";
import { syncFromViolations } from "@/lib/notifications";
import { dispatchAlertCalls } from "@/lib/voice-alert";
import { isCallingEnabled } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-scan all rules, apply AI severity, then sync notifications + place alert calls.
export async function POST() {
  const scan = runScan();
  const adjusted = await adjustSeverityWithAI();

  const db = getDb();
  const created = syncFromViolations(db);
  const calls = await dispatchAlertCalls(db, created, { enabled: isCallingEnabled(db) });

  return NextResponse.json({
    ok: true,
    scan,
    adjusted,
    notifications: { created: created.length },
    calls,
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit 0, no errors.

- [ ] **Step 3: Manual integration check (calling disabled by default)**

Run (in a terminal with the dev server running on its port - substitute `$PORT`):
```bash
curl -s -X POST http://localhost:$PORT/api/policies/scan | python3 -m json.tool
```
Expected: JSON with `ok:true`, a `notifications.created` count > 0 on first run, and `calls: {called:0, skipped:0, failed:0}` (calling disabled until toggled on). A second immediate scan should show `notifications.created: 0` (dedup).

- [ ] **Step 4: Commit**

```bash
git add app/api/policies/scan/route.ts
git commit -m "feat: scan route syncs notifications and dispatches alert calls"
```

---

## Task 7: API routes - notifications feed, mark-read, settings, test-call

**Files:**
- Create: `app/api/notifications/route.ts`
- Create: `app/api/notifications/[id]/route.ts`
- Create: `app/api/notifications/read-all/route.ts`
- Create: `app/api/settings/alerts/route.ts`
- Create: `app/api/notifications/test-call/route.ts`

- [ ] **Step 1: Create `app/api/notifications/route.ts` (GET feed + unread)**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listNotifications, unreadCount } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ notifications: listNotifications(db), unread: unreadCount(db) });
}
```

- [ ] **Step 2: Create `app/api/notifications/[id]/route.ts` (PATCH mark-read)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { markRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  markRead(getDb(), Number(id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `app/api/notifications/read-all/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { markAllRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  markAllRead(getDb());
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create `app/api/settings/alerts/route.ts` (GET status + PATCH toggle)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isCallingEnabled, setSetting, ALERTS_CALLING_ENABLED } from "@/lib/settings";
import { isVoiceConfigured } from "@/lib/voice-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ enabled: isCallingEnabled(db), configured: isVoiceConfigured() });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const db = getDb();
  if (typeof b.enabled === "boolean") setSetting(db, ALERTS_CALLING_ENABLED, b.enabled ? "true" : "false");
  return NextResponse.json({ enabled: isCallingEnabled(db), configured: isVoiceConfigured() });
}
```

- [ ] **Step 5: Create `app/api/notifications/test-call/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { placeAlertCall, isVoiceConfigured } from "@/lib/voice-alert";
import type { Notification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isVoiceConfigured()) {
    return NextResponse.json({ ok: false, error: "ElevenLabs/recipient not configured (check .env.local)" }, { status: 400 });
  }
  const db = getDb();
  const sample: Notification = {
    id: 0, alert_key: "test", severity: "critical",
    title: "CRITICAL risk: TEST MERCHANT", body: "$9,000 · Test alert",
    merchant_name: "TEST MERCHANT", amount_involved: 9000, rule_name: "Test alert",
    link: "/compliance", read: 0, call_status: null, call_id: null, call_error: null,
    called_at: null, created_at: new Date().toISOString(),
  };
  const res = await placeAlertCall(db, sample);
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
```

- [ ] **Step 6: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: exit 0; build lists the new routes (`/api/notifications`, `/api/settings/alerts`, etc.).

- [ ] **Step 7: Commit**

```bash
git add app/api/notifications app/api/settings
git commit -m "feat: notification + alert-settings + test-call API routes"
```

---

## Task 8: Notification bell component + wire into top nav

**Files:**
- Create: `components/notifications/notification-bell.tsx`
- Modify: `components/top-nav.tsx`

- [ ] **Step 1: Create `components/notifications/notification-bell.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type Notif = {
  id: number; severity: string; title: string; body: string | null;
  read: number; call_status: string | null; called_at: string | null; created_at: string;
};

const SEV_DOT: Record<string, string> = {
  critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-slate-400",
};

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore transient errors */ }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, read: 1 })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Alerts</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-primary hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No alerts yet.</div>}
            {items.map((n) => (
              <a
                key={n.id}
                href="/compliance"
                onClick={() => { fetch(`/api/notifications/${n.id}`, { method: "PATCH" }); }}
                className={cn("block border-b border-border/60 px-3 py-2.5 transition-colors hover:bg-secondary/50", !n.read && "bg-primary/5")}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[n.severity] ?? "bg-slate-400")} />
                  <span className="truncate text-xs font-medium text-foreground">{n.title}</span>
                </div>
                {n.body && <p className="mt-0.5 pl-4 text-[11px] text-muted-foreground">{n.body}</p>}
                {n.call_status === "called" && (
                  <p className="mt-0.5 flex items-center gap-1 pl-4 text-[10px] text-emerald-600">
                    <Phone className="h-3 w-3" /> Called you{n.called_at ? ` at ${new Date(n.called_at).toLocaleTimeString()}` : ""}
                  </p>
                )}
                {n.call_status === "skipped" && <p className="mt-0.5 pl-4 text-[10px] text-muted-foreground">In-app only (call cap reached)</p>}
                {n.call_status === "failed" && <p className="mt-0.5 pl-4 text-[10px] text-red-500">Call failed</p>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount the bell in `components/top-nav.tsx`**

Add the import near the top (after the `cn` import):
```tsx
import { NotificationBell } from "@/components/notifications/notification-bell";
```

Replace the logo bar block:
```tsx
      <div className="flex h-14 items-center justify-center border-b border-border/40 bg-white px-5 shadow-sm">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <img src="/brim-it-logo.png" alt="Brim It" className="h-6 w-auto md:h-7" />
        </Link>
      </div>
```
with (logo centered, bell pinned right):
```tsx
      <div className="relative flex h-14 items-center justify-center border-b border-border/40 bg-white px-5 shadow-sm">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <img src="/brim-it-logo.png" alt="Brim It" className="h-6 w-auto md:h-7" />
        </Link>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <NotificationBell />
        </div>
      </div>
```

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: exit 0.

- [ ] **Step 4: Manual visual check**

Start the dev server, hard-refresh, and confirm a bell appears at the right of the white logo bar. After running a scan (`POST /api/policies/scan`), the unread badge should appear and the dropdown should list alerts.

- [ ] **Step 5: Commit**

```bash
git add components/notifications/notification-bell.tsx components/top-nav.tsx
git commit -m "feat: notification bell + feed in top nav"
```

---

## Task 9: Alert-settings control on the compliance page

**Files:**
- Create: `components/compliance/alert-settings.tsx`
- Modify: `app/compliance/page.tsx`

- [ ] **Step 1: Create `components/compliance/alert-settings.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlertSettings() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/settings/alerts");
    const d = await res.json();
    setEnabled(d.enabled); setConfigured(d.configured);
  }
  useEffect(() => { load(); }, []);

  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/settings/alerts", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }),
    });
    const d = await res.json();
    setEnabled(d.enabled); setBusy(false);
  }

  async function testCall() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/notifications/test-call", { method: "POST" });
    const d = await res.json();
    setMsg(res.ok ? "Test call placed - your phone should ring." : `Test call failed: ${d.error ?? "unknown"}`);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        {enabled ? <Phone className="h-4 w-4 text-emerald-600" /> : <PhoneOff className="h-4 w-4 text-muted-foreground" />}
        Phone alerts
      </span>
      <button
        onClick={toggle}
        disabled={busy || !configured}
        className={cn("relative h-5 w-9 rounded-full transition-colors", enabled ? "bg-emerald-500" : "bg-secondary", (busy || !configured) && "opacity-50")}
        aria-label="Toggle phone alerts"
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", enabled ? "left-[1.125rem]" : "left-0.5")} />
      </button>
      <button
        onClick={testCall}
        disabled={busy || !configured}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />} Test call
      </button>
      {!configured && <span className="text-xs text-amber-600">Set ElevenLabs vars in .env.local to enable.</span>}
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Mount it on the compliance page**

In `app/compliance/page.tsx`, add the import at the top with the other imports:
```tsx
import { AlertSettings } from "@/components/compliance/alert-settings";
```
Then render `<AlertSettings />` near the top of the page's main content (immediately after the page header / above the violations list). Place this line just before the violations/rules section JSX:
```tsx
        <AlertSettings />
```
(If the page is a server component, `AlertSettings` is a client component and can be rendered directly - no extra wiring needed.)

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: exit 0.

- [ ] **Step 4: Manual check**

On `/compliance`, confirm the "Phone alerts" toggle + "Test call" button render. With no env vars set, both are disabled and the "Set ElevenLabs vars" hint shows.

- [ ] **Step 5: Commit**

```bash
git add components/compliance/alert-settings.tsx app/compliance/page.tsx
git commit -m "feat: phone-alert toggle + test-call control on compliance page"
```

---

## Task 10: Env, README, final verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Append the new vars to `.env.example`**

```
# --- Phone-call alerts (ElevenLabs Conversational AI + Twilio) ---
# Optional. When all four are set AND the Compliance "Phone alerts" toggle is on,
# new HIGH/CRITICAL compliance alerts trigger an interactive phone call.
# 1) Create a Conversational AI agent in ElevenLabs (read-only compliance reader).
# 2) Import your Twilio number into ElevenLabs; copy its phone-number id.
# Twilio TRIAL accounts can only call VERIFIED numbers.
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_AGENT_PHONE_NUMBER_ID=
ALERT_PHONE_NUMBER=        # recipient in E.164, e.g. +15551234567
```

- [ ] **Step 2: Add a README section**

Append under a new `## Phone-call alerts` heading in `README.md`:
```markdown
## Phone-call alerts (optional)

High/critical compliance alerts can call your phone via an ElevenLabs Conversational AI agent over Twilio.

1. Create a Conversational AI agent in ElevenLabs; copy its **Agent ID**.
2. Import your Twilio number into ElevenLabs; copy the **phone number ID**.
3. Set `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID`, `ALERT_PHONE_NUMBER` in `.env.local`.
4. On the **Compliance** page, flip **Phone alerts** on and hit **Test call**.

Alerts always appear in the in-app notification bell regardless of phone config. Calls are deduped (one per distinct alert) and capped at 3 per scan; the rest stay in the feed. Twilio trial accounts can only call verified numbers.
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run type-check && npm run build`
Expected: all tests PASS, type-check exit 0, build green with the new routes listed.

- [ ] **Step 4: Manual end-to-end (with the dev server running)**

1. Restart the dev server (applies new schema tables to the existing DB).
2. Hard-refresh the app.
3. `POST /api/policies/scan` → bell shows unread alerts; dropdown lists them.
4. (If ElevenLabs configured) toggle Phone alerts on, click **Test call** → phone rings; the agent reads the test alert and answers a follow-up.
5. Re-scan → `notifications.created: 0` (dedup confirmed).

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git commit -m "docs: env vars + README for phone-call alerts"
```

---

## Self-Review Notes (verification against spec)

- **Decision 1 (ElevenLabs agent + Twilio interactive):** Task 5 `placeAlertCall` posts to the ElevenLabs Twilio outbound-call endpoint with dynamic variables; agent/Twilio setup documented in Task 10.
- **Decision 2 (high+critical, one call per alert, deduped):** `HIGH_RISK` filter + `alert_key` UNIQUE + `INSERT OR IGNORE` (Task 4); dedup test included.
- **Decision 3 (read-only interactive):** `buildDynamicVars` pre-loads the context bundle incl. `card_recent_summary` (Task 5); no write-back routes.
- **Decision 4 (bell + feed, all severities on screen):** Tasks 7–8; feed lists all, calls only high/critical.
- **Decision 5 (env creds + DB toggle + test-call):** Tasks 3, 7, 9, 10.
- **Decision 6 (Approach A + storm guard, cap 3 sequential):** `dispatchAlertCalls` cap + sequential loop (Task 5); cap test included.
- **Error handling:** disabled/failed/skipped statuses set in `dispatchAlertCalls`; scan response unaffected by call failures (Task 6).
- **Testing:** vitest unit tests for settings, alertKey/dedup, dynamic-vars, request body, cap logic (Tasks 1–5).
