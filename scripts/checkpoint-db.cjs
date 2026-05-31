// Flush the SQLite WAL into the main .db file so the seed is fully self-contained
// in a single file. The deploy seed scripts write in WAL mode and some call
// process.exit() before the connection closes, leaving rows (policy rules,
// violations) stranded in the -wal sidecar. Vercel only bundles `data/hackmpc.db`
// (see outputFileTracingIncludes), NOT the -wal/-shm sidecars — so without this
// checkpoint the deployed app gets transactions but 0 rules / 0 violations.
const Database = require("better-sqlite3");

const dbPath = process.env.HACKMPC_DB_PATH || "data/hackmpc.db";
const db = new Database(dbPath);
const r = db.pragma("wal_checkpoint(TRUNCATE)"); // merge -wal into .db, then truncate it
db.close(); // clean close → no lingering -wal
console.log(`✓ checkpointed WAL into ${dbPath}`, JSON.stringify(r));
