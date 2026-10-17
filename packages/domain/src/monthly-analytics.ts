import type {
  BillingMonth,
  CardholderEntity,
  CategoryEntity,
  SpendingNature,
} from './index.js';
import { roundCurrency } from './statement-parser.js';

export interface AnalyticsTransactionInput {
  id: string;
  billingMonth: BillingMonth;
  cardId: string;
  cardholderId: string;
  cardholderName: string;
  merchantId: string;
  merchantName: string;
  rawMerchantName: string;
  purchaseDate: string;
  billedAmountIls: number;
  effectiveCategoryId: string | null;
  isExcluded: boolean;
}

export interface MonthlyAnalyticsSliceFilter {
  cardholderId?: string;
  cardId?: string;
  spendingNature?: SpendingNature;
  categoryId?: string;
}

export interface ComputeMonthlyAnalyticsParams {
  selectedBillingMonth?: BillingMonth | null;
  statementBillingMonths: readonly BillingMonth[];
  transactions: readonly AnalyticsTransactionInput[];
  categories: readonly CategoryEntity[];
  cardholders: readonly Pick<CardholderEntity, 'id' | 'name'>[];
  filter?: MonthlyAnalyticsSliceFilter;
}

export interface CategoryAnalyticsBucket {
  categoryId: string | null;
  categoryName: string;
  spendingNature: SpendingNature | null;
  color: string;
  totalIls: number;
  sharePercent: number;
  transactionCount: number;
  previousMonthIls: number;
  deltaVsPreviousMonthIls: number;
  historicalAverageIls: number;
  budgetTargetIls: number | null;
  budgetUtilizationPercent: number | null;
  isOverBudget: boolean;
}

const SPENDING_NATURES: readonly SpendingNature[] = [
  'FIXED',
  'VARIABLE',
  'DISCRETIONARY',
];

const MAX_TRAILING_MONTHS = 6;

export function matchesAnalyticsFilter(
  tx: AnalyticsTransactionInput,
  categoryById: ReadonlyMap<string, CategoryEntity>,
  filter?: MonthlyAnalyticsSliceFilter,
): boolean {
  if (!filter) return true;
  if (filter.cardholderId && tx.cardholderId !== filter.cardholderId) {
    return false;
  }
  if (filter.cardId && tx.cardId !== filter.cardId) {
    return false;
  }
  if (filter.categoryId) {
    if (filter.categoryId === 'UNCATEGORIZED') {
      if (tx.effectiveCategoryId !== null) return false;
    } else if (tx.effectiveCategoryId !== filter.categoryId) {
      return false;
    }
  }
  if (filter.spendingNature) {
    const cat = tx.effectiveCategoryId
      ? categoryById.get(tx.effectiveCategoryId)
      : undefined;
    if (!cat || cat.spendingNature !== filter.spendingNature) {
      return false;
    }
  }
  return true;
}

function buildCategoryAnalyticsBucket(params: {
  categoryId: string | null;
  categoryName: string;
  spendingNature: SpendingNature | null;
  color: string;
  budgetTargetIls: number | null;
  selectedMonthTxs: readonly AnalyticsTransactionInput[];
  activeEligibleTxs: readonly AnalyticsTransactionInput[];
  previousBillingMonth: BillingMonth | null;
  priorMonths: readonly BillingMonth[];
  totalNetSpendIls: number;
}): CategoryAnalyticsBucket {
  const {
    categoryId,
    categoryName,
    spendingNature,
    color,
    budgetTargetIls,
    selectedMonthTxs,
    activeEligibleTxs,
    previousBillingMonth,
    priorMonths,
    totalNetSpendIls,
  } = params;

  let totalIls = 0;
  let transactionCount = 0;
  for (const tx of selectedMonthTxs) {
    if (tx.effectiveCategoryId === categoryId) {
      totalIls = roundCurrency(totalIls + tx.billedAmountIls);
      transactionCount += 1;
    }
  }

  let previousMonthIls = 0;
  if (previousBillingMonth) {
    for (const tx of activeEligibleTxs) {
      if (
        tx.billingMonth === previousBillingMonth &&
        tx.effectiveCategoryId === categoryId
      ) {
        previousMonthIls = roundCurrency(previousMonthIls + tx.billedAmountIls);
      }
    }
  }

  let historicalAverageIls = 0;
  if (priorMonths.length > 0) {
    const priorMonthsSet = new Set(priorMonths);
    let sumPriorCat = 0;
    for (const tx of activeEligibleTxs) {
      if (
        priorMonthsSet.has(tx.billingMonth) &&
        tx.effectiveCategoryId === categoryId
      ) {
        sumPriorCat += tx.billedAmountIls;
      }
    }
    historicalAverageIls = roundCurrency(sumPriorCat / priorMonths.length);
  }

  const sharePercent =
    totalNetSpendIls > 0
      ? roundCurrency((totalIls / totalNetSpendIls) * 100)
      : 0;
  const deltaVsPreviousMonthIls = roundCurrency(totalIls - previousMonthIls);
  const budgetUtilizationPercent =
    budgetTargetIls !== null && budgetTargetIls > 0
      ? roundCurrency((totalIls / budgetTargetIls) * 100)
      : null;
  const isOverBudget =
    budgetTargetIls !== null &&
    budgetTargetIls > 0 &&
    totalIls > budgetTargetIls;

  return {
    categoryId,
    categoryName,
    spendingNature,
    color,
    totalIls,
    sharePercent,
    transactionCount,
    previousMonthIls,
    deltaVsPreviousMonthIls,
    historicalAverageIls,
    budgetTargetIls,
    budgetUtilizationPercent,
    isOverBudget,
  };
}

