import crypto from "crypto";
import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMemoInstruction } from "@solana/spl-memo";
import { getDb } from "./db";
import { getReport } from "./reports";

// ============================================================================
// Solana on-chain audit anchor (devnet, server keypair, Memo program).
//
// When a record is approved/raised, we hash a canonical snapshot of it and write that hash
// into a Solana Memo transaction. This gives a publicly verifiable, timestamped proof on
// Explorer, and lets us later detect post-approval tampering by re-hashing the live record.
//
// Server-only module (uses node:crypto + better-sqlite3). Never imported by client code -
// the UI talks to /api/anchor instead. All operations are best-effort: anchoring failures
// never throw into the approval flow; the feature is simply off when SOLANA_PAYER_SECRET
// is unset.
// ============================================================================

export type RecordType = "report" | "request" | "alert" | "vendor";

const CLUSTER = process.env.SOLANA_CLUSTER || "devnet";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

let _conn: Connection | null = null;
let _payer: Keypair | null = null;

export function isAnchorConfigured(): boolean {
  return !!process.env.SOLANA_PAYER_SECRET;
}

function getConnection(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, "confirmed");
  return _conn;
}

function getPayer(): Keypair {
  if (_payer) return _payer;
  const raw = process.env.SOLANA_PAYER_SECRET;
  if (!raw) throw new Error("SOLANA_PAYER_SECRET not set");
  const secret = Uint8Array.from(JSON.parse(raw));
  _payer = Keypair.fromSecretKey(secret);
  return _payer;
}

export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${CLUSTER}`;
}

// ---- Canonical hashing (deterministic, key-sorted) -------------------------
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as any)[k])).join(",") + "}";
}

export function canonicalHash(obj: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(obj)).digest("hex");
}

// ---- Snapshots: stable, meaningful fields only -----------------------------
export function buildSnapshot(recordType: RecordType, recordId: string): Record<string, unknown> | null {
  const db = getDb();
  if (recordType === "report") {
    const r = getReport(Number(recordId));
    if (!r) return null;
    return {
      type: "report",
      id: r.id,
      status: r.status,
      title: r.title,
      total_cad: r.total_cad,
      txn_count: r.txn_count,
      policy_flag_count: r.policy_flag_count,
      ai_summary: r.ai_summary ?? null,
      category_breakdown: r.category_breakdown ?? {},
    };
  }
  if (recordType === "request") {
    const r = db.prepare(`SELECT * FROM requests WHERE id=?`).get(Number(recordId)) as any;
    if (!r) return null;
    return {
      type: "request",
      id: r.id,
      status: r.status,
      merchant_name: r.merchant_name ?? null,
      amount_cad: r.amount_cad ?? null,
      category: r.category ?? null,
      ai_recommendation: r.ai_recommendation ?? null,
      decided_by: r.decided_by ?? null,
      decided_at: r.decided_at ?? null,
    };
  }
  if (recordType === "alert") {
    const r = db.prepare(`SELECT * FROM notifications WHERE alert_key=?`).get(recordId) as any;
    if (!r) return null;
    return {
      type: "alert",
      alert_key: r.alert_key,
      severity: r.severity,
      title: r.title,
      body: r.body ?? null,
      merchant_name: r.merchant_name ?? null,
      amount_involved: r.amount_involved ?? null,
      rule_name: r.rule_name ?? null,
    };
  }
  if (recordType === "vendor") {
    const r = db.prepare(`SELECT * FROM vendor_trust WHERE vendor_norm=?`).get(recordId) as any;
    if (!r) return null;
    return {
      type: "vendor",
      vendor_norm: r.vendor_norm,
      display_name: r.display_name,
      status: r.status,
      category: r.category ?? null,
      note: r.note ?? null,
      reviewed_by: r.reviewed_by ?? null,
      spend_cad: r.spend_cad ?? 0,
      txn_count: r.txn_count ?? 0,
      updated_at: r.updated_at ?? null,
    };
  }
  return null;
}

// ---- Anchor row helpers ----------------------------------------------------
export type AnchorRow = {
  id: number;
  record_type: RecordType;
  record_id: string;
  hash: string;
  payload: string;
  signature: string | null;
  cluster: string | null;
  slot: number | null;
  status: string | null;
  error: string | null;
  created_at: string;
};

export function getAnchor(recordType: RecordType, recordId: string): AnchorRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM anchors WHERE record_type=? AND record_id=?`)
    .get(recordType, String(recordId)) as AnchorRow | undefined;
}

