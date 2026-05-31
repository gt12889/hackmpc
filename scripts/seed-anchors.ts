// Seed a few real on-chain anchors into the build-time DB so the Audit Trail is
// populated on read-only / ephemeral deploys (e.g. Vercel, where runtime writes to
// /tmp don't persist across serverless invocations). Each call notarizes a record
// on Solana devnet, so the bundled seed carries verifiable Explorer-linked anchors.
//
// Best-effort + key-gated: if SOLANA_PAYER_SECRET isn't set, it skips cleanly (the
// build still succeeds; the trail is just empty, same as before). Runs after the
// report/approval seeds in `db:reset` / `db:reset:deploy`, before the DB checkpoint.

import { getDb } from "../lib/db";
import { setReportStatus } from "../lib/reports";
import { decideRequest } from "../lib/approvals";
import { anchorRecord, isAnchorConfigured, listAnchors } from "../lib/solana";

async function main() {
  if (!isAnchorConfigured()) {
    console.log("[seed-anchors] SOLANA_PAYER_SECRET not set - skipping (Audit Trail starts empty).");
    return;
  }
  const db = getDb();

  // Approve + anchor the largest few reports (CFO sign-off is a natural audit record).
  const reports = db.prepare(`SELECT id FROM expense_reports ORDER BY total_cad DESC LIMIT 3`).all() as { id: number }[];
  for (const r of reports) {
    setReportStatus(r.id, "approved");
    const res = await anchorRecord({ recordType: "report", recordId: String(r.id) });
    console.log(`[seed-anchors] report #${r.id}: ${res.status}${res.signature ? ` ${res.signature.slice(0, 10)}…` : ` (${res.error ?? "no sig"})`}`);
  }

  // Decide + anchor the largest few pending approval requests.
  const reqs = db.prepare(`SELECT id FROM requests WHERE status='pending' ORDER BY amount_cad DESC LIMIT 3`).all() as { id: number }[];
  for (const q of reqs) {
    decideRequest(q.id, "approved", "Finance Manager");
    const res = await anchorRecord({ recordType: "request", recordId: String(q.id) });
    console.log(`[seed-anchors] request #${q.id}: ${res.status}${res.signature ? ` ${res.signature.slice(0, 10)}…` : ` (${res.error ?? "no sig"})`}`);
  }

  const confirmed = listAnchors().filter((a) => a.status === "confirmed").length;
  console.log(`[seed-anchors] done - ${confirmed} confirmed anchor(s) in the seed DB.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // never fail the build over anchoring
    console.error("[seed-anchors]", e?.message || e);
    process.exit(0);
  });
