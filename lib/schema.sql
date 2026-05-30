-- FleetLedger schema. SQLite (better-sqlite3), WAL, foreign_keys ON.
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

-- ============ EXPENSE REPORTS (TRIP / HAUL grouping) ============
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
