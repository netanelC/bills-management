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
  cardNickname: string;
  cardholderId: string;
  cardholderName: string;
  merchantId: string;
  merchantName: string;
  rawMerchantName: string;
  purchaseDate: string;
  billedAmountIls: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  effectiveCategoryId: string | null;
  isExcluded: boolean;
}

export interface MonthlyAnalyticsSliceFilter {
  cardholderId?: string;
  cardId?: string;
  spendingNature?: SpendingNature;
  categoryId?: string;
}

export interface StatementCardMonthRef {
  cardId: string;
  billingMonth: BillingMonth;
}

export interface ComputeMonthlyAnalyticsParams {
  selectedBillingMonth?: BillingMonth | null;
  statementBillingMonths: readonly BillingMonth[];
  statements?: readonly StatementCardMonthRef[];
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

export function addMonthsToBillingMonth(
  billingMonth: BillingMonth,
  offsetMonths: number,
): BillingMonth {
  const [yearPart, monthPart] = billingMonth.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const totalMonths = year * 12 + monthIndex + offsetMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
}

export interface TopMerchantBucket {
  merchantId: string;
  merchantName: string;
  totalIls: number;
  transactionCount: number;
  averageTransactionIls: number;
}

function computeTopMerchants(
  txs: readonly AnalyticsTransactionInput[],
): TopMerchantBucket[] {
  const map = new Map<
    string,
    { merchantName: string; totalIls: number; transactionCount: number }
  >();
  for (const tx of txs) {
    const existing = map.get(tx.merchantId);
    if (existing) {
      existing.totalIls = roundCurrency(existing.totalIls + tx.billedAmountIls);
      existing.transactionCount += 1;
    } else {
      map.set(tx.merchantId, {
        merchantName: tx.merchantName,
        totalIls: roundCurrency(tx.billedAmountIls),
        transactionCount: 1,
      });
    }
  }

  return Array.from(map.entries())
    .map(([merchantId, item]) => ({
      merchantId,
      merchantName: item.merchantName,
      totalIls: item.totalIls,
      transactionCount: item.transactionCount,
      averageTransactionIls: roundCurrency(
        item.totalIls / item.transactionCount,
      ),
    }))
    .sort((a, b) => {
      if (b.totalIls !== a.totalIls) {
        return b.totalIls - a.totalIls;
      }
      if (b.transactionCount !== a.transactionCount) {
        return b.transactionCount - a.transactionCount;
      }
      return a.merchantName.localeCompare(b.merchantName);
    });
}

const UNCATEGORIZED_CATEGORY_NAME = 'ללא קטגוריה';
const UNCATEGORIZED_CATEGORY_COLOR = '#94a3b8';

function summarizeSpendingByNature(
  txs: readonly AnalyticsTransactionInput[],
  categoryById: ReadonlyMap<string, CategoryEntity>,
) {
  return SPENDING_NATURES.map((nature) => {
    let totalIls = 0;
    let transactionCount = 0;
    for (const tx of txs) {
      const cat = tx.effectiveCategoryId
        ? categoryById.get(tx.effectiveCategoryId)
        : undefined;
      if (cat && cat.spendingNature === nature) {
        totalIls = roundCurrency(totalIls + tx.billedAmountIls);
        transactionCount += 1;
      }
    }
    return {
      spendingNature: nature,
      totalIls,
      transactionCount,
    };
  });
}

function computeMultiMonthTrends(params: {
  availableBillingMonths: readonly BillingMonth[];
  trendEligibleTxs: readonly AnalyticsTransactionInput[];
  sortedCategories: readonly CategoryEntity[];
  categoryById: ReadonlyMap<string, CategoryEntity>;
}) {
  const {
    availableBillingMonths,
    trendEligibleTxs,
    sortedCategories,
    categoryById,
  } = params;
  const chronologicalMonths = [...availableBillingMonths].sort((a, b) =>
    a.localeCompare(b),
  );
  const hasUncategorizedOverall = trendEligibleTxs.some(
    (tx) => tx.effectiveCategoryId === null,
  );

  return chronologicalMonths.map((month) => {
    const monthTxs = trendEligibleTxs.filter(
      (tx) => tx.billingMonth === month,
    );
    const totalNetSpendIls = roundCurrency(
      monthTxs.reduce((sum, tx) => sum + tx.billedAmountIls, 0),
    );

    const bySpendingNature = summarizeSpendingByNature(
      monthTxs,
      categoryById,
    ).map(({ spendingNature, totalIls }) => ({
      spendingNature,
      totalIls,
    }));

    const byCategory = sortedCategories.map((cat) => {
      let totalIls = 0;
      for (const tx of monthTxs) {
        if (tx.effectiveCategoryId === cat.id) {
          totalIls = roundCurrency(totalIls + tx.billedAmountIls);
        }
      }
      return {
        categoryId: cat.id as string | null,
        categoryName: cat.name,
        color: cat.color,
        totalIls,
      };
    });

    if (hasUncategorizedOverall) {
      let uncategorizedIls = 0;
      for (const tx of monthTxs) {
        if (tx.effectiveCategoryId === null) {
          uncategorizedIls = roundCurrency(
            uncategorizedIls + tx.billedAmountIls,
          );
        }
      }
      byCategory.push({
        categoryId: null,
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        color: UNCATEGORIZED_CATEGORY_COLOR,
        totalIls: uncategorizedIls,
      });
    }

    return {
      billingMonth: month,
      totalNetSpendIls,
      bySpendingNature,
      byCategory,
    };
  });
}

function computeFutureInstallmentsForecast(params: {
  allTransactions: readonly AnalyticsTransactionInput[];
  activeEligibleTxs: readonly AnalyticsTransactionInput[];
  statements?: readonly StatementCardMonthRef[];
}) {
  const { allTransactions, activeEligibleTxs, statements } = params;

  const latestBillingMonthByCardId = new Map<string, BillingMonth>();
  for (const stmt of statements ?? []) {
    const existing = latestBillingMonthByCardId.get(stmt.cardId);
    if (!existing || stmt.billingMonth > existing) {
      latestBillingMonthByCardId.set(stmt.cardId, stmt.billingMonth);
    }
  }
  for (const tx of allTransactions) {
    if (tx.isExcluded) continue;
    const existing = latestBillingMonthByCardId.get(tx.cardId);
    if (!existing || tx.billingMonth > existing) {
      latestBillingMonthByCardId.set(tx.cardId, tx.billingMonth);
    }
  }

  const upcomingMap = new Map<
    BillingMonth,
    { totalProjectedIls: number; dealsCount: number }
  >();

  const activeInstallmentDeals = [];
  for (const tx of activeEligibleTxs) {
    const latestCardMonth = latestBillingMonthByCardId.get(tx.cardId);
    if (!latestCardMonth || tx.billingMonth !== latestCardMonth) {
      continue;
    }
    if (
      tx.installmentCurrent === null ||
      tx.installmentTotal === null ||
      tx.installmentCurrent >= tx.installmentTotal
    ) {
      continue;
    }

    const remainingInstallmentsCount =
      tx.installmentTotal - tx.installmentCurrent;
    const monthlyAmountIls = roundCurrency(tx.billedAmountIls);
    const remainingTotalAmountIls = roundCurrency(
      monthlyAmountIls * remainingInstallmentsCount,
    );

    activeInstallmentDeals.push({
      transactionId: tx.id,
      merchantId: tx.merchantId,
      merchantName: tx.merchantName,
      rawMerchantName: tx.rawMerchantName,
      cardId: tx.cardId,
      cardNickname: tx.cardNickname,
      cardholderName: tx.cardholderName,
      sourceBillingMonth: tx.billingMonth,
      purchaseDate: tx.purchaseDate,
      monthlyAmountIls,
      installmentCurrent: tx.installmentCurrent,
      installmentTotal: tx.installmentTotal,
      remainingInstallmentsCount,
      remainingTotalAmountIls,
    });

    for (let offset = 1; offset <= remainingInstallmentsCount; offset += 1) {
      const targetMonth = addMonthsToBillingMonth(tx.billingMonth, offset);
      const current = upcomingMap.get(targetMonth);
      if (current) {
        current.totalProjectedIls = roundCurrency(
          current.totalProjectedIls + monthlyAmountIls,
        );
        current.dealsCount += 1;
      } else {
        upcomingMap.set(targetMonth, {
          totalProjectedIls: monthlyAmountIls,
          dealsCount: 1,
        });
      }
    }
  }

  activeInstallmentDeals.sort(
    (a, b) => b.remainingTotalAmountIls - a.remainingTotalAmountIls,
  );

  const upcomingMonths = Array.from(upcomingMap.entries())
    .map(([billingMonth, data]) => ({
      billingMonth,
      totalProjectedIls: data.totalProjectedIls,
      dealsCount: data.dealsCount,
    }))
    .sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));

  return {
    activeInstallmentDeals,
    upcomingMonths,
  };
}

