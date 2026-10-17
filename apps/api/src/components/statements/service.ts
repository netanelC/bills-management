import crypto from 'node:crypto';
import {
  assignStatementFingerprints,
  buildResolvedTransactionItem,
  computeMonthlyAnalytics,
  matchesAnalyticsFilter,
  parseStatementBuffer,
  parseStatementText,
  resolveMerchantByAliases,
  roundCurrency,
  type ColumnMappingOverride,
  type ParseStatementOptions,
} from '@bills/domain';
import type {
  BillingMonth,
  CardDto,
  CardProvider,
  CoverageCellDto,
  CoverageMatrixResponseDto,
  MonthlyAnalyticsResponseDto,
  SpendingNature,
  StatementCommitRequestInput,
  StatementCommitResponseDto,
  StatementPreviewFileItemDto,
  StatementPreviewResponseDto,
  TransactionListItemDto,
  UpdateTransactionInput,
} from '@bills/shared';
import { AppError } from '../../errors/app-error.js';
import type {
  ListTransactionsFilter,
  StatementsRepository,
} from './repository.js';

export interface PreviewFilePayload {
  filename: string;
  buffer?: Buffer;
  contentText?: string;
  columnMapping?: ColumnMappingOverride;
  cardLastFourOverride?: string;
  billingMonthOverride?: BillingMonth;
  providerOverride?: CardProvider;
}

export class StatementsService {
  constructor(private readonly repository: StatementsRepository) {}

  previewStatements(
    files: readonly PreviewFilePayload[],
  ): StatementPreviewResponseDto {
    const previewItems: StatementPreviewFileItemDto[] = [];

    for (const file of files) {
      const parseOptions: ParseStatementOptions = {
        filename: file.filename,
        columnMapping: file.columnMapping,
        cardLastFourOverride: file.cardLastFourOverride,
        billingMonthOverride: file.billingMonthOverride,
        providerOverride: file.providerOverride,
      };

      const parsed = file.buffer
        ? parseStatementBuffer(file.buffer, parseOptions)
        : parseStatementText(file.contentText ?? '', parseOptions);

      const existingCard = parsed.detectedLastFour
        ? this.repository.findCardByLastFour(parsed.detectedLastFour)
        : null;

      const fingerprints = parsed.transactions.map((t) => t.dedupFingerprint);
      const existingFingerprints =
        this.repository.findExistingDedupFingerprints(fingerprints);

      let newTransactionsCount = 0;
      let duplicateTransactionsCount = 0;

      const previewTransactions = parsed.transactions.map((tx) => {
        const isDuplicate = existingFingerprints.has(tx.dedupFingerprint);
        if (isDuplicate) {
          duplicateTransactionsCount += 1;
        } else {
          newTransactionsCount += 1;
        }
        return {
          ...tx,
          isDuplicate,
        };
      });

      previewItems.push({
        filename: file.filename,
        detectedLastFour: parsed.detectedLastFour,
        detectedProvider: existingCard?.provider ?? parsed.detectedProvider,
        existingCard,
        detectedBillingMonth: parsed.detectedBillingMonth,
        requiresColumnMapping: parsed.requiresColumnMapping,
        availableHeaders: parsed.availableHeaders,
        sampleRows: parsed.sampleRows,
        newTransactionsCount,
        duplicateTransactionsCount,
        totalBilledIls: parsed.totalBilledIls,
        transactions: previewTransactions,
      });
    }

    return { files: previewItems };
  }

  private resolveOrCreateMerchantId(rawMerchantName: string): string {
    const cleanedRaw = rawMerchantName.replace(/\s+/g, ' ').trim();
    const allMerchants = this.repository.listAllMerchants();
    const allAliases = this.repository.listAllMerchantAliases();

    const resolution = resolveMerchantByAliases(
      cleanedRaw,
      allMerchants,
      allAliases,
    );

    if (resolution.matchedMerchantId) {
      return resolution.matchedMerchantId;
    }

    const merchantId = `merchant-${crypto.randomUUID()}`;
    this.repository.insertMerchant({
      id: merchantId,
      canonicalName: resolution.normalizedCanonicalName,
      defaultCategoryId: null,
      isAmbiguous: false,
      createdAt: new Date().toISOString(),
    });

    this.repository.insertMerchantAlias({
      id: `alias-${crypto.randomUUID()}`,
      merchantId,
      pattern: cleanedRaw,
      matchType: 'EXACT',
    });

    return merchantId;
  }

