# Solana On-Chain Audit Anchor

A tamper-evident audit trail for financial decisions. When a record is approved or a serious
alert is raised, Brim It writes a SHA-256 hash of that record's canonical snapshot into a
Solana **Memo** transaction on **devnet**. The transaction is publicly verifiable on Explorer,
and a later **Verify** action re-hashes the live record to prove it has not changed since it
was notarized.

## Why

Approved expense reports, pre-approval decisions, and compliance alerts are all persisted to
SQLite, where they can in principle be edited after the fact with no trace. Anchoring the hash
on a public chain makes any post-approval change provably detectable: the on-chain hash is
immutable, so if the live record's re-hash no longer matches, the record was tampered with.

## What gets anchored (4 record types)

| Record type | Trigger | Keyed by |
|---|---|---|
| `report` | Expense report status set to `approved` | report id |
| `request` | Pre-approval request decided (approve/deny) | request id |
| `alert` | A newly raised HIGH or CRITICAL compliance alert (capped at 5 per scan) | `alert_key` |
| `vendor` | Finance marks a vendor `approved`, `watch`, or `blocked` in the Vendor Trust Registry | normalized vendor name |

Anchoring fires automatically inside the existing approval / scan flow. It is best-effort: a
failure (or an unconfigured wallet) never blocks the approval, it just records the attempt with
`status: failed`.

## Design choices

- **Devnet, server keypair, Memo program.** A server-side keypair signs, so there is no browser
  wallet and no setup for the user / judge. The Memo program needs no custom on-chain program to
  deploy. This is the lowest-risk path with the highest demo value.
- **Server-only.** `@solana/web3.js` + `@solana/spl-memo` are used only in API routes
  (`runtime = "nodejs"`), so web3.js never enters the client bundle and there is no native-module
  or `next.config` change. Hashing uses Node's built-in `crypto`.
- **Env-gated.** The feature is on when `SOLANA_PAYER_SECRET` is set, off otherwise
  (`isAnchorConfigured()`). When off, approvals and scans behave exactly as before.

## Files

- `lib/solana.ts` - core: `isAnchorConfigured`, `canonicalHash` (sorted-key JSON SHA-256),
  `buildSnapshot` (report/request/alert/vendor), `anchorRecord` (Memo tx, best-effort), `verifyAnchor`
  (re-hash + read the memo back from chain), `listAnchors`, `explorerUrl`.
- `app/api/anchor/route.ts` - `POST` to anchor, `GET ?recordType=&recordId=` to verify,
  `GET` (no params) to list.
- `app/api/vendors/trust/route.ts` - vendor trust registry API. Saves status locally and,
  when Solana is configured, anchors the vendor decision as `recordType: "vendor"`.
- Auto-anchor hooks: `app/api/reports/[id]/route.ts`, `app/api/requests/[id]/route.ts`,
  `app/api/policies/scan/route.ts`.
- UI: `components/solana/anchor-badge.tsx` (badge + Verify), `components/solana/audit-trail.tsx`,
  `app/audit/page.tsx` (the `/audit` page), nav entry in `components/top-nav.tsx`, and the
  Vendor Trust Registry panel in `components/insights/insights-view.tsx`.
- Schema: the `anchors` and `vendor_trust` tables in `lib/schema.sql`.
- Setup: `scripts/solana-setup.mjs` (`npm run solana:setup`).

## Vendor Trust Registry

The second Solana extension idea has been implemented: keep approved vendors, blocked vendors,
and high-risk vendor flags anchored on-chain.

What changed:

- Added a `vendor_trust` table with `vendor_norm`, `display_name`, `status`, `category`, `note`,
  `reviewed_by`, `spend_cad`, `txn_count`, and `updated_at`.
- Added `topVendors`, `listVendorTrust`, `vendorTrustMap`, `getVendorStats`, and `setVendorTrust`
  in `lib/vendors.ts`.
- Added `app/api/vendors/trust/route.ts`.
  - `GET` returns high-spend vendors, trust rows, and a vendor-keyed trust map.
  - `POST` accepts `vendorNorm`, `displayName`, `status`, `note`, and `reviewedBy`.
