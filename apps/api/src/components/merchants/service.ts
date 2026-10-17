import crypto from 'node:crypto';
import type { MerchantRow } from '@bills/db';
import { buildResolvedTransactionItem, roundCurrency } from '@bills/domain';
import type {
  InboxResponseDto,
  MerchantAliasDto,
  MerchantDto,
  MergeMerchantsInput,
  MergeMerchantsResponseDto,
  SampleTransactionDto,
  TransactionListItemDto,
  UncategorizedMerchantInboxItemDto,
  UpdateMerchantInput,
} from '@bills/shared';
import { AppError } from '../../errors/app-error.js';
import type { MerchantsRepository } from './repository.js';

function buildMerchantDto(params: {
  row: MerchantRow;
  categoryNameById: ReadonlyMap<string, string>;
  aliases: MerchantAliasDto[];
  transactionCount: number;
  totalBilledIls: number;
}): MerchantDto {
  const { row, categoryNameById, aliases, transactionCount, totalBilledIls } =
    params;
  return {
    id: row.id,
    canonicalName: row.canonicalName,
    defaultCategoryId: row.defaultCategoryId,
    defaultCategoryName: row.defaultCategoryId
      ? (categoryNameById.get(row.defaultCategoryId) ?? null)
      : null,
    isAmbiguous: row.isAmbiguous,
    createdAt: row.createdAt,
    aliases,
    transactionCount,
    totalBilledIls,
  };
}

export class MerchantsService {
  constructor(private readonly repository: MerchantsRepository) {}

