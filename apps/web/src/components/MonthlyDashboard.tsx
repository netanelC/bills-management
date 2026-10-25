import React, { useCallback, useEffect, useState } from 'react';
import {
  CardholderSchema,
  CardSchema,
  CategorySchema,
  MonthlyAnalyticsResponseSchema,
  TransactionsListResponseSchema,
  type CardDto,
  type CardholderDto,
  type CategoryDto,
  type MonthlyAnalyticsResponseDto,
  type SpendingNature,
  type TransactionListItemDto,
  type UpdateTransactionInput,
} from '@bills/shared';
import {
  FutureInstallmentsSection,
  MultiMonthTrendsSection,
  SPENDING_NATURE_LABELS,
  TopMerchantsSection,
} from './MonthlyLongitudinalWidgets.js';
import {
  requestTransactionUpdate,
  TransactionInlineControls,
} from './TransactionInlineControls.js';
import { Money } from '../utils/format.js';

function buildSliceSearchParams(params: {
  billingMonth?: string;
  cardholderId: string;
  cardId: string;
  spendingNature: string;
  categoryId: string;
  merchantId?: string;
  search?: string;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (params.billingMonth) query.set('billingMonth', params.billingMonth);
  if (params.cardholderId) query.set('cardholderId', params.cardholderId);
  if (params.cardId) query.set('cardId', params.cardId);
  if (params.spendingNature) query.set('spendingNature', params.spendingNature);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.merchantId) query.set('merchantId', params.merchantId);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return query;
}

function getBudgetBarColor(utilizationPercent: number): {
  barClass: string;
  badgeClass: string;
  label: string;
} {
  if (utilizationPercent >= 100) {
    return {
      barClass: 'bg-rose-500',
      badgeClass: 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20',
      label: 'חריגה מהיעד',
    };
  }
  if (utilizationPercent >= 75) {
    return {
      barClass: 'bg-amber-500',
      badgeClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
      label: 'מתקרב ליעד',
    };
  }
  return {
    barClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
    label: 'במסגרת היעד',
  };
}

