// Seed a few real on-chain anchors into the build-time DB so the Audit Trail is
// populated on read-only / ephemeral deploys (e.g. Vercel, where runtime writes to
// /tmp don't persist across serverless invocations). Each call notarizes a record
// on Solana devnet, so the bundled seed carries verifiable Explorer-linked anchors.
//
// Resilient to flaky / rate-limited RPCs (the public devnet endpoint throttles cloud
// build IPs): each record is anchored sequentially with retry + backoff, and any row
// that still doesn't confirm is dropped so the trail never shows "Failed".
//
// Best-effort + key-gated: if SOLANA_PAYER_SECRET isn't set, it skips cleanly (the
// build still succeeds; the trail is just empty). Runs after the report/approval seeds
// in `db:reset` / `db:reset:deploy`, before the DB checkpoint.

import { getDb } from "../lib/db";
import { setReportStatus } from "../lib/reports";
import { decideRequest } from "../lib/approvals";
import { anchorRecord, isAnchorConfigured, listAnchors, type RecordType } from "../lib/solana";

const RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function anchorWithRetry(recordType: RecordType, recordId: string, label: string) {
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    last = await anchorRecord({ recordType, recordId });
    if (last.status === "confirmed") {
      console.log(`[seed-anchors] ${label}: confirmed ${last.signature?.slice(0, 10)}…`);
      return last;
    }
    if (attempt < RETRIES) {
      const wait = 1500 * attempt; // backoff for transient RPC rate-limits
      console.log(`[seed-anchors] ${label}: ${last.status} (${(last.error ?? "").slice(0, 60)}) - retry ${attempt}/${RETRIES - 1} in ${wait}ms`);
      await sleep(wait);
    }
  }
  console.warn(`[seed-anchors] ${label}: gave up (${(last?.error ?? "").slice(0, 80)})`);
  return last;
}

async function main() {
  if (!isAnchorConfigured()) {
    console.log("[seed-anchors] SOLANA_PAYER_SECRET not set - skipping (Audit Trail starts empty).");
    return;
  }
  const db = getDb();

  const reports = db.prepare(`SELECT id FROM expense_reports ORDER BY total_cad DESC LIMIT 3`).all() as { id: number }[];
  for (const r of reports) {
    setReportStatus(r.id, "approved");
    await anchorWithRetry("report", String(r.id), `report #${r.id}`);
    await sleep(600); // space out so we don't burst the RPC
  }

  const reqs = db.prepare(`SELECT id FROM requests WHERE status='pending' ORDER BY amount_cad DESC LIMIT 3`).all() as { id: number }[];
  for (const q of reqs) {
    decideRequest(q.id, "approved", "Finance Manager");
    await anchorWithRetry("request", String(q.id), `request #${q.id}`);
    await sleep(600);
  }

  // Never leave "Failed" rows in the trail - keep only the confirmed ones.
  const dropped = db.prepare(`DELETE FROM anchors WHERE status != 'confirmed'`).run().changes;
  const confirmed = listAnchors().filter((a) => a.status === "confirmed").length;
  console.log(`[seed-anchors] done - ${confirmed} confirmed anchor(s)${dropped ? `, dropped ${dropped} unconfirmed` : ""}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed-anchors]", e?.message || e);
    process.exit(0);
  });
