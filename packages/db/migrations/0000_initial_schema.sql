CREATE TABLE IF NOT EXISTS cardholders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  cardholder_id TEXT NOT NULL REFERENCES cardholders(id) ON DELETE CASCADE,
  last_four_digits TEXT NOT NULL,
  provider TEXT NOT NULL,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_cardholder_id ON cards(cardholder_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  spending_nature TEXT NOT NULL,
  color TEXT NOT NULL,
  budget_target_ils REAL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY NOT NULL,
  canonical_name TEXT NOT NULL,
  default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  is_ambiguous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merchants_default_category_id ON merchants(default_category_id);

CREATE TABLE IF NOT EXISTS merchant_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  match_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merchant_aliases_merchant_id ON merchant_aliases(merchant_id);

CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  total_billed_ils REAL NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_statements_card_billing_month ON statements(card_id, billing_month);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  statement_id TEXT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  billing_month TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  raw_merchant_name TEXT NOT NULL,
  billed_amount_ils REAL NOT NULL,
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL DEFAULT 'ILS',
  installment_current INTEGER,
  installment_total INTEGER,
  installment_total_amount_ils REAL,
  category_override_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  notes TEXT,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  dedup_fingerprint TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_dedup_fingerprint ON transactions(dedup_fingerprint);
CREATE INDEX IF NOT EXISTS idx_transactions_billing_month ON transactions(billing_month);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id);