  commitStatements(
    input: StatementCommitRequestInput,
  ): StatementCommitResponseDto {
    const seenNewCardsInBatch = new Set<string>();

    for (const file of input.files) {
      const existingCard = this.repository.findCardByLastFour(
        file.cardLastFour,
      );
      if (!existingCard && !seenNewCardsInBatch.has(file.cardLastFour)) {
        if (!file.newCardOnboarding) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            httpCode: 400,
            description: `Card ending in ${file.cardLastFour} is not registered and requires newCardOnboarding details`,
          });
        }
        if (
          !this.repository.cardholderExists(file.newCardOnboarding.cardholderId)
        ) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            httpCode: 400,
            description: `Cardholder '${file.newCardOnboarding.cardholderId}' does not exist`,
          });
        }
        seenNewCardsInBatch.add(file.cardLastFour);
      }
    }

    return this.repository.runInTransaction(() => {
      let importedStatementsCount = 0;
      let newCardsCount = 0;
      let newTransactionsCount = 0;
      let skippedDuplicatesCount = 0;
      const touchedCards = new Map<string, CardDto>();

      for (const file of input.files) {
        const fingerprintedTransactions = assignStatementFingerprints(
          file.cardLastFour,
          file.billingMonth,
          file.transactions,
        );

        let card = this.repository.findCardByLastFour(file.cardLastFour);
        if (!card) {
          const onboarding = file.newCardOnboarding!;
          const createdCard: CardDto = {
            id: `card-${crypto.randomUUID()}`,
            cardholderId: onboarding.cardholderId,
            lastFourDigits: file.cardLastFour,
            provider: (onboarding.provider ?? file.provider) as CardProvider,
            nickname: onboarding.nickname.trim(),
            createdAt: new Date().toISOString(),
          };
          this.repository.insertCard(createdCard);
          card = createdCard;
          newCardsCount += 1;
        }
        touchedCards.set(card.id, card);

        const existingFingerprints =
          this.repository.findExistingDedupFingerprints(
            fingerprintedTransactions.map((t) => t.dedupFingerprint),
          );

        const newTxInputs = fingerprintedTransactions.filter(
          (tx) => !existingFingerprints.has(tx.dedupFingerprint),
        );
        const fileDuplicatesCount =
          fingerprintedTransactions.length - newTxInputs.length;
        skippedDuplicatesCount += fileDuplicatesCount;

        const addedTotalBilledIls = roundCurrency(
          newTxInputs.reduce((acc, tx) => acc + tx.billedAmountIls, 0),
        );

        let statement = this.repository.findStatementByCardAndMonth(
          card.id,
          file.billingMonth,
        );

        if (!statement) {
          const newStatement = {
            id: `stmt-${crypto.randomUUID()}`,
            cardId: card.id,
            billingMonth: file.billingMonth,
            sourceFilename: file.filename,
            totalBilledIls: addedTotalBilledIls,
            importedAt: new Date().toISOString(),
          };
          this.repository.insertStatement(newStatement);
          statement = newStatement;
          importedStatementsCount += 1;
        } else if (newTxInputs.length > 0) {
          const updatedTotal = roundCurrency(
            statement.totalBilledIls + addedTotalBilledIls,
          );
          this.repository.updateStatementTotal(statement.id, updatedTotal);
          statement = { ...statement, totalBilledIls: updatedTotal };
          importedStatementsCount += 1;
        }

        for (const txInput of newTxInputs) {
          const merchantId = this.resolveOrCreateMerchantId(
            txInput.rawMerchantName,
          );

          this.repository.insertTransaction({
            id: `tx-${crypto.randomUUID()}`,
            statementId: statement.id,
            cardId: card.id,
            merchantId,
            billingMonth: file.billingMonth,
            purchaseDate: txInput.purchaseDate,
            rawMerchantName: txInput.rawMerchantName,
            billedAmountIls: txInput.billedAmountIls,
            originalAmount: txInput.originalAmount,
            originalCurrency: txInput.originalCurrency,
            installmentCurrent: txInput.installmentCurrent,
            installmentTotal: txInput.installmentTotal,
            installmentTotalAmountIls: txInput.installmentTotalAmountIls,
            categoryOverrideId: null,
            notes: null,
            isExcluded: false,
            dedupFingerprint: txInput.dedupFingerprint,
          });

          newTransactionsCount += 1;
        }
      }

      return {
        importedStatementsCount,
        newCardsCount,
        newTransactionsCount,
        skippedDuplicatesCount,
        cards: Array.from(touchedCards.values()),
      };
    });
  }

  getCoverageMatrix(): CoverageMatrixResponseDto {
    const allCardholders = this.repository.listAllCardholders();
    const cardholderOrder = new Map(
      allCardholders.map((ch, idx) => [ch.id, idx]),
    );
    const cardholderNameById = new Map(
      allCardholders.map((ch) => [ch.id, ch.name]),
    );

    const allCards = [...this.repository.listAllCards()].sort((a, b) => {
      const orderA = cardholderOrder.get(a.cardholderId) ?? 999;
      const orderB = cardholderOrder.get(b.cardholderId) ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });

    const allStatements = this.repository.listAllStatements();
    const allTransactions = this.repository.listTransactionsRaw();

    const monthsSet = new Set<BillingMonth>();
    for (const stmt of allStatements) {
      monthsSet.add(stmt.billingMonth);
    }
    const billingMonths = Array.from(monthsSet).sort((a, b) =>
      b.localeCompare(a),
    );

    const txCountByCardMonth = new Map<string, number>();
    for (const tx of allTransactions) {
      const key = `${tx.cardId}|${tx.billingMonth}`;
      txCountByCardMonth.set(key, (txCountByCardMonth.get(key) ?? 0) + 1);
    }

    const statementByCardMonth = new Map<
      string,
      { id: string; totalBilledIls: number }
    >();
    for (const stmt of allStatements) {
      const key = `${stmt.cardId}|${stmt.billingMonth}`;
      statementByCardMonth.set(key, {
        id: stmt.id,
        totalBilledIls: stmt.totalBilledIls,
      });
    }

    const cardRows = allCards.map((card) => {
      const cells: Record<string, CoverageCellDto> = {};
      for (const month of billingMonths) {
        const key = `${card.id}|${month}`;
        const stmt = statementByCardMonth.get(key);
        const txCount = txCountByCardMonth.get(key) ?? 0;

        cells[month] = {
          hasStatement: Boolean(stmt),
          statementId: stmt?.id ?? null,
          totalBilledIls: stmt ? stmt.totalBilledIls : 0,
          transactionsCount: txCount,
        };
      }

      return {
        card,
        cardholderName: cardholderNameById.get(card.cardholderId) ?? '',
        cells,
      };
    });

    return {
      billingMonths,
      cards: cardRows,
    };
  }

  private loadTransactionLookupMaps() {
    const allCardholders = this.repository.listAllCardholders();
    const cardholderMap = new Map(allCardholders.map((c) => [c.id, c.name]));

    const allCards = this.repository.listAllCards();
    const cardMap = new Map(allCards.map((c) => [c.id, c]));

    const allMerchants = this.repository.listAllMerchants();
    const merchantMap = new Map(allMerchants.map((m) => [m.id, m]));

    const allCategories = this.repository.listAllCategories();
    const categoryNameById = new Map(allCategories.map((c) => [c.id, c.name]));
    const categoryById = new Map(allCategories.map((c) => [c.id, c]));

    return {
      allCardholders,
      allCategories,
      cardholderMap,
      cardMap,
      merchantMap,
      categoryNameById,
      categoryById,
    };
  }

  listTransactions(filter: ListTransactionsFilter): TransactionListItemDto[] {
    const {
      cardholderMap,
      cardMap,
      merchantMap,
      categoryNameById,
      categoryById,
    } = this.loadTransactionLookupMaps();

    const txRows = this.repository.listTransactionsRaw({
      billingMonth: filter.billingMonth,
      cardId: filter.cardId,
    });

    const normalizedSearch = filter.search?.trim().toLowerCase() ?? '';
    const items: TransactionListItemDto[] = [];

    for (const tx of txRows) {
      if (filter.includeExcluded === false && tx.isExcluded) {
        continue;
      }
      if (filter.merchantId && tx.merchantId !== filter.merchantId) {
        continue;
      }

      const card = cardMap.get(tx.cardId);
      if (!card) continue;

      const resolved = buildResolvedTransactionItem({
        tx,
        card,
        cardholderName: cardholderMap.get(card.cardholderId) ?? '',
        merchant: merchantMap.get(tx.merchantId),
        categoryNameById,
      });

      if (
        !matchesAnalyticsFilter(resolved, categoryById, {
          cardholderId: filter.cardholderId,
          cardId: filter.cardId,
          categoryId: filter.categoryId,
          spendingNature: filter.spendingNature,
        })
      ) {
        continue;
      }

      if (normalizedSearch.length > 0) {
        const haystacks = [
          resolved.rawMerchantName.toLowerCase(),
          resolved.merchantName.toLowerCase(),
          (resolved.notes ?? '').toLowerCase(),
        ];
        if (!haystacks.some((h) => h.includes(normalizedSearch))) {
          continue;
        }
      }

      items.push(resolved);
    }

    return items;
  }

  getMonthlyAnalytics(params: {
    billingMonth?: BillingMonth;
    cardholderId?: string;
    cardId?: string;
    spendingNature?: SpendingNature;
    categoryId?: string;
  }): MonthlyAnalyticsResponseDto {
    const { allCardholders, allCategories } = this.loadTransactionLookupMaps();
    const allStatements = this.repository.listAllStatements();
    const allResolvedTransactions = this.listTransactions({});

    return computeMonthlyAnalytics({
      selectedBillingMonth: params.billingMonth ?? null,
      statementBillingMonths: allStatements.map((s) => s.billingMonth),
      statements: allStatements,
      transactions: allResolvedTransactions,
      categories: allCategories,
      cardholders: allCardholders,
      filter: {
        cardholderId: params.cardholderId,
        cardId: params.cardId,
        spendingNature: params.spendingNature,
        categoryId: params.categoryId,
      },
    });
  }

  updateTransaction(
    id: string,
    input: UpdateTransactionInput,
  ): TransactionListItemDto {
    const existing = this.repository.findTransactionById(id);
    if (!existing) {
      throw new AppError({
        code: 'NOT_FOUND',
        httpCode: 404,
        description: `Transaction '${id}' was not found`,
      });
    }

    if (
      input.categoryOverrideId !== undefined &&
      input.categoryOverrideId !== null &&
      !this.repository.categoryExists(input.categoryOverrideId)
    ) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        httpCode: 400,
        description: `Category '${input.categoryOverrideId}' does not exist`,
      });
    }

    const fieldsToUpdate: Partial<{
      categoryOverrideId: string | null;
      notes: string | null;
      isExcluded: boolean;
    }> = {};

    if (input.categoryOverrideId !== undefined) {
      fieldsToUpdate.categoryOverrideId = input.categoryOverrideId;
    }
    if (input.notes !== undefined) {
      const cleanedNotes = input.notes === null ? null : input.notes.trim();
      fieldsToUpdate.notes =
        cleanedNotes && cleanedNotes.length > 0 ? cleanedNotes : null;
    }
    if (input.isExcluded !== undefined) {
      fieldsToUpdate.isExcluded = input.isExcluded;
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      this.repository.updateTransactionFields(id, fieldsToUpdate);
    }

    const updatedTx = this.repository.findTransactionById(id)!;
    const { cardholderMap, cardMap, merchantMap, categoryNameById } =
      this.loadTransactionLookupMaps();
    const card = cardMap.get(updatedTx.cardId);
    if (!card) {
      throw new AppError({
        code: 'NOT_FOUND',
        httpCode: 404,
        description: `Card '${updatedTx.cardId}' for Transaction '${id}' was not found`,
      });
    }

    return buildResolvedTransactionItem({
      tx: updatedTx,
      card,
      cardholderName: cardholderMap.get(card.cardholderId) ?? '',
      merchant: merchantMap.get(updatedTx.merchantId),
      categoryNameById,
    });
  }
}
