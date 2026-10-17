import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type {
  BillingMonth,
  CardProvider,
  MerchantAliasMatchType,
  SpendingNature,
} from '@bills/shared';

export const cardholders = sqliteTable('cardholders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    cardholderId: text('cardholder_id')
      .notNull()
      .references(() => cardholders.id, { onDelete: 'cascade' }),
    lastFourDigits: text('last_four_digits').notNull(),
    provider: text('provider').$type<CardProvider>().notNull(),
    nickname: text('nickname').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_cards_cardholder_id').on(table.cardholderId)],
);

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  spendingNature: text('spending_nature').$type<SpendingNature>().notNull(),
  color: text('color').notNull(),
  budgetTargetIls: real('budget_target_ils'),
  sortOrder: integer('sort_order').notNull(),
});

export const merchants = sqliteTable(
  'merchants',
  {
    id: text('id').primaryKey(),
    canonicalName: text('canonical_name').notNull(),
    defaultCategoryId: text('default_category_id').references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    isAmbiguous: integer('is_ambiguous', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_merchants_default_category_id').on(table.defaultCategoryId),
  ],
);

export const merchantAliases = sqliteTable(
  'merchant_aliases',
  {
    id: text('id').primaryKey(),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    matchType: text('match_type').$type<MerchantAliasMatchType>().notNull(),
  },
  (table) => [index('idx_merchant_aliases_merchant_id').on(table.merchantId)],
);

export const statements = sqliteTable(
  'statements',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    billingMonth: text('billing_month').$type<BillingMonth>().notNull(),
    sourceFilename: text('source_filename').notNull(),
    totalBilledIls: real('total_billed_ils').notNull(),
    importedAt: text('imported_at').notNull(),
  },
  (table) => [
    index('idx_statements_card_billing_month').on(
      table.cardId,
      table.billingMonth,
    ),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    statementId: text('statement_id')
      .notNull()
      .references(() => statements.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    merchantId: text('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'restrict' }),
    billingMonth: text('billing_month').$type<BillingMonth>().notNull(),
    purchaseDate: text('purchase_date').notNull(),
    rawMerchantName: text('raw_merchant_name').notNull(),
    billedAmountIls: real('billed_amount_ils').notNull(),
    originalAmount: real('original_amount').notNull(),
    originalCurrency: text('original_currency').notNull().default('ILS'),
    installmentCurrent: integer('installment_current'),
    installmentTotal: integer('installment_total'),
    installmentTotalAmountIls: real('installment_total_amount_ils'),
    categoryOverrideId: text('category_override_id').references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    notes: text('notes'),
    isExcluded: integer('is_excluded', { mode: 'boolean' })
      .notNull()
      .default(false),
    dedupFingerprint: text('dedup_fingerprint').notNull(),
  },
  (table) => [
    uniqueIndex('uq_transactions_dedup_fingerprint').on(table.dedupFingerprint),
    index('idx_transactions_billing_month').on(table.billingMonth),
    index('idx_transactions_card_id').on(table.cardId),
    index('idx_transactions_merchant_id').on(table.merchantId),
  ],
);

export type MerchantRow = typeof merchants.$inferSelect;
export type StatementRow = typeof statements.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;

