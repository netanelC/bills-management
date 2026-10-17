import {
  and,
  asc,
  cardholders,
  cards,
  categories,
  desc,
  eq,
  inArray,
  merchants,
  statements,
  transactions,
  type AppDatabase,
  type SqliteDatabase,
} from '@bills/db';
import type {
  BillingMonth,
  CardDto,
  CardholderDto,
  CategoryDto,
} from '@bills/shared';

export interface ListTransactionsFilter {
  billingMonth?: BillingMonth;
  cardholderId?: string;
  cardId?: string;
}

export interface MerchantRow {
  id: string;
  canonicalName: string;
  defaultCategoryId: string | null;
  isAmbiguous: boolean;
  createdAt: string;
}

export interface StatementRow {
  id: string;
  cardId: string;
  billingMonth: BillingMonth;
  sourceFilename: string;
  totalBilledIls: number;
  importedAt: string;
}

export interface TransactionRow {
  id: string;
  statementId: string;
  cardId: string;
  merchantId: string;
  billingMonth: BillingMonth;
  purchaseDate: string;
  rawMerchantName: string;
  billedAmountIls: number;
  originalAmount: number;
  originalCurrency: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  installmentTotalAmountIls: number | null;
  categoryOverrideId: string | null;
  notes: string | null;
  isExcluded: boolean;
  dedupFingerprint: string;
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

  findMerchantByCanonicalName(canonicalName: string): MerchantRow | null {
    const row = this.db
      .select()
      .from(merchants)
      .where(eq(merchants.canonicalName, canonicalName))
      .get();
    return row ?? null;
  }

  insertMerchant(merchant: MerchantRow): void {
    this.db.insert(merchants).values(merchant).run();
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
}
