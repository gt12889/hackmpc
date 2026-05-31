import type Database from "better-sqlite3";
import { getDb } from "./db";
import { HIGH_RISK, updateCallStatus, type Notification } from "./notifications";
import { formatCad } from "./utils";

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

/** Pre-loaded context bundle so the read-only agent can answer follow-ups. */
export function buildDynamicVars(db: Database.Database, n: Notification): Record<string, string> {
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
    if (rows.length) cardSummary = `Card ${card} recent spend — ` + rows.map((r) => `${r.category}: ${formatCad(r.spend)}`).join(", ") + ".";
  }

  return {
    severity: n.severity,
    merchant: n.merchant_name ?? "an unknown merchant",
    amount: formatCad(n.amount_involved ?? 0),
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

export type DispatchSummary = { called: number; skipped: number; failed: number; disabled: number };

/** Place calls for new high/critical alerts: sequential, capped, dedup-safe. */
export async function dispatchAlertCalls(
  db: Database.Database = getDb(),
  created: Notification[],
  deps: { enabled: boolean; config?: VoiceConfig; fetchImpl?: typeof fetch }
): Promise<DispatchSummary> {
  const config = deps.config ?? voiceConfig();
  const summary: DispatchSummary = { called: 0, skipped: 0, failed: 0, disabled: 0 };
  const targets = created
    .filter((n) => HIGH_RISK.has(n.severity))
    .sort((a, b) => (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) || ((b.amount_involved ?? 0) - (a.amount_involved ?? 0)));

  // Feature off or missing credentials: mark every high/critical alert with the
  // matching status (distinct, so operators can tell "intentionally off" from
  // "misconfigured") and report the suppressed count. No calls placed.
  if (!deps.enabled || !isVoiceConfigured(config)) {
    const status = !deps.enabled ? "disabled" : "unconfigured";
    for (const n of targets) updateCallStatus(db, n.id, { call_status: status });
    summary.disabled = targets.length;
    return summary;
  }

  for (let i = 0; i < targets.length; i++) {
    const n = targets[i];
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