export function computeMonthlyAnalytics(params: ComputeMonthlyAnalyticsParams) {
  const categoryById = new Map(params.categories.map((c) => [c.id, c]));

  const monthsSet = new Set<BillingMonth>(params.statementBillingMonths);
  for (const tx of params.transactions) {
    monthsSet.add(tx.billingMonth);
  }
  const availableBillingMonths = Array.from(monthsSet).sort((a, b) =>
    b.localeCompare(a),
  );

  const selectedBillingMonth =
    params.selectedBillingMonth ?? availableBillingMonths[0] ?? null;

  const activeEligibleTxs = params.transactions.filter(
    (tx) =>
      !tx.isExcluded &&
      matchesAnalyticsFilter(tx, categoryById, params.filter),
  );

  const selectedMonthTxs = selectedBillingMonth
    ? activeEligibleTxs.filter(
        (tx) => tx.billingMonth === selectedBillingMonth,
      )
    : [];

  const totalNetSpendIls = roundCurrency(
    selectedMonthTxs.reduce((sum, tx) => sum + tx.billedAmountIls, 0),
  );

  const priorMonths = selectedBillingMonth
    ? availableBillingMonths
        .filter((m) => m < selectedBillingMonth)
        .slice(0, MAX_TRAILING_MONTHS)
    : [];
  const previousBillingMonth = priorMonths[0] ?? null;

  const spendByMonth = new Map<BillingMonth, number>();
  for (const tx of activeEligibleTxs) {
    spendByMonth.set(
      tx.billingMonth,
      roundCurrency(
        (spendByMonth.get(tx.billingMonth) ?? 0) + tx.billedAmountIls,
      ),
    );
  }

  const previousMonthSpendIls = previousBillingMonth
    ? (spendByMonth.get(previousBillingMonth) ?? 0)
    : 0;

  let trailingAverageSpendIls = 0;
  let deltaVsTrailingAverageIls = 0;
  let deltaVsTrailingAveragePercent: number | null = null;

  if (priorMonths.length > 0) {
    const sumPriorSpend = priorMonths.reduce(
      (sum, m) => sum + (spendByMonth.get(m) ?? 0),
      0,
    );
    trailingAverageSpendIls = roundCurrency(sumPriorSpend / priorMonths.length);
    deltaVsTrailingAverageIls = roundCurrency(
      totalNetSpendIls - trailingAverageSpendIls,
    );
    if (trailingAverageSpendIls > 0) {
      deltaVsTrailingAveragePercent = roundCurrency(
        ((totalNetSpendIls - trailingAverageSpendIls) /
          trailingAverageSpendIls) *
          100,
      );
    }
  }

  const spendingNatureBreakdown = SPENDING_NATURES.map((nature) => {
    let totalIls = 0;
    let transactionCount = 0;
    for (const tx of selectedMonthTxs) {
      const cat = tx.effectiveCategoryId
        ? categoryById.get(tx.effectiveCategoryId)
        : undefined;
      if (cat && cat.spendingNature === nature) {
        totalIls = roundCurrency(totalIls + tx.billedAmountIls);
        transactionCount += 1;
      }
    }
    const sharePercent =
      totalNetSpendIls > 0
        ? roundCurrency((totalIls / totalNetSpendIls) * 100)
        : 0;
    return {
      spendingNature: nature,
      totalIls,
      sharePercent,
      transactionCount,
    };
  });

  const cardholderBreakdown = params.cardholders.map((ch) => {
    let totalIls = 0;
    let transactionCount = 0;
    for (const tx of selectedMonthTxs) {
      if (tx.cardholderId === ch.id) {
        totalIls = roundCurrency(totalIls + tx.billedAmountIls);
        transactionCount += 1;
      }
    }
    const sharePercent =
      totalNetSpendIls > 0
        ? roundCurrency((totalIls / totalNetSpendIls) * 100)
        : 0;
    return {
      cardholderId: ch.id,
      cardholderName: ch.name,
      totalIls,
      sharePercent,
      transactionCount,
    };
  });

  const sortedCategories = [...params.categories].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const categoryBreakdown: CategoryAnalyticsBucket[] = sortedCategories.map(
    (cat) =>
      buildCategoryAnalyticsBucket({
        categoryId: cat.id,
        categoryName: cat.name,
        spendingNature: cat.spendingNature,
        color: cat.color,
        budgetTargetIls: cat.budgetTargetIls,
        selectedMonthTxs,
        activeEligibleTxs,
        previousBillingMonth,
        priorMonths,
        totalNetSpendIls,
      }),
  );

  const hasUncategorizedInSelectedMonth = selectedMonthTxs.some(
    (tx) => tx.effectiveCategoryId === null,
  );
  if (hasUncategorizedInSelectedMonth) {
    categoryBreakdown.push(
      buildCategoryAnalyticsBucket({
        categoryId: null,
        categoryName: 'ללא קטגוריה',
        spendingNature: null,
        color: '#94a3b8',
        budgetTargetIls: null,
        selectedMonthTxs,
        activeEligibleTxs,
        previousBillingMonth,
        priorMonths,
        totalNetSpendIls,
      }),
    );
  }

  return {
    selectedBillingMonth,
    availableBillingMonths,
    totalNetSpendIls,
    trailingAverageSpendIls,
    deltaVsTrailingAverageIls,
    deltaVsTrailingAveragePercent,
    previousBillingMonth,
    previousMonthSpendIls,
    spendingNatureBreakdown,
    cardholderBreakdown,
    categoryBreakdown,
  };
}
