export type SpendingNature = 'FIXED' | 'VARIABLE' | 'DISCRETIONARY';
export type CardProvider = 'ISRACARD' | 'AMEX' | 'OTHER';
export type MerchantAliasMatchType = 'EXACT' | 'CONTAINS';
export type BillingMonth = `${number}-${string}`;

export interface CardholderEntity {
  id: string;
  name: string;
  createdAt: string;
}

export interface CardEntity {
  id: string;
  cardholderId: string;
  lastFourDigits: string;
  provider: CardProvider;
  nickname: string;
  createdAt: string;
}

export interface CategoryEntity {
  id: string;
  name: string;
  spendingNature: SpendingNature;
  color: string;
  budgetTargetIls: number | null;
  sortOrder: number;
}

export interface MerchantEntity {
  id: string;
  canonicalName: string;
  defaultCategoryId: string | null;
  isAmbiguous: boolean;
  createdAt: string;
}

export interface MerchantAliasEntity {
  id: string;
  merchantId: string;
  pattern: string;
  matchType: MerchantAliasMatchType;
}

export interface StatementEntity {
  id: string;
  cardId: string;
  billingMonth: BillingMonth;
  sourceFilename: string;
  totalBilledIls: number;
  importedAt: string;
}

export interface InstallmentInfo {
  installmentCurrent: number;
  installmentTotal: number;
  installmentTotalAmountIls: number | null;
}

export interface TransactionEntity {
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
  installmentInfo: InstallmentInfo | null;
  categoryOverrideId: string | null;
  notes: string | null;
  isExcluded: boolean;
  dedupFingerprint: string;
}
