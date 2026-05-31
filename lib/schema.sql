-- Brim It schema. SQLite (better-sqlite3), WAL, foreign_keys ON.
-- Read-mostly: transactions, mcc_category_map, cards.
-- Writable: policy_rules, violations, requests, expense_reports, report_line_items, chat_*.

-- ============ REFERENCE / DERIVED DIMENSIONS ============
CREATE TABLE IF NOT EXISTS mcc_category_map (
  mcc           TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  subcategory   TEXT,
  description   TEXT,
  is_restricted INTEGER NOT NULL DEFAULT 0
);

-- The 9 card codes become cost-centers / cardholders.
CREATE TABLE IF NOT EXISTS cards (
  transaction_code TEXT PRIMARY KEY,
  label            TEXT,
  cardholder_alias TEXT
);

-- ============ CORE FACT TABLE ============
CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY,
  transaction_code TEXT REFERENCES cards(transaction_code),
  description      TEXT,
  raw_category     TEXT,
  posting_date     TEXT,            -- ISO yyyy-mm-dd
  txn_date         TEXT,            -- ISO yyyy-mm-dd (primary)
  txn_serial       INTEGER,         -- original Excel serial
  merchant_name    TEXT,
  merchant_norm    TEXT,            -- normalized for consolidation + split detection
  amount_original  REAL,
  amount_cad       REAL,
  currency         TEXT,            -- 'CAD' | 'USD'
  direction        TEXT,            -- 'Debit' | 'Credit'
  signed_amount    REAL,            -- +debit / -credit, CAD
  mcc              TEXT,
  category         TEXT,            -- derived from mcc
  subcategory      TEXT,
  merchant_city    TEXT,
  country          TEXT,
  postal_code      TEXT,
  state_province   TEXT,
  conversion_rate  REAL,
  is_cross_border  INTEGER DEFAULT 0,
  is_round_number  INTEGER DEFAULT 0,
  trip_id          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_txn_date  ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_cat   ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_txn_card  ON transactions(transaction_code);
CREATE INDEX IF NOT EXISTS idx_txn_merch ON transactions(merchant_norm);
CREATE INDEX IF NOT EXISTS idx_txn_state ON transactions(state_province);
CREATE INDEX IF NOT EXISTS idx_txn_split ON transactions(transaction_code, merchant_norm, txn_date);