export function listAnchors(limit = 200): AnchorRow[] {
  return getDb()
    .prepare(`SELECT * FROM anchors ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(limit) as AnchorRow[];
}

function upsertAnchor(row: {
  record_type: RecordType;
  record_id: string;
  hash: string;
  payload: string;
  signature: string | null;
  cluster: string | null;
  slot: number | null;
  status: string;
  error: string | null;
}) {
  getDb()
    .prepare(
      `INSERT INTO anchors (record_type, record_id, hash, payload, signature, cluster, slot, status, error, created_at)
       VALUES (@record_type, @record_id, @hash, @payload, @signature, @cluster, @slot, @status, @error, datetime('now'))
       ON CONFLICT(record_type, record_id) DO UPDATE SET
         hash=excluded.hash, payload=excluded.payload, signature=excluded.signature,
         cluster=excluded.cluster, slot=excluded.slot, status=excluded.status,
         error=excluded.error, created_at=datetime('now')`
    )
    .run({ ...row, record_id: String(row.record_id) });
}

// ---- Anchor a record (best-effort, never throws) ---------------------------
export type AnchorResult = {
  configured: boolean;
  status?: "confirmed" | "failed";
  signature?: string | null;
  hash?: string;
  slot?: number | null;
  explorerUrl?: string | null;
  recordType?: RecordType;
  recordId?: string;
  error?: string;
};

export async function anchorRecord(args: { recordType: RecordType; recordId: string }): Promise<AnchorResult> {
  const { recordType } = args;
  const recordId = String(args.recordId);
  if (!isAnchorConfigured()) return { configured: false };

  let hash: string;
  let payload: string;
  try {
    const snapshot = buildSnapshot(recordType, recordId);
    if (!snapshot) return { configured: true, status: "failed", error: "record not found", recordType, recordId };
    payload = JSON.stringify(snapshot);
    hash = canonicalHash(snapshot);
  } catch (e: any) {
    return { configured: true, status: "failed", error: e?.message || "snapshot failed", recordType, recordId };
  }

  const memo = `brim:v1:${recordType}:${recordId}:${hash}`;
  try {
    const conn = getConnection();
    const payer = getPayer();
    const tx = new Transaction().add(createMemoInstruction(memo, [payer.publicKey]));
    const signature = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
    let slot: number | null = null;
    try {
      slot = (await conn.getSignatureStatus(signature)).value?.slot ?? null;
    } catch {
      /* slot is best-effort */
    }
    upsertAnchor({ record_type: recordType, record_id: recordId, hash, payload, signature, cluster: CLUSTER, slot, status: "confirmed", error: null });
    return { configured: true, status: "confirmed", signature, hash, slot, explorerUrl: explorerUrl(signature), recordType, recordId };
  } catch (e: any) {
    const error = e?.message || "anchor tx failed";
    upsertAnchor({ record_type: recordType, record_id: recordId, hash, payload, signature: null, cluster: CLUSTER, slot: null, status: "failed", error });
    return { configured: true, status: "failed", hash, error, recordType, recordId };
  }
}

// ---- Verify: re-hash live record, compare to stored + on-chain -------------
async function fetchOnChainMemo(signature: string): Promise<string | null> {
  try {
    const tx = await getConnection().getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return null;
    const ins = (tx.transaction.message.instructions as any[]) || [];
    for (const i of ins) {
      if (i.program === "spl-memo" && typeof i.parsed === "string") return i.parsed;
    }
    for (const log of tx.meta?.logMessages ?? []) {
      const m = log.match(/Memo \(len \d+\): "(.*)"/);
      if (m) return m[1];
    }
  } catch {
    /* best-effort */
  }
  return null;
}

export type VerifyResult = {
  found: boolean;
  status?: string | null;
  signature?: string | null;
  explorerUrl?: string | null;
  slot?: number | null;
  anchoredAt?: string;
  storedHash?: string;
  currentHash?: string | null;
  onChainHash?: string | null;
  matches?: boolean;
  tampered?: boolean;
  recordType?: RecordType;
  recordId?: string;
};

export async function verifyAnchor(recordType: RecordType, recordId: string): Promise<VerifyResult> {
  const row = getAnchor(recordType, String(recordId));
  if (!row) return { found: false, recordType, recordId: String(recordId) };

  const snapshot = buildSnapshot(recordType, String(recordId));
  const currentHash = snapshot ? canonicalHash(snapshot) : null;
  const onChainHash = row.signature ? (await fetchOnChainMemo(row.signature))?.split(":").pop() ?? null : null;

  const tampered = !!currentHash && currentHash !== row.hash;
  const matches = !!currentHash && currentHash === row.hash && (onChainHash == null || onChainHash === row.hash);

  return {
    found: true,
    status: row.status,
    signature: row.signature,
    explorerUrl: row.signature ? explorerUrl(row.signature) : null,
    slot: row.slot,
    anchoredAt: row.created_at,
    storedHash: row.hash,
    currentHash,
    onChainHash,
    matches,
    tampered,
    recordType,
    recordId: String(recordId),
  };
}
