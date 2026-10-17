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

export interface DefaultCardholderSeed {
  id: string;
  name: string;
}

export interface DefaultCategorySeed {
  id: string;
  name: string;
  spendingNature: SpendingNature;
  color: string;
  sortOrder: number;
}

export const DEFAULT_CARDHOLDERS: readonly DefaultCardholderSeed[] = [
  { id: 'cardholder-primary', name: 'אני' },
  { id: 'cardholder-spouse', name: 'אשתי' },
];

export const DEFAULT_CATEGORIES: readonly DefaultCategorySeed[] = [
  // FIXED (הוצאות קבועות)
  {
    id: 'cat-fixed-housing',
    name: 'חשבונות ודיור',
    spendingNature: 'FIXED',
    color: '#3b82f6',
    sortOrder: 1,
  },
  {
    id: 'cat-fixed-telecom',
    name: 'תקשורת ומנויים',
    spendingNature: 'FIXED',
    color: '#6366f1',
    sortOrder: 2,
  },
  {
    id: 'cat-fixed-insurance',
    name: 'ביטוחים ובריאות',
    spendingNature: 'FIXED',
    color: '#0ea5e9',
    sortOrder: 3,
  },
  {
    id: 'cat-fixed-education',
    name: 'חינוך וחוגים',
    spendingNature: 'FIXED',
    color: '#8b5cf6',
    sortOrder: 4,
  },
  // VARIABLE (הוצאות מחיה משתנות)
  {
    id: 'cat-var-groceries',
    name: 'קניות וסופרמרקט',
    spendingNature: 'VARIABLE',
    color: '#10b981',
    sortOrder: 5,
  },
  {
    id: 'cat-var-pharma',
    name: 'פארם וטיפוח',
    spendingNature: 'VARIABLE',
    color: '#14b8a6',
    sortOrder: 6,
  },
  {
    id: 'cat-var-transport',
    name: 'תחבורה ודלק',
    spendingNature: 'VARIABLE',
    color: '#f59e0b',
    sortOrder: 7,
  },
  {
    id: 'cat-var-car',
    name: 'רכב ותחזוקה',
    spendingNature: 'VARIABLE',
    color: '#d97706',
    sortOrder: 8,
  },
  {
    id: 'cat-var-home',
    name: 'שונות לבית',
    spendingNature: 'VARIABLE',
    color: '#84cc16',
    sortOrder: 9,
  },
  // DISCRETIONARY (פינוקים ופנאי)
  {
    id: 'cat-disc-dining',
    name: 'פינוקים ומסעדות',
    spendingNature: 'DISCRETIONARY',
    color: '#f43f5e',
    sortOrder: 10,
  },
  {
    id: 'cat-disc-shopping',
    name: 'שופינג וביגוד',
    spendingNature: 'DISCRETIONARY',
    color: '#ec4899',
    sortOrder: 11,
  },
  {
    id: 'cat-disc-leisure',
    name: 'בילויים ופנאי',
    spendingNature: 'DISCRETIONARY',
    color: '#a855f7',
    sortOrder: 12,
  },
  {
    id: 'cat-disc-vacation',
    name: 'חופשות וטיולים',
    spendingNature: 'DISCRETIONARY',
    color: '#06b6d4',
    sortOrder: 13,
  },
  {
    id: 'cat-disc-gifts',
    name: 'מתנות ואירועים',
    spendingNature: 'DISCRETIONARY',
    color: '#eab308',
    sortOrder: 14,
  },
];

export * from './statement-parser.js';
export * from './merchant-resolver.js';
export * from './monthly-analytics.js';