export function computeMonthlyAnalytics(params: ComputeMonthlyAnalyticsParams) {
  const categoryById = new Map(params.categories.map((c) => [c.id, c]));

  const monthsSet = new Set<BillingMonth>(params.statementBillingMonths);
  for (const stmt of params.statements ?? []) {
    monthsSet.add(stmt.billingMonth);
  }
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

  const trendEligibleTxs = params.transactions.filter(
    (tx) =>
      !tx.isExcluded &&
      matchesAnalyticsFilter(tx, categoryById, {
        cardholderId: params.filter?.cardholderId,
        cardId: params.filter?.cardId,
      }),
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

  const spendingNatureBreakdown = summarizeSpendingByNature(
    selectedMonthTxs,
    categoryById,
  ).map((item) => ({
    ...item,
    sharePercent:
      totalNetSpendIls > 0
        ? roundCurrency((item.totalIls / totalNetSpendIls) * 100)
        : 0,
  }));

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
        categoryName: UNCATEGORIZED_CATEGORY_NAME,
        spendingNature: null,
        color: UNCATEGORIZED_CATEGORY_COLOR,
        budgetTargetIls: null,
        selectedMonthTxs,
        activeEligibleTxs,
        previousBillingMonth,
        priorMonths,
        totalNetSpendIls,
      }),
    );
  }

  const multiMonthTrends = computeMultiMonthTrends({
    availableBillingMonths,
    trendEligibleTxs,
    sortedCategories,
    categoryById,
  });

  const topMerchants = computeTopMerchants(selectedMonthTxs);
  const topMerchantsMultiMonth = computeTopMerchants(activeEligibleTxs);

  const futureInstallmentsForecast = computeFutureInstallmentsForecast({
    allTransactions: params.transactions,
    activeEligibleTxs,
    statements: params.statements,
  });

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
    multiMonthTrends,
    topMerchants,
    topMerchantsMultiMonth,
    futureInstallmentsForecast,
  };
}
