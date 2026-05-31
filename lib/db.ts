import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Single writable connection, WAL mode - mirrors the Aegis pattern.
// Local: `.data/hackmpc.db` (gitignored), built by `npm run db:reset`.
// Vercel: seed at `data/hackmpc.db` (built in CI via `db:reset:deploy`), copied to /tmp per instance.

let _db: Database.Database | null = null;

const ROOT = process.cwd();
const IS_VERCEL = !!process.env.VERCEL;
const SEED_DB = path.join(ROOT, "data", "hackmpc.db");

const DB_DIR =
  process.env.HACKMPC_DB_DIR ||
  (IS_VERCEL ? path.join("/tmp", "hackmpc-db") : path.join(ROOT, ".data"));

const DB_PATH = process.env.HACKMPC_DB_PATH || path.join(DB_DIR, "hackmpc.db");

function ensureDatabaseFile(): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (fs.existsSync(DB_PATH)) return;

  if (IS_VERCEL && fs.existsSync(SEED_DB)) {
    fs.copyFileSync(SEED_DB, DB_PATH);
    return;
  }

  // Local dev: empty file is created below; run `npm run db:reset` to load data.
}

export function getDb(): Database.Database {
  if (_db) return _db;

  ensureDatabaseFile();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply schema on first open (idempotent CREATE IF NOT EXISTS statements).
  const schemaPath = path.join(ROOT, "lib", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }

  _db = db;
  return _db;
}

export const DB_FILE = DB_PATH;
