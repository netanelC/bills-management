import {
  and,
  asc,
  cardholders,
  cards,
  categories,
  desc,
  eq,
  inArray,
  merchantAliases,
  merchants,
  statements,
  transactions,
  type AppDatabase,
  type MerchantRow,
  type SqliteDatabase,
  type StatementRow,
  type TransactionRow,
} from '@bills/db';
import type {
  BillingMonth,
  CardDto,
  CardholderDto,
  CategoryDto,
  MerchantAliasDto,
  SpendingNature,
} from '@bills/shared';

export interface ListTransactionsFilter {
  billingMonth?: BillingMonth;
  cardholderId?: string;
  cardId?: string;
  categoryId?: string;
  spendingNature?: SpendingNature;
  merchantId?: string;
  search?: string;
  includeExcluded?: boolean;
}

export class StatementsRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly sqlite: SqliteDatabase,
  ) {}

  runInTransaction<TResult>(fn: () => TResult): TResult {
    const txRunner = this.sqlite.transaction(fn);
    return txRunner();
  }

  findCardByLastFour(lastFourDigits: string): CardDto | null {
    const row = this.db
      .select()
      .from(cards)
      .where(eq(cards.lastFourDigits, lastFourDigits))
      .get();
    return row ?? null;
  }

  insertCard(card: CardDto): void {
    this.db.insert(cards).values(card).run();
  }

  cardholderExists(id: string): boolean {
    const row = this.db
      .select({ id: cardholders.id })
      .from(cardholders)
      .where(eq(cardholders.id, id))
      .get();
    return Boolean(row);
  }

  findExistingDedupFingerprints(fingerprints: readonly string[]): Set<string> {
    if (fingerprints.length === 0) {
      return new Set<string>();
    }
    const rows = this.db
      .select({ dedupFingerprint: transactions.dedupFingerprint })
      .from(transactions)
      .where(inArray(transactions.dedupFingerprint, [...fingerprints]))
      .all();

    return new Set(rows.map((r) => r.dedupFingerprint));
  }

  insertMerchant(merchant: MerchantRow): void {
    this.db.insert(merchants).values(merchant).run();
  }

  listAllMerchantAliases(): MerchantAliasDto[] {
    return this.db.select().from(merchantAliases).all();
  }

  insertMerchantAlias(alias: MerchantAliasDto): void {
    this.db.insert(merchantAliases).values(alias).run();
  }

  findStatementByCardAndMonth(
    cardId: string,
    billingMonth: BillingMonth,
  ): StatementRow | null {
    const row = this.db
      .select()
      .from(statements)
      .where(
        and(
          eq(statements.cardId, cardId),
          eq(statements.billingMonth, billingMonth),
        ),
      )
      .get();
    return row ?? null;
  }

  insertStatement(statement: StatementRow): void {
    this.db.insert(statements).values(statement).run();
  }

  updateStatementTotal(statementId: string, totalBilledIls: number): void {
    this.db
      .update(statements)
      .set({ totalBilledIls })
      .where(eq(statements.id, statementId))
      .run();
  }

  insertTransaction(tx: TransactionRow): void {
    this.db.insert(transactions).values(tx).run();
  }

  listAllCardholders(): CardholderDto[] {
    return this.db
      .select()
      .from(cardholders)
      .orderBy(asc(cardholders.createdAt), asc(cardholders.id))
      .all();
  }

  listAllCards(): CardDto[] {
    return this.db
      .select()
      .from(cards)
      .orderBy(asc(cards.createdAt), asc(cards.id))
      .all();
  }

  listAllStatements(): StatementRow[] {
    return this.db
      .select()
      .from(statements)
      .orderBy(asc(statements.billingMonth), asc(statements.importedAt))
      .all();
  }

  listAllMerchants(): MerchantRow[] {
    return this.db.select().from(merchants).all();
  }

  listAllCategories(): CategoryDto[] {
    return this.db.select().from(categories).all();
  }

  listTransactionsRaw(filter?: {
    billingMonth?: BillingMonth;
    cardId?: string;
  }): TransactionRow[] {
    const conditions = [];
    if (filter?.billingMonth) {
      conditions.push(eq(transactions.billingMonth, filter.billingMonth));
    }
    if (filter?.cardId) {
      conditions.push(eq(transactions.cardId, filter.cardId));
    }

    if (conditions.length > 0) {
      return this.db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.purchaseDate), asc(transactions.id))
        .all();
    }

    return this.db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.purchaseDate), asc(transactions.id))
      .all();
  }

  findTransactionById(id: string): TransactionRow | null {
    const row = this.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    return row ?? null;
  }

  categoryExists(id: string): boolean {
    const row = this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .get();
    return Boolean(row);
  }

  updateTransactionFields(
    id: string,
    fields: Partial<
      Pick<TransactionRow, 'categoryOverrideId' | 'notes' | 'isExcluded'>
    >,
  ): void {
    this.db
      .update(transactions)
      .set(fields)
      .where(eq(transactions.id, id))
      .run();
  }
}
