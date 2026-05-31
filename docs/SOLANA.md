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

## What gets anchored (3 record types)

| Record type | Trigger | Keyed by |
|---|---|---|
| `report` | Expense report status set to `approved` | report id |
| `request` | Pre-approval request decided (approve/deny) | request id |
| `alert` | A newly raised HIGH or CRITICAL compliance alert (capped at 5 per scan) | `alert_key` |

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
  `buildSnapshot` (report/request/alert), `anchorRecord` (Memo tx, best-effort), `verifyAnchor`
  (re-hash + read the memo back from chain), `listAnchors`, `explorerUrl`.
- `app/api/anchor/route.ts` - `POST` to anchor, `GET ?recordType=&recordId=` to verify,
  `GET` (no params) to list.
- Auto-anchor hooks: `app/api/reports/[id]/route.ts`, `app/api/requests/[id]/route.ts`,
  `app/api/policies/scan/route.ts`.
- UI: `components/solana/anchor-badge.tsx` (badge + Verify), `components/solana/audit-trail.tsx`,
  `app/audit/page.tsx` (the `/audit` page), nav entry in `components/top-nav.tsx`.
- Schema: the `anchors` table in `lib/schema.sql`.
- Setup: `scripts/solana-setup.mjs` (`npm run solana:setup`).

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
