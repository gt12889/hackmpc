import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Single writable connection, WAL mode — mirrors the Aegis pattern.
// The DB file lives in .data/ (gitignored); built by scripts/etl.ts.

let _db: Database.Database | null = null;

const DB_DIR = process.env.HACKMPC_DB_DIR || path.join(process.cwd(), ".data");
const DB_PATH = process.env.HACKMPC_DB_PATH || path.join(DB_DIR, "hackmpc.db");

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply schema on first open (idempotent CREATE IF NOT EXISTS statements).
  const schemaPath = path.join(process.cwd(), "lib", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }

  _db = db;
  return _db;
}

export const DB_FILE = DB_PATH;
