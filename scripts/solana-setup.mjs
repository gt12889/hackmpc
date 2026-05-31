// Brim It - Solana devnet setup. Generates (or reuses) a server keypair, funds it via the
// devnet faucet, and writes SOLANA_PAYER_SECRET + SOLANA_RPC_URL into .env.local so the
// on-chain audit-anchor feature can sign Memo transactions. Idempotent: re-running keeps the
// existing key and only tops up the balance.
//
//   node scripts/solana-setup.mjs   (or: npm run solana:setup)

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ENV_PATH = path.join(process.cwd(), ".env.local");
const TARGET_SOL = 1; // enough for thousands of memo anchors (~5000 lamports each)

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_PATH, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function upsertEnv(updates) {
  let lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8").split("\n") : [];
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.match(new RegExp(`^\\s*${key}\\s*=`)));
    const entry = `${key}=${value}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

function loadOrCreateKeypair(env) {
  if (env.SOLANA_PAYER_SECRET) {
    try {
      const secret = JSON.parse(env.SOLANA_PAYER_SECRET);
      return { kp: Keypair.fromSecretKey(Uint8Array.from(secret)), created: false };
    } catch {
      console.warn("⚠️  Existing SOLANA_PAYER_SECRET is unparseable; generating a new key.");
    }
  }
  return { kp: Keypair.generate(), created: true };
}

async function airdropWithRetry(conn, pubkey, sol, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const sig = await conn.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      return true;
    } catch (e) {
      const wait = 2000 * (i + 1);
      console.warn(`   airdrop attempt ${i + 1}/${attempts} failed (${e.message?.slice(0, 80)}); retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return false;
}

async function main() {
  const env = readEnv();
  const conn = new Connection(RPC, "confirmed");
  const { kp, created } = loadOrCreateKeypair(env);
  const pubkey = kp.publicKey;

  console.log(`Cluster:  ${RPC}`);
  console.log(`Keypair:  ${pubkey.toBase58()} ${created ? "(newly generated)" : "(existing)"}`);

  // Persist the key + RPC so the app can sign.
  upsertEnv({
    SOLANA_RPC_URL: RPC,
    SOLANA_PAYER_SECRET: JSON.stringify(Array.from(kp.secretKey)),
  });
  console.log(`Wrote SOLANA_PAYER_SECRET + SOLANA_RPC_URL → ${ENV_PATH}`);

  let balance = await conn.getBalance(pubkey);
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log(`Balance ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL - requesting devnet airdrop…`);
    const ok = await airdropWithRetry(conn, pubkey, TARGET_SOL);
    if (!ok) {
      console.log("\n⚠️  Faucet airdrop failed (devnet rate limits are common). Fund manually:");
      console.log(`    • Web faucet:  https://faucet.solana.com  (paste ${pubkey.toBase58()})`);
      console.log(`    • Solana CLI:  solana airdrop 1 ${pubkey.toBase58()} --url devnet`);
    }
    balance = await conn.getBalance(pubkey);
  }

  console.log(`Balance:  ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(balance > 0 ? "\n✅ Ready - on-chain audit anchoring is configured." : "\n⚠️  Key configured but unfunded; anchoring will report 'failed' until funded.");
}

main().catch((e) => {
  console.error("solana-setup failed:", e);
  process.exit(1);
});