  listMerchants(): MerchantDto[] {
    const allMerchants = this.repository.listAllMerchants();
    const allAliases = this.repository.listAllAliases();
    const allTransactions = this.repository.listAllTransactions();
    const allCategories = this.repository.listAllCategories();

    const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));

    const aliasesByMerchant = new Map<string, MerchantAliasDto[]>();
    for (const alias of allAliases) {
      const list = aliasesByMerchant.get(alias.merchantId) ?? [];
      list.push(alias);
      aliasesByMerchant.set(alias.merchantId, list);
    }

    const txStatsByMerchant = new Map<
      string,
      { count: number; totalBilledIls: number }
    >();
    for (const tx of allTransactions) {
      const current = txStatsByMerchant.get(tx.merchantId) ?? {
        count: 0,
        totalBilledIls: 0,
      };
      current.count += 1;
      current.totalBilledIls = roundCurrency(
        current.totalBilledIls + tx.billedAmountIls,
      );
      txStatsByMerchant.set(tx.merchantId, current);
    }

    return allMerchants.map((row) => {
      const stats = txStatsByMerchant.get(row.id) ?? {
        count: 0,
        totalBilledIls: 0,
      };
      return buildMerchantDto({
        row,
        categoryNameById,
        aliases: aliasesByMerchant.get(row.id) ?? [],
        transactionCount: stats.count,
        totalBilledIls: stats.totalBilledIls,
      });
    });
  }

  private getMerchantDtoById(id: string): MerchantDto {
    const row = this.repository.findMerchantById(id);
    if (!row) {
      throw new AppError({
        code: 'NOT_FOUND',
        httpCode: 404,
        description: `Merchant '${id}' was not found`,
      });
    }

    const allCategories = this.repository.listAllCategories();
    const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
    const aliases = this.repository.listAliasesByMerchantId(id);
    const txs = this.repository.listTransactionsByMerchantId(id);
    const totalBilledIls = roundCurrency(
      txs.reduce((sum, tx) => sum + tx.billedAmountIls, 0),
    );

    return buildMerchantDto({
      row,
      categoryNameById,
      aliases,
      transactionCount: txs.length,
      totalBilledIls,
    });
  }

  getInbox(): InboxResponseDto {
    const merchantsList = this.listMerchants();
    const allTransactions = this.repository.listAllTransactions();
    const allCards = this.repository.listAllCards();
    const allCardholders = this.repository.listAllCardholders();
    const allCategories = this.repository.listAllCategories();

    const cardMap = new Map(allCards.map((c) => [c.id, c]));
    const cardholderNameMap = new Map(
      allCardholders.map((ch) => [ch.id, ch.name]),
    );
    const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
    const merchantMap = new Map(merchantsList.map((m) => [m.id, m]));

    const txsByMerchant = new Map<string, SampleTransactionDto[]>();
    const ambiguousTransactions: TransactionListItemDto[] = [];

    for (const tx of allTransactions) {
      const card = cardMap.get(tx.cardId);
      const merchant = merchantMap.get(tx.merchantId);

      const sampleList = txsByMerchant.get(tx.merchantId) ?? [];
      if (sampleList.length < 5) {
        sampleList.push({
          id: tx.id,
          purchaseDate: tx.purchaseDate,
          rawMerchantName: tx.rawMerchantName,
          billedAmountIls: tx.billedAmountIls,
          cardNickname: card?.nickname ?? '',
        });
        txsByMerchant.set(tx.merchantId, sampleList);
      }

      if (
        merchant &&
        merchant.isAmbiguous &&
        tx.categoryOverrideId === null &&
        !tx.isExcluded &&
        card
      ) {
        ambiguousTransactions.push(
          buildResolvedTransactionItem({
            tx,
            card,
            cardholderName: cardholderNameMap.get(card.cardholderId) ?? '',
            merchant,
            categoryNameById,
          }),
        );
      }
    }

    const uncategorizedMerchants: UncategorizedMerchantInboxItemDto[] =
      merchantsList
        .filter((m) => m.defaultCategoryId === null && !m.isAmbiguous)
        .map((merchant) => ({
          merchant,
          transactionCount: merchant.transactionCount,
          totalBilledIls: merchant.totalBilledIls,
          sampleTransactions: txsByMerchant.get(merchant.id) ?? [],
        }));

    return {
      totalInboxCount:
        uncategorizedMerchants.length + ambiguousTransactions.length,
      uncategorizedMerchants,
      ambiguousTransactions,
    };
  }

  updateMerchant(id: string, input: UpdateMerchantInput): MerchantDto {
    const existing = this.repository.findMerchantById(id);
    if (!existing) {
      throw new AppError({
        code: 'NOT_FOUND',
        httpCode: 404,
        description: `Merchant '${id}' was not found`,
      });
    }

    if (
      input.defaultCategoryId !== undefined &&
      input.defaultCategoryId !== null &&
      !this.repository.categoryExists(input.defaultCategoryId)
    ) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        httpCode: 400,
        description: `Category '${input.defaultCategoryId}' does not exist`,
      });
    }

    this.repository.runInTransaction(() => {
      const fieldsToUpdate: Partial<{
        canonicalName: string;
        defaultCategoryId: string | null;
        isAmbiguous: boolean;
      }> = {};

      if (input.canonicalName !== undefined) {
        fieldsToUpdate.canonicalName = input.canonicalName.trim();
      }
      if (input.defaultCategoryId !== undefined) {
        fieldsToUpdate.defaultCategoryId = input.defaultCategoryId;
      }
      if (input.isAmbiguous !== undefined) {
        fieldsToUpdate.isAmbiguous = input.isAmbiguous;
      }

      if (Object.keys(fieldsToUpdate).length > 0) {
        this.repository.updateMerchantFields(id, fieldsToUpdate);
      }

      if (input.addAlias) {
        const cleanedPattern = input.addAlias.pattern
          .replace(/\s+/g, ' ')
          .trim();
        const currentAliases = this.repository.listAliasesByMerchantId(id);
        const alreadyExists = currentAliases.some(
          (a) =>
            a.matchType === input.addAlias!.matchType &&
            a.pattern.toLowerCase() === cleanedPattern.toLowerCase(),
        );

        if (!alreadyExists) {
          this.repository.insertAlias({
            id: `alias-${crypto.randomUUID()}`,
            merchantId: id,
            pattern: cleanedPattern,
            matchType: input.addAlias.matchType,
          });
        }
      }
    });

    return this.getMerchantDtoById(id);
  }

  mergeMerchants(input: MergeMerchantsInput): MergeMerchantsResponseDto {
    const uniqueSourceIds = Array.from(new Set(input.sourceMerchantIds));
    if (uniqueSourceIds.includes(input.targetMerchantId)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        httpCode: 400,
        description: 'Cannot merge a Merchant into itself',
      });
    }

    const targetMerchant = this.repository.findMerchantById(
      input.targetMerchantId,
    );
    if (!targetMerchant) {
      throw new AppError({
        code: 'NOT_FOUND',
        httpCode: 404,
        description: `Target Merchant '${input.targetMerchantId}' was not found`,
      });
    }

    const sourceMerchants = uniqueSourceIds.map((sourceId) => {
      const row = this.repository.findMerchantById(sourceId);
      if (!row) {
        throw new AppError({
          code: 'NOT_FOUND',
          httpCode: 404,
          description: `Source Merchant '${sourceId}' was not found`,
        });
      }
      return row;
    });

    const reassignedTransactionsCount = this.repository.runInTransaction(() => {
      const reassignedCount = this.repository.reassignTransactionsToMerchant(
        uniqueSourceIds,
        input.targetMerchantId,
      );

      const currentTargetAliases = this.repository.listAliasesByMerchantId(
        input.targetMerchantId,
      );
      const seenAliasKeys = new Set(
        currentTargetAliases.map(
          (a) => `${a.matchType}|${a.pattern.toLowerCase()}`,
        ),
      );

      const candidateAliases: Array<{
        pattern: string;
        matchType: 'EXACT' | 'CONTAINS';
      }> = [];

      for (const sourceId of uniqueSourceIds) {
        const sourceAliases = this.repository.listAliasesByMerchantId(sourceId);
        for (const alias of sourceAliases) {
          candidateAliases.push({
            pattern: alias.pattern,
            matchType: alias.matchType,
          });
        }
      }

      for (const src of sourceMerchants) {
        candidateAliases.push({
          pattern: src.canonicalName,
          matchType: 'EXACT',
        });
      }

      this.repository.deleteAliasesByMerchantIds(uniqueSourceIds);

      for (const candidate of candidateAliases) {
        const key = `${candidate.matchType}|${candidate.pattern.toLowerCase()}`;
        if (!seenAliasKeys.has(key)) {
          this.repository.insertAlias({
            id: `alias-${crypto.randomUUID()}`,
            merchantId: input.targetMerchantId,
            pattern: candidate.pattern,
            matchType: candidate.matchType,
          });
          seenAliasKeys.add(key);
        }
      }

      this.repository.deleteMerchantsByIds(uniqueSourceIds);

      return reassignedCount;
    });

    return {
      mergedMerchant: this.getMerchantDtoById(input.targetMerchantId),
      reassignedTransactionsCount,
    };
  }
}