- Extended `RecordType` in `lib/solana.ts` to include `vendor`.
- Extended `buildSnapshot()` so vendor decisions hash the stable trust snapshot, including status,
  reviewer, note, spend context, transaction count, and update time.
- Updated `app/api/anchor/route.ts`, `AnchorBadge`, and `AuditTrail` so vendor anchors can be
  verified and listed alongside report/request/alert anchors.
- Added a Vendor Trust Registry panel to Insights -> Vendors. Users can mark top vendors as
  `approved`, `watch`, or `blocked`.

Current behavior:

- If `SOLANA_PAYER_SECRET` is unset, vendor decisions are saved locally and the UI reports that
  Solana anchoring is off.
- If Solana is configured, each vendor trust change writes a Memo transaction containing:
  `brim:v1:vendor:<vendor_norm>:<hash>`.
- Verification re-hashes the current vendor trust row and compares it with the stored/on-chain
  hash, so a changed vendor decision can be detected as tampered.

## Future Solana ideas

These were considered as possible next Solana uses:

1. **Approval Certificate NFTs or Tokens** - when a report is approved, mint a lightweight
   non-transferable certificate or token representing that approval. This creates a visible proof
   artifact for auditors, not just a memo hash.
2. **Vendor Trust Registry** - keep approved vendors, blocked vendors, and high-risk vendor flags
   anchored on-chain. The app can prove that a vendor was approved or restricted at the time a
   payment or report was reviewed. This is now implemented.
3. **Policy Version Anchoring** - every time the company expense policy changes, anchor the policy
   hash on Solana. Then each violation or approval can say, "this was judged against policy
   version X."
4. **Receipt Proofs** - hash matched receipts and anchor the hash. Receipt images stay off-chain;
   only the proof is public.
5. **Multi-Signer Approval Flow** - for high-value expenses, require multiple wallet signatures
   from finance, operations, and CFO roles.
6. **Dispute / Exception Ledger** - when a flagged transaction is cleared, anchor the exception
   decision so the reason a risky spend was accepted is immutable.

The strongest recommended next additions are **Policy Version Anchoring** and **Receipt Proofs**:
they fit the product naturally, are demo-friendly, and avoid overcomplicating the app with wallets
or token mechanics.

## How verification works

`verifyAnchor()` compares three hashes:

1. `storedHash` - the hash saved in the `anchors` row when it was notarized.
2. `currentHash` - re-hashing the live record right now.
3. `onChainHash` - the hash read back from the Solana Memo transaction.

- `matches: true` when all three agree (record intact, and the DB row matches the chain).
- `tampered: true` when `currentHash` differs from `storedHash` (the live record changed since
  anchoring).

Re-anchoring a changed record (POST `/api/anchor`) writes a fresh hash and clears the tampered
state.

## Setup

```bash
npm run solana:setup     # generate + faucet-fund a devnet keypair, write to .env.local
```

This generates a keypair (if none exists), requests a devnet airdrop, and writes
`SOLANA_PAYER_SECRET` and `SOLANA_RPC_URL` to `.env.local`. The public devnet faucet is
IP-rate-limited; if the airdrop returns 429, fund the printed address manually at
`https://faucet.solana.com` (sign in with GitHub to bypass the limit) or with
`solana airdrop 1 <pubkey> --url devnet`. Each anchor costs about 5,000 lamports, so 1 SOL
covers hundreds of thousands of anchors.

### Environment

```
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_PAYER_SECRET=[ ... ]    # JSON array of the 64-byte secret key (set by solana:setup)
```

## Demo

1. Approve a report at `/reports` (or `curl -X PATCH /api/reports/<id> -d '{"status":"approved"}'`).
   The response includes `anchor.signature` and `anchor.explorerUrl`.
2. Open the Explorer link: the memo reads `brim:v1:report:<id>:<hash>`.
3. `/audit` lists the anchor with a Verify button showing "Verified".
4. Tamper test: edit the report in the DB, then Verify again. The badge flips to "Tampered"
   because the live re-hash no longer matches the immutable on-chain hash.
