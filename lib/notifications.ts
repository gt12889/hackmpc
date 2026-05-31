import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getViolations } from "./compliance";
import { formatCad } from "./utils";

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
      const body = `${formatCad(v.amount_involved)} · ${v.rule_name ?? "policy violation"}`;
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
