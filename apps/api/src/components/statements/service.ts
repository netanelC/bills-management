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
  StatementCommitFileInput,
  StatementCommitRequestInput,
  StatementCommitResponseDto,
  StatementPreviewFileItemDto,
  StatementPreviewResponseDto,
  TransactionListItemDto,
  UpdateTransactionInput,
} from '@bills/shared';
import { AppError } from '../../errors/app-error.js';
import { buildEntityLookupMaps } from '../common/lookups.js';
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

  private validateNewCardOnboardings(
    files: readonly StatementCommitFileInput[],
  ): void {
    const seenNewCardsInBatch = new Set<string>();

    for (const file of files) {
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
  }

  private resolveOrCreateCardForCommit(
    file: StatementCommitFileInput,
  ): { card: CardDto; isNewCard: boolean } {
    let card = this.repository.findCardByLastFour(file.cardLastFour);
    if (card) {
      return { card, isNewCard: false };
    }
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
    return { card: createdCard, isNewCard: true };
  }

  private upsertStatementForCommit(params: {
    cardId: string;
    billingMonth: BillingMonth;
    filename: string;
    addedTotalBilledIls: number;
    hasNewTransactions: boolean;
  }): { statement: { id: string; totalBilledIls: number }; isNewStatement: boolean } {
    const { cardId, billingMonth, filename, addedTotalBilledIls, hasNewTransactions } =
      params;
    let statement = this.repository.findStatementByCardAndMonth(
      cardId,
      billingMonth,
    );

    if (!statement) {
      const newStatement = {
        id: `stmt-${crypto.randomUUID()}`,
        cardId,
        billingMonth,
        sourceFilename: filename,
        totalBilledIls: addedTotalBilledIls,
        importedAt: new Date().toISOString(),
      };
      this.repository.insertStatement(newStatement);
      return { statement: newStatement, isNewStatement: true };
    }

    if (hasNewTransactions) {
      const updatedTotal = roundCurrency(
        statement.totalBilledIls + addedTotalBilledIls,
      );
      this.repository.updateStatementTotal(statement.id, updatedTotal);
      return {
        statement: { ...statement, totalBilledIls: updatedTotal },
        isNewStatement: true,
      };
    }

    return { statement, isNewStatement: false };
  }

  private insertCommittedTransactions(params: {
    statementId: string;
    cardId: string;
    billingMonth: BillingMonth;
    newTxInputs: readonly (StatementCommitFileInput['transactions'][number] & {
      dedupFingerprint: string;
    })[];
  }): void {
    for (const txInput of params.newTxInputs) {
      const merchantId = this.resolveOrCreateMerchantId(
        txInput.rawMerchantName,
      );

      this.repository.insertTransaction({
        id: `tx-${crypto.randomUUID()}`,
        statementId: params.statementId,
        cardId: params.cardId,
        merchantId,
        billingMonth: params.billingMonth,
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
    }
  }

  commitStatements(
    input: StatementCommitRequestInput,
  ): StatementCommitResponseDto {
    this.validateNewCardOnboardings(input.files);

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

        const { card, isNewCard } = this.resolveOrCreateCardForCommit(file);
        if (isNewCard) newCardsCount += 1;
        touchedCards.set(card.id, card);

        const existingFingerprints =
          this.repository.findExistingDedupFingerprints(
            fingerprintedTransactions.map((t) => t.dedupFingerprint),
          );

        const newTxInputs = fingerprintedTransactions.filter(
          (tx) => !existingFingerprints.has(tx.dedupFingerprint),
        );
        skippedDuplicatesCount +=
          fingerprintedTransactions.length - newTxInputs.length;

        const addedTotalBilledIls = roundCurrency(
          newTxInputs.reduce((acc, tx) => acc + tx.billedAmountIls, 0),
        );

        const { statement, isNewStatement } = this.upsertStatementForCommit({
          cardId: card.id,
          billingMonth: file.billingMonth,
          filename: file.filename,
          addedTotalBilledIls,
          hasNewTransactions: newTxInputs.length > 0,
        });
        if (isNewStatement) importedStatementsCount += 1;

        this.insertCommittedTransactions({
          statementId: statement.id,
          cardId: card.id,
          billingMonth: file.billingMonth,
          newTxInputs,
        });
        newTransactionsCount += newTxInputs.length;
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
    const allCategories = this.repository.listAllCategories();
    const lookups = buildEntityLookupMaps({
      cardholders: allCardholders,
      cards: this.repository.listAllCards(),
      categories: allCategories,
      merchants: this.repository.listAllMerchants(),
    });

    return {
      allCardholders,
      allCategories,
      cardholderMap: lookups.cardholderNameMap,
      cardMap: lookups.cardMap,
      merchantMap: lookups.merchantMap,
      categoryNameById: lookups.categoryNameById,
      categoryById: lookups.categoryById,
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