-- ============ POLICY ENGINE ============
CREATE TABLE IF NOT EXISTS policy_rules (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  rule_type      TEXT NOT NULL,    -- txn_threshold|category_limit|restricted_mcc|restricted_merchant|split_charge|no_tickets|tip_limit|cross_border_review
  description    TEXT,
  scope_category TEXT,
  scope_mcc      TEXT,
  scope_merchant TEXT,
  threshold_amount REAL,
  window         TEXT,             -- transaction|day|week|month
  severity_base  TEXT NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  enabled        INTEGER NOT NULL DEFAULT 1,
  policy_clause  TEXT,             -- quote from the real policy doc
  created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS violations (
  id              INTEGER PRIMARY KEY,
  rule_id         INTEGER REFERENCES policy_rules(id),
  rule_name       TEXT,
  rule_type       TEXT,
  transaction_id  INTEGER REFERENCES transactions(id),
  group_key       TEXT,            -- split charges: card|merchant|date
  severity        TEXT,            -- final (after AI adjustment)
  ai_severity     TEXT,
  ai_reasoning    TEXT,
  amount_involved REAL,
  merchant_name   TEXT,
  txn_date        TEXT,
  status          TEXT DEFAULT 'open',  -- open|dismissed|acknowledged
  detected_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_viol_sev ON violations(severity);
CREATE INDEX IF NOT EXISTS idx_viol_status ON violations(status);

-- ============ PRE-APPROVAL WORKFLOW ============
CREATE TABLE IF NOT EXISTS requests (
  id               INTEGER PRIMARY KEY,
  transaction_id   INTEGER REFERENCES transactions(id),
  transaction_code TEXT,
  category         TEXT,
  merchant_name    TEXT,
  amount_cad       REAL,
  reason           TEXT,
  status           TEXT DEFAULT 'pending', -- pending|approved|denied
  ai_recommendation TEXT,          -- approve|deny|review
  ai_confidence    REAL,
  ai_reasoning     TEXT,
  ai_context       TEXT,           -- JSON: history/budget snapshot shown to approver
  decided_by       TEXT,
  decided_at       TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_req_status ON requests(status);

-- ============ EXPENSE REPORTS (location + month grouping) ============
CREATE TABLE IF NOT EXISTS expense_reports (
  id                INTEGER PRIMARY KEY,
  title             TEXT,
  transaction_code  TEXT,
  start_date        TEXT,
  end_date          TEXT,
  corridor          TEXT,
  total_cad         REAL,
  txn_count         INTEGER,
  status            TEXT DEFAULT 'draft',  -- draft|flagged|approved
  policy_flag_count INTEGER DEFAULT 0,
  ai_summary        TEXT,
  category_breakdown TEXT,          -- JSON {category: amount}
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_line_items (
  id             INTEGER PRIMARY KEY,
  report_id      INTEGER REFERENCES expense_reports(id),
  transaction_id INTEGER REFERENCES transactions(id),
  category       TEXT,
  merchant_name  TEXT,
  txn_date       TEXT,
  amount_cad     REAL
);
CREATE INDEX IF NOT EXISTS idx_rli_report ON report_line_items(report_id);

-- ============ CHAT (multi-turn agent memory) ============
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         INTEGER PRIMARY KEY,
  title      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES chat_sessions(id),
  role       TEXT,            -- user|model
  content    TEXT,            -- JSON-serialized parts (text + viz payload)
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_session ON chat_messages(session_id);

-- ============ RECEIPTS (image upload + AI Vision OCR -> match to a transaction) ============
CREATE TABLE IF NOT EXISTS receipts (
  id                 INTEGER PRIMARY KEY,
  transaction_id     INTEGER REFERENCES transactions(id),  -- matched txn (null = unmatched)
  source             TEXT DEFAULT 'synthetic',  -- 'synthetic' | 'upload'
  image_path         TEXT,
  extracted_merchant TEXT,
  extracted_date     TEXT,
  extracted_amount   REAL,
  extracted_tax      REAL,
  confidence         REAL,
  match_status       TEXT DEFAULT 'matched',     -- 'matched' | 'unmatched'
  created_at         TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipt_txn ON receipts(transaction_id);

-- ============ BUDGETS (per category/card monthly limits) ============
CREATE TABLE IF NOT EXISTS budgets (
  id           INTEGER PRIMARY KEY,
  scope        TEXT NOT NULL DEFAULT 'category',  -- 'category' | 'card'
  scope_value  TEXT NOT NULL,                     -- e.g. 'Fuel' or '3001'
  period       TEXT NOT NULL DEFAULT 'month',
  limit_amount REAL NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(scope, scope_value, period)
);

-- Notification ledger: doubles as the in-app bell feed AND the call dedup ledger.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT UNIQUE NOT NULL,        -- stable identity: ruleId:groupKey|txn-<id>
  severity TEXT NOT NULL,                -- critical|high|medium|low
  title TEXT NOT NULL,
  body TEXT,
  merchant_name TEXT,
  amount_involved REAL,
  rule_name TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  call_status TEXT,                      -- null|called|skipped|failed|disabled|unconfigured
  call_id TEXT,
  call_error TEXT,
  called_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Simple key/value app settings (e.g. alerts_calling_enabled).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- On-chain audit anchors: SHA-256 of a record's canonical snapshot, notarized in a Solana
-- Memo transaction (devnet). One row per anchored record; re-anchoring overwrites the row.
CREATE TABLE IF NOT EXISTS anchors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT NOT NULL,          -- 'report' | 'request' | 'alert'
  record_id   TEXT NOT NULL,          -- entity id (report/request) or alert_key
  hash        TEXT NOT NULL,          -- sha256 hex of canonical snapshot
  payload     TEXT NOT NULL,          -- the canonical JSON that was hashed
  signature   TEXT,                   -- solana tx signature
  cluster     TEXT,                   -- 'devnet'
  slot        INTEGER,
  status      TEXT,                   -- 'confirmed' | 'failed'
  error       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(record_type, record_id)
);
CREATE INDEX IF NOT EXISTS idx_anchors_created ON anchors(created_at DESC);

-- Vendor trust registry: finance can mark vendors as approved/watch/blocked and
-- optionally anchor the decision hash on Solana for auditor-visible proof.
CREATE TABLE IF NOT EXISTS vendor_trust (
  vendor_norm   TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'watch', -- approved|watch|blocked
  category      TEXT,
  note          TEXT,
  reviewed_by   TEXT,
  spend_cad     REAL DEFAULT 0,
  txn_count     INTEGER DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_trust_status ON vendor_trust(status, updated_at DESC);

-- Audit trail of multi-agent orchestration runs (the "swarm at work" feed). Each row
-- is one role-agent's contribution to a feature (debate / investigation / review / sweep).
CREATE TABLE IF NOT EXISTS agent_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature     TEXT NOT NULL,          -- 'approval-debate' | 'fraud-investigator' | 'compliance-swarm' | 'insights-swarm'
  role        TEXT NOT NULL,          -- 'Prosecutor' | 'Defender' | 'Judge' | 'Investigator' | ...
  subject_key TEXT,                   -- request id / suspect txn id / violation key / 'feed'
  ok          INTEGER NOT NULL DEFAULT 0,
  model       TEXT,                   -- which Gemini model served it
  summary     TEXT,                   -- one-line human-readable result
  payload     TEXT,                   -- JSON of the agent's structured output
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_feature ON agent_runs(feature, created_at);

-- Fraud investigator case files: the agent swarm's verdict on top of the
-- deterministic fraudScan score. One row per investigated transaction.
CREATE TABLE IF NOT EXISTS fraud_cases (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id     INTEGER UNIQUE,
  score              INTEGER,
  verdict            TEXT,          -- 'likely_fraud' | 'suspicious' | 'benign' | 'unreviewed'
  confidence         REAL,
  narrative          TEXT,
  recommended_action TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);
