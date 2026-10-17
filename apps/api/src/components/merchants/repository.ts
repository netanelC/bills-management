import {
  asc,
  cardholders,
  cards,
  categories,
  desc,
  eq,
  inArray,
  merchantAliases,
  merchants,
  transactions,
  type AppDatabase,
  type MerchantRow,
  type SqliteDatabase,
  type TransactionRow,
} from '@bills/db';
import type {
  CardDto,
  CardholderDto,
  CategoryDto,
  MerchantAliasDto,
} from '@bills/shared';

export class MerchantsRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly sqlite: SqliteDatabase,
  ) {}

  runInTransaction<TResult>(fn: () => TResult): TResult {
    const txRunner = this.sqlite.transaction(fn);
    return txRunner();
  }

  findMerchantById(id: string): MerchantRow | null {
    const row = this.db
      .select()
      .from(merchants)
      .where(eq(merchants.id, id))
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

  listAllMerchants(): MerchantRow[] {
    return this.db
      .select()
      .from(merchants)
      .orderBy(asc(merchants.canonicalName), asc(merchants.id))
      .all();
  }

  listAllAliases(): MerchantAliasDto[] {
    return this.db
      .select()
      .from(merchantAliases)
      .orderBy(asc(merchantAliases.pattern), asc(merchantAliases.id))
      .all();
  }

  listAliasesByMerchantId(merchantId: string): MerchantAliasDto[] {
    return this.db
      .select()
      .from(merchantAliases)
      .where(eq(merchantAliases.merchantId, merchantId))
      .orderBy(asc(merchantAliases.pattern), asc(merchantAliases.id))
      .all();
  }

  listAllTransactions(): TransactionRow[] {
    return this.db
      .select()
      .from(transactions)
      .orderBy(desc(transactions.purchaseDate), asc(transactions.id))
      .all();
  }

  listTransactionsByMerchantId(merchantId: string): TransactionRow[] {
    return this.db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
      .orderBy(desc(transactions.purchaseDate), asc(transactions.id))
      .all();
  }

  listAllCategories(): CategoryDto[] {
    return this.db.select().from(categories).all();
  }

  listAllCards(): CardDto[] {
    return this.db.select().from(cards).all();
  }

  listAllCardholders(): CardholderDto[] {
    return this.db.select().from(cardholders).all();
  }

  updateMerchantFields(
    id: string,
    fields: Partial<{
      canonicalName: string;
      defaultCategoryId: string | null;
      isAmbiguous: boolean;
    }>,
  ): void {
    this.db.update(merchants).set(fields).where(eq(merchants.id, id)).run();
  }

  insertAlias(alias: MerchantAliasDto): void {
    this.db.insert(merchantAliases).values(alias).run();
  }

  deleteAliasesByMerchantIds(merchantIds: readonly string[]): void {
    if (merchantIds.length === 0) {
      return;
    }
    this.db
      .delete(merchantAliases)
      .where(inArray(merchantAliases.merchantId, [...merchantIds]))
      .run();
  }

  reassignTransactionsToMerchant(
    sourceMerchantIds: readonly string[],
    targetMerchantId: string,
  ): number {
    if (sourceMerchantIds.length === 0) {
      return 0;
    }
    const result = this.db
      .update(transactions)
      .set({ merchantId: targetMerchantId })
      .where(inArray(transactions.merchantId, [...sourceMerchantIds]))
      .run();
    return Number(result.changes);
  }

  deleteMerchantsByIds(merchantIds: readonly string[]): void {
    if (merchantIds.length === 0) {
      return;
    }
    this.db
      .delete(merchants)
      .where(inArray(merchants.id, [...merchantIds]))
      .run();
  }
}