export function MonthlyDashboard(): React.ReactElement {
  const [cardholders, setCardholders] = useState<CardholderDto[]>([]);
  const [cards, setCards] = useState<CardDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [analytics, setAnalytics] =
    useState<MonthlyAnalyticsResponseDto | null>(null);
  const [transactions, setTransactions] = useState<TransactionListItemDto[]>(
    [],
  );

  const [selectedBillingMonth, setSelectedBillingMonth] = useState<string>('');
  const [selectedCardholderId, setSelectedCardholderId] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [selectedSpendingNature, setSelectedSpendingNature] =
    useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chartViewMode, setChartViewMode] = useState<'bar' | 'donut'>('bar');
  const [topMerchantsScope, setTopMerchantsScope] = useState<
    'selected-month' | 'multi-month'
  >('selected-month');

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadDashboardData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const analyticsQuery = buildSliceSearchParams({
        billingMonth: selectedBillingMonth,
        cardholderId: selectedCardholderId,
        cardId: selectedCardId,
        spendingNature: selectedSpendingNature,
        categoryId: selectedCategoryId,
      });

      const [chRes, cardsRes, catsRes, analyticsRes] = await Promise.all([
        fetch('/api/cardholders'),
        fetch('/api/cards'),
        fetch('/api/categories'),
        fetch(
          analyticsQuery.toString()
            ? `/api/analytics/monthly?${analyticsQuery.toString()}`
            : '/api/analytics/monthly',
        ),
      ]);

      if (!chRes.ok || !cardsRes.ok || !catsRes.ok || !analyticsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const rawCh = (await chRes.json()) as { cardholders?: unknown };
      const rawCards = (await cardsRes.json()) as { cards?: unknown };
      const rawCats = (await catsRes.json()) as { categories?: unknown };
      const rawAnalytics: unknown = await analyticsRes.json();

      const parsedCh = CardholderSchema.array().safeParse(
        rawCh.cardholders ?? [],
      );
      const parsedCards = CardSchema.array().safeParse(rawCards.cards ?? []);
      const parsedCats = CategorySchema.array().safeParse(
        rawCats.categories ?? [],
      );
      const parsedAnalytics =
        MonthlyAnalyticsResponseSchema.safeParse(rawAnalytics);

      if (parsedCh.success) setCardholders(parsedCh.data);
      if (parsedCards.success) setCards(parsedCards.data);
      if (parsedCats.success) setCategories(parsedCats.data);

      const effectiveMonth = parsedAnalytics.success
        ? (parsedAnalytics.data.selectedBillingMonth ?? selectedBillingMonth)
        : selectedBillingMonth;

      if (parsedAnalytics.success) {
        setAnalytics(parsedAnalytics.data);
      }

      const shouldIncludeMonthInDrilldown = !(
        selectedMerchantId && topMerchantsScope === 'multi-month'
      );

      const txQuery = buildSliceSearchParams({
        billingMonth: shouldIncludeMonthInDrilldown
          ? effectiveMonth
          : undefined,
        cardholderId: selectedCardholderId,
        cardId: selectedCardId,
        spendingNature: selectedSpendingNature,
        categoryId: selectedCategoryId,
        merchantId: selectedMerchantId,
        search: searchQuery,
      });

      const txRes = await fetch(
        txQuery.toString()
          ? `/api/transactions?${txQuery.toString()}`
          : '/api/transactions',
      );
      if (txRes.ok) {
        const rawTxs: unknown = await txRes.json();
        const parsedTxs = TransactionsListResponseSchema.safeParse(rawTxs);
        if (parsedTxs.success) {
          setTransactions(parsedTxs.data.transactions);
        }
      }

      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בטעינת נתוני הדשבורד החודשי');
    } finally {
      setLoading(false);
    }
  }, [
    selectedBillingMonth,
    selectedCardholderId,
    selectedCardId,
    selectedSpendingNature,
    selectedCategoryId,
    selectedMerchantId,
    topMerchantsScope,
    searchQuery,
  ]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  async function handleUpdateTransaction(
    transactionId: string,
    payload: UpdateTransactionInput,
  ): Promise<void> {
    try {
      setErrorMessage(null);
      await requestTransactionUpdate(transactionId, payload);
      setStatusMessage('פרטי העסקה עודכנו והדשבורד חושב מחדש');
      await loadDashboardData();
    } catch {
      setErrorMessage('שגיאה בעדכון העסקה');
    }
  }

  function handleResetFilters(): void {
    setSelectedCardholderId('');
    setSelectedCardId('');
    setSelectedSpendingNature('');
    setSelectedCategoryId('');
    setSelectedMerchantId('');
    setSearchQuery('');
  }

  const hasActiveSliceFilter = Boolean(
    selectedCardholderId ||
      selectedCardId ||
      selectedSpendingNature ||
      selectedCategoryId ||
      selectedMerchantId ||
      searchQuery.trim(),
  );

  const activeBillingMonthValue =
    selectedBillingMonth || analytics?.selectedBillingMonth || '';

  const visibleCategories = (analytics?.categoryBreakdown ?? []).filter(
    (c) =>
      c.totalIls !== 0 ||
      c.budgetTargetIls !== null ||
      c.previousMonthIls !== 0,
  );

  let cumulativePercent = 0;

  return (
    <div className="space-y-8">
      {/* Header & Sub-Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">
            שלב 4
          </span>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            דשבורד חודשי
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveSliceFilter ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              נקה סינונים פעילים
            </button>
          ) : null}
          {analytics ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                חודש חיוב: <strong className="text-slate-900">{analytics.selectedBillingMonth ?? '—'}</strong>
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-600/20 flex items-center gap-1">
                <span>סה&quot;כ הוצאה:</span>
                <Money amount={analytics.totalNetSpendIls} className="text-emerald-950 font-bold" />
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Global Filter Controls */}
      <section
        aria-label="סינון גלובלי לדשבורד"
        className="grid gap-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 sm:grid-cols-5"
      >
        <label className="block text-xs font-medium text-slate-700">
          חודש חיוב
          <select
            aria-label="חודש חיוב פעיל"
            value={activeBillingMonthValue}
            onChange={(e) => setSelectedBillingMonth(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          >
            {(analytics?.availableBillingMonths ?? []).length === 0 ? (
              <option value="">אין חודשי חיוב</option>
            ) : null}
            {(analytics?.availableBillingMonths ?? []).map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          מחזיק כרטיס
          <select
            aria-label="סינון לפי מחזיק כרטיס"
            value={selectedCardholderId}
            onChange={(e) => setSelectedCardholderId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">כל משק הבית</option>
            {cardholders.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          כרטיס אשראי
          <select
            aria-label="סינון דשבורד לפי כרטיס"
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">כל הכרטיסים</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname} ({c.lastFourDigits})
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          אופי הוצאה
          <select
            aria-label="סינון לפי אופי הוצאה"
            value={selectedSpendingNature}
            onChange={(e) => setSelectedSpendingNature(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">כל סוגי ההוצאות</option>
            <option value="FIXED">הוצאות קבועות</option>
            <option value="VARIABLE">הוצאות משתנות</option>
            <option value="DISCRETIONARY">פינוקים ופנאי</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          קטגוריה
          <select
            aria-label="סינון לפי קטגוריה"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          >
            <option value="">כל הקטגוריות</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
            <option value="UNCATEGORIZED">ללא קטגוריה</option>
          </select>
        </label>
      </section>

      {loading && !analytics ? (
        <div className="py-6 text-center text-sm text-slate-500">
          טוען נתוני דשבורד לחודש החיוב...
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-2xs"
        >
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-2xs"
        >
          {statusMessage}
        </div>
      ) : null}

      {analytics ? (
        <>
          {/* Top-level KPI Cards with Hero Metric on KPI 1 */}
          <section className="grid gap-4 md:grid-cols-3">
            {/* KPI 1: Hero Metric - Total Net Spend */}
            <div
              data-testid="kpi-total-net-spend"
              className="relative overflow-hidden rounded-2xl border-2 border-indigo-200 bg-linear-to-br from-white via-indigo-50/20 to-indigo-100/30 p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    סך הוצאה נטו
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                    {analytics.selectedBillingMonth ?? '—'}
                  </span>
                </div>
                <div className="mt-3 text-3xl font-extrabold text-slate-900 tracking-tight">
                  <Money amount={analytics.totalNetSpendIls} />
                </div>
              </div>

              <div className="mt-4 border-t border-indigo-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  ממוצע קודם: <Money amount={analytics.trailingAverageSpendIls} className="font-semibold text-slate-800" />
                </span>
                {analytics.deltaVsTrailingAveragePercent !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
                      analytics.deltaVsTrailingAverageIls > 0
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                    }`}
                  >
                    <span>{analytics.deltaVsTrailingAverageIls > 0 ? '+' : ''}{analytics.deltaVsTrailingAveragePercent}%</span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* KPI 2: Spending Nature Breakdown with Mini Progress Bars */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-3">
                  התפלגות לפי אופי הוצאה (לחץ לסינון)
                </p>
                <div className="space-y-2.5">
                  {analytics.spendingNatureBreakdown.map((item) => {
                    const isSelected =
                      selectedSpendingNature === item.spendingNature;
                    const barWidth = Math.min(100, Math.max(0, item.sharePercent));
                    return (
                      <button
                        key={item.spendingNature}
                        type="button"
                        data-testid={`dashboard-nature-${item.spendingNature}`}
                        onClick={() =>
                          setSelectedSpendingNature((prev) =>
                            prev === item.spendingNature
                              ? ''
                              : item.spendingNature,
                          )
                        }
                        className={`group w-full rounded-xl p-2 text-right transition-all ${
                          isSelected
                            ? 'bg-indigo-50/80 ring-2 ring-indigo-500 shadow-2xs'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-800">
                            {SPENDING_NATURE_LABELS[item.spendingNature as SpendingNature] ?? item.spendingNature}
                          </span>
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Money amount={item.totalIls} />
                            <span className="text-[11px] text-slate-500 font-normal">
                              ({item.sharePercent}%)
                            </span>
                          </div>
                        </div>
                        {/* Mini Progress Bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor:
                                item.spendingNature === 'FIXED'
                                  ? '#3b82f6'
                                  : item.spendingNature === 'VARIABLE'
                                    ? '#10b981'
                                    : '#f43f5e',
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* KPI 3: Cardholder Split with Mini Progress Bars */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-3">
                  חלוקה לפי מחזיק כרטיס (לחץ לסינון)
                </p>
                <div className="space-y-2.5">
                  {analytics.cardholderBreakdown.map((holder, idx) => {
                    const isSelected =
                      selectedCardholderId === holder.cardholderId;
                    const barWidth = Math.min(100, Math.max(0, holder.sharePercent));
                    const holderColor = idx === 0 ? '#6366f1' : '#06b6d4';
                    return (
                      <button
                        key={holder.cardholderId}
                        type="button"
                        data-testid={`dashboard-cardholder-${holder.cardholderId}`}
                        onClick={() =>
                          setSelectedCardholderId((prev) =>
                            prev === holder.cardholderId
                              ? ''
                              : holder.cardholderId,
                          )
                        }
                        className={`group w-full rounded-xl p-2 text-right transition-all ${
                          isSelected
                            ? 'bg-indigo-50/80 ring-2 ring-indigo-500 shadow-2xs'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-slate-800">
                            {holder.cardholderName}
                            <span className="text-[11px] text-slate-400 mr-1.5 font-normal">
                              ({holder.transactionCount} עסקאות)
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            <Money amount={holder.totalIls} />
                            <span className="text-[11px] text-slate-500 font-normal">
                              ({holder.sharePercent}%)
                            </span>
                          </div>
                        </div>
                        {/* Mini Progress Bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: holderColor,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Category Breakdown Visualization + Semantic Budget Utilization */}
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  פילוח לפי קטגוריה ויעדי תקציב
                </h3>
                <p className="text-xs text-slate-500">
                  לחץ על כל קטגוריה לסינון טבלת העסקאות למטה
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setChartViewMode('bar')}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    chartViewMode === 'bar'
                      ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  תרשים עמודות
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('donut')}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    chartViewMode === 'donut'
                      ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  תרשים עוגה
                </button>
              </div>
            </div>

            {chartViewMode === 'donut' ? (
              <div
                data-testid="category-donut-view"
                className="flex flex-wrap items-center justify-center gap-8 rounded-xl bg-slate-50/70 p-4"
              >
                <svg
                  viewBox="0 0 42 42"
                  className="h-44 w-44"
                  aria-label="תרשים עוגה לפי קטגוריה"
                >
                  <circle
                    cx="21"
                    cy="21"
                    r="15.9155"
                    fill="transparent"
                    stroke="#e2e8f0"
                    strokeWidth="5"
                  />
                  {visibleCategories
                    .filter((c) => c.sharePercent > 0)
                    .map((cat) => {
                      const filterKey = cat.categoryId ?? 'UNCATEGORIZED';
                      const slicePercent = Math.min(
                        100,
                        Math.max(0, cat.sharePercent),
                      );
                      const dashArray = `${slicePercent} ${100 - slicePercent}`;
                      const dashOffset = 25 - cumulativePercent;
                      cumulativePercent += slicePercent;
                      return (
                        <circle
                          key={filterKey}
                          data-testid={`donut-slice-${filterKey}`}
                          cx="21"
                          cy="21"
                          r="15.9155"
                          fill="transparent"
                          stroke={cat.color}
                          strokeWidth="5"
                          strokeDasharray={dashArray}
                          strokeDashoffset={dashOffset}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          onClick={() =>
                            setSelectedCategoryId((prev) =>
                              prev === filterKey ? '' : filterKey,
                            )
                          }
                        />
                      );
                    })}
                </svg>

                <div className="flex flex-wrap gap-2 max-w-md">
                  {visibleCategories.map((cat) => {
                    const filterKey = cat.categoryId ?? 'UNCATEGORIZED';
                    return (
                      <button
                        key={filterKey}
                        type="button"
                        onClick={() =>
                          setSelectedCategoryId((prev) =>
                            prev === filterKey ? '' : filterKey,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-2xs hover:bg-slate-50 transition-colors"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-semibold text-slate-800">
                          {cat.categoryName}
                        </span>
                        <span className="text-slate-500">
                          ({cat.sharePercent}%)
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Category Rows with Semantic Budget Coloring */}
            <div className="space-y-3">
              {visibleCategories.map((cat) => {
                const filterKey = cat.categoryId ?? 'UNCATEGORIZED';
                const isSelected = selectedCategoryId === filterKey;
                const barWidthPercent = Math.min(
                  100,
                  Math.max(0, cat.sharePercent),
                );
                const budgetBarPercent =
                  cat.budgetUtilizationPercent !== null
                    ? Math.min(100, Math.max(0, cat.budgetUtilizationPercent))
                    : null;

                const budgetStatus =
                  cat.budgetUtilizationPercent !== null
                    ? getBudgetBarColor(cat.budgetUtilizationPercent)
                    : null;

                return (
                  <div
                    key={filterKey}
                    data-testid={`dashboard-category-row-${filterKey}`}
                    onClick={() =>
                      setSelectedCategoryId((prev) =>
                        prev === filterKey ? '' : filterKey,
                      )
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCategoryId((prev) =>
                          prev === filterKey ? '' : filterKey,
                        );
                      }
                    }}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/80 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-xs"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-bold text-slate-900 text-sm">
                          {cat.categoryName}
                        </span>
                        <span className="text-xs text-slate-400">
                          ({cat.transactionCount} עסקאות • {cat.sharePercent}% מהחודש)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs">
                        {/* Secondary stats in light gray */}
                        <span className="text-slate-400 hidden sm:inline">
                          ממוצע: <Money amount={cat.historicalAverageIls} className="text-slate-600" />
                        </span>
                        <span className="text-slate-400 hidden sm:inline">
                          קודם: <Money amount={cat.previousMonthIls} className="text-slate-600" />
                        </span>
                        {/* Hero prominence for Actual Spend */}
                        <div className="text-base font-extrabold text-slate-900">
                          <Money amount={cat.totalIls} />
                        </div>
                      </div>
                    </div>

                    {/* Category Share Horizontal Bar */}
                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${barWidthPercent}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>

                    {/* Semantic Budget Target Utilization Bar */}
                    {cat.budgetTargetIls !== null && budgetStatus ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">
                            יעד: <Money amount={cat.budgetTargetIls} className="font-semibold text-slate-800" /> ({cat.budgetUtilizationPercent ?? 0}%)
                          </span>
                          <span className={`rounded-full px-2 py-0.5 font-bold ${budgetStatus.badgeClass}`}>
                            {budgetStatus.label}
                          </span>
                        </div>
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${budgetStatus.barClass}`}
                            style={{ width: `${budgetBarPercent ?? 0}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <MultiMonthTrendsSection
            multiMonthTrends={analytics.multiMonthTrends}
            selectedBillingMonth={analytics.selectedBillingMonth}
            onSelectBillingMonth={(month) => setSelectedBillingMonth(month)}
            onSelectSpendingNature={(nature) =>
              setSelectedSpendingNature((prev) =>
                prev === nature ? '' : nature,
              )
            }
            onSelectCategoryId={(categoryId) =>
              setSelectedCategoryId((prev) =>
                prev === categoryId ? '' : categoryId,
              )
            }
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <TopMerchantsSection
              topMerchants={analytics.topMerchants}
              topMerchantsMultiMonth={analytics.topMerchantsMultiMonth}
              topMerchantsScope={topMerchantsScope}
              selectedMerchantId={selectedMerchantId}
              onChangeScope={setTopMerchantsScope}
              onToggleMerchant={(merchantId) =>
                setSelectedMerchantId((prev) =>
                  prev === merchantId ? '' : merchantId,
                )
              }
            />

            <FutureInstallmentsSection
              forecast={analytics.futureInstallmentsForecast}
            />
          </div>
        </>
      ) : null}

      {/* Interactive Drill-Down Transactions Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">
            {selectedMerchantId && topMerchantsScope === 'multi-month'
              ? `פירוט עסקאות בכל החודשים (${transactions.length})`
              : `פירוט עסקאות לחודש החיוב (${transactions.length})`}
          </h3>

          <input
            type="search"
            placeholder="חיפוש חופשי לפי בית עסק..."
            aria-label="חיפוש חופשי בעסקאות"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div
          data-testid="dashboard-drilldown-table"
          className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs"
        >
          <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-700 text-xs">
                  תאריך עסקה
                </th>
                <th className="px-4 py-3 font-bold text-slate-700 text-xs">
                  בית עסק
                </th>
                <th className="px-4 py-3 font-bold text-slate-700 text-xs">
                  כרטיס ומחזיק
                </th>
                <th className="px-4 py-3 font-bold text-slate-700 text-xs">
                  קטגוריה
                </th>
                <th className="px-4 py-3 font-bold text-slate-700 text-xs">
                  סכום חיוב בש&quot;ח
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-slate-600 text-xs font-mono">
                    {tx.purchaseDate}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 text-xs">
                    <div className="font-semibold text-slate-900">{tx.merchantName}</div>
                    {tx.rawMerchantName !== tx.merchantName ? (
                      <div className="text-[11px] text-slate-400">
                        {tx.rawMerchantName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {tx.cardNickname} ({tx.cardLastFourDigits}) •{' '}
                    {tx.cardholderName}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <TransactionInlineControls
                      transaction={tx}
                      categories={categories}
                      defaultOptionLabel={
                        tx.effectiveCategoryName
                          ? `ברירת מחדל (${tx.effectiveCategoryName})`
                          : 'ללא דריסת קטגוריה'
                      }
                      onUpdate={handleUpdateTransaction}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-xs">
                    <Money amount={tx.billedAmountIls} colored />
                  </td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-xs text-slate-400"
                  >
                    אין עסקאות התואמות לסינון הנוכחי.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
