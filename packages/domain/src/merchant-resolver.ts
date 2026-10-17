import type { MerchantAliasEntity, MerchantEntity } from './index.js';
import { normalizeMerchantName } from './statement-parser.js';

export interface MerchantResolutionResult {
  matchedMerchantId: string | null;
  normalizedCanonicalName: string;
}

export function resolveMerchantByAliases(
  rawMerchantName: string,
  merchants: readonly Pick<MerchantEntity, 'id' | 'canonicalName'>[],
  aliases: readonly Pick<
    MerchantAliasEntity,
    'merchantId' | 'pattern' | 'matchType'
  >[],
): MerchantResolutionResult {
  const cleanedRaw = rawMerchantName.replace(/\s+/g, ' ').trim();
  const normalizedCanonicalName = normalizeMerchantName(cleanedRaw);
  const lowerRaw = cleanedRaw.toLowerCase();
  const lowerCanonical = normalizedCanonicalName.toLowerCase();

  for (const alias of aliases) {
    if (alias.matchType !== 'EXACT') continue;
    const patternLower = alias.pattern.replace(/\s+/g, ' ').trim().toLowerCase();
    if (
      patternLower.length > 0 &&
      (patternLower === lowerRaw || patternLower === lowerCanonical)
    ) {
      return {
        matchedMerchantId: alias.merchantId,
        normalizedCanonicalName,
      };
    }
  }

  const containsAliases = aliases
    .filter((a) => a.matchType === 'CONTAINS' && a.pattern.trim().length > 0)
    .sort((a, b) => b.pattern.trim().length - a.pattern.trim().length);

  for (const alias of containsAliases) {
    const patternLower = alias.pattern.replace(/\s+/g, ' ').trim().toLowerCase();
    if (
      lowerRaw.includes(patternLower) ||
      lowerCanonical.includes(patternLower)
    ) {
      return {
        matchedMerchantId: alias.merchantId,
        normalizedCanonicalName,
      };
    }
  }

  for (const merchant of merchants) {
    const canonicalLower = merchant.canonicalName
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (canonicalLower === lowerCanonical || canonicalLower === lowerRaw) {
      return {
        matchedMerchantId: merchant.id,
        normalizedCanonicalName,
      };
    }
  }

  return {
    matchedMerchantId: null,
    normalizedCanonicalName,
  };
}

export function resolveEffectiveCategoryId(params: {
  transactionCategoryOverrideId: string | null;
  merchantDefaultCategoryId: string | null;
  merchantIsAmbiguous: boolean;
}): string | null {
  if (params.transactionCategoryOverrideId !== null) {
    return params.transactionCategoryOverrideId;
  }
  if (params.merchantIsAmbiguous) {
    return null;
  }
  return params.merchantDefaultCategoryId;
}

export interface RawTransactionForMapping {
  id: string;
  statementId: string;
  cardId: string;
  merchantId: string;
  billingMonth: `${number}-${string}`;
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
}

export function buildResolvedTransactionItem(params: {
  tx: RawTransactionForMapping;
  card: {
    lastFourDigits: string;
    nickname: string;
    provider: 'ISRACARD' | 'AMEX' | 'OTHER';
    cardholderId: string;
  };
  cardholderName: string;
  merchant: {
    canonicalName: string;
    defaultCategoryId: string | null;
    isAmbiguous: boolean;
  } | undefined;
  categoryNameById: ReadonlyMap<string, string>;
}) {
  const { tx, card, cardholderName, merchant, categoryNameById } = params;
  const effectiveCategoryId = resolveEffectiveCategoryId({
    transactionCategoryOverrideId: tx.categoryOverrideId,
    merchantDefaultCategoryId: merchant?.defaultCategoryId ?? null,
    merchantIsAmbiguous: merchant?.isAmbiguous ?? false,
  });

  return {
    id: tx.id,
    statementId: tx.statementId,
    cardId: tx.cardId,
    cardLastFourDigits: card.lastFourDigits,
    cardNickname: card.nickname,
    cardProvider: card.provider,
    cardholderId: card.cardholderId,
    cardholderName,
    merchantId: tx.merchantId,
    merchantName: merchant?.canonicalName ?? tx.rawMerchantName,
    billingMonth: tx.billingMonth,
    purchaseDate: tx.purchaseDate,
    rawMerchantName: tx.rawMerchantName,
    billedAmountIls: tx.billedAmountIls,
    originalAmount: tx.originalAmount,
    originalCurrency: tx.originalCurrency,
    installmentCurrent: tx.installmentCurrent,
    installmentTotal: tx.installmentTotal,
    installmentTotalAmountIls: tx.installmentTotalAmountIls,
    categoryOverrideId: tx.categoryOverrideId,
    effectiveCategoryId,
    effectiveCategoryName: effectiveCategoryId
      ? (categoryNameById.get(effectiveCategoryId) ?? null)
      : null,
    notes: tx.notes,
    isExcluded: tx.isExcluded,
  };
}

