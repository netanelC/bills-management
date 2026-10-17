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
  requestTransactionUpdate,
  TransactionInlineControls,
} from './TransactionInlineControls.js';

const SPENDING_NATURE_LABELS: Record<SpendingNature, string> = {
  FIXED: 'הוצאות קבועות (FIXED)',
  VARIABLE: 'הוצאות משתנות (VARIABLE)',
  DISCRETIONARY: 'פינוקים ופנאי (DISCRETIONARY)',
};

function buildSliceSearchParams(params: {
  billingMonth?: string;
  cardholderId: string;
  cardId: string;
  spendingNature: string;
  categoryId: string;
  search?: string;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (params.billingMonth) query.set('billingMonth', params.billingMonth);
  if (params.cardholderId) query.set('cardholderId', params.cardholderId);
  if (params.cardId) query.set('cardId', params.cardId);
  if (params.spendingNature) query.set('spendingNature', params.spendingNature);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return query;
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [chartViewMode, setChartViewMode] = useState<'bar' | 'donut'>('bar');

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

      const txQuery = buildSliceSearchParams({
        billingMonth: effectiveMonth,
        cardholderId: selectedCardholderId,
        cardId: selectedCardId,
        spendingNature: selectedSpendingNature,
        categoryId: selectedCategoryId,
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
    setSearchQuery('');
  }

  const hasActiveSliceFilter = Boolean(
    selectedCardholderId ||
      selectedCardId ||
      selectedSpendingNature ||
      selectedCategoryId ||
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            דשבורד ניתוח חודשי (Billing Month)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            ניתוח הוצאות נטו בש&quot;ח לפי חודש חיוב, מעקב יעדי תקציב (Budget
            Target) וחקירת עסקאות אינטראקטיבית
          </p>
        </div>

        {hasActiveSliceFilter ? (
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            נקה סינונים פעילים
          </button>
        ) : null}
      </div>

      {/* Global Filter Controls */}
      <section
        aria-label="סינון גלובלי לדשבורד"
        className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-5"
      >
        <label className="block text-xs font-medium text-slate-700">
          חודש חיוב (Billing Month)
          <select
            aria-label="חודש חיוב פעיל"
            value={activeBillingMonthValue}
            onChange={(e) => setSelectedBillingMonth(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
          מחזיק כרטיס (Cardholder)
          <select
            aria-label="סינון לפי מחזיק כרטיס"
            value={selectedCardholderId}
            onChange={(e) => setSelectedCardholderId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
          כרטיס אשראי (Card)
          <select
            aria-label="סינון דשבורד לפי כרטיס"
            value={selectedCardId}
            onChange={(e) => setSelectedCardId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
          אופי הוצאה (Spending Nature)
          <select
            aria-label="סינון לפי אופי הוצאה"
            value={selectedSpendingNature}
            onChange={(e) => setSelectedSpendingNature(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="">כל סוגי ההוצאות</option>
            <option value="FIXED">הוצאות קבועות (FIXED)</option>
            <option value="VARIABLE">הוצאות משתנות (VARIABLE)</option>
            <option value="DISCRETIONARY">פינוקים ופנאי (DISCRETIONARY)</option>
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-700">
          קטגוריה (Category)
          <select
            aria-label="סינון לפי קטגוריה"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
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
        <div className="py-4 text-sm text-slate-500">
          טוען נתוני דשבורד לחודש החיוב...
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {statusMessage}
        </div>
      ) : null}

      {analytics ? (
        <>
          {/* Top-level KPI Cards */}
          <section className="grid gap-4 md:grid-cols-3">
            {/* KPI 1: Total Net Spend + Trailing Average Delta */}
            <div
              data-testid="kpi-total-net-spend"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
            >
              <p className="text-xs font-semibold text-slate-500">
                סה&quot;כ הוצאה נטו בחודש החיוב (
                {analytics.selectedBillingMonth ?? '—'})
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                ₪{analytics.totalNetSpendIls.toLocaleString('he-IL')}
              </p>
              <div className="mt-2 text-xs text-slate-600">
                <span>
                  ממוצע חודשים קודמים: ₪
                  {analytics.trailingAverageSpendIls.toLocaleString('he-IL')}
                </span>
                {analytics.deltaVsTrailingAveragePercent !== null ? (
                  <span
                    className={`mr-2 inline-flex rounded-full px-2 py-0.5 font-semibold ${
                      analytics.deltaVsTrailingAverageIls > 0
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {analytics.deltaVsTrailingAverageIls > 0 ? '+' : ''}₪
                    {analytics.deltaVsTrailingAverageIls.toLocaleString(
                      'he-IL',
                    )}{' '}
                    ({analytics.deltaVsTrailingAveragePercent > 0 ? '+' : ''}
                    {analytics.deltaVsTrailingAveragePercent}%)
                  </span>
                ) : null}
              </div>
            </div>

            {/* KPI 2: Spending Nature Breakdown (Clickable) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <p className="mb-2.5 text-xs font-semibold text-slate-500">
                התפלגות לפי אופי הוצאה (לחץ לסינון)
              </p>
              <div className="space-y-2">
                {analytics.spendingNatureBreakdown.map((item) => {
                  const isSelected =
                    selectedSpendingNature === item.spendingNature;
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
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 font-semibold text-indigo-900 ring-1 ring-indigo-500'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>{SPENDING_NATURE_LABELS[item.spendingNature]}</span>
                      <span className="font-semibold text-slate-900">
                        ₪{item.totalIls.toLocaleString('he-IL')} (
                        {item.sharePercent}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KPI 3: Cardholder Split (Clickable) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <p className="mb-2.5 text-xs font-semibold text-slate-500">
                חלוקה לפי מחזיק כרטיס (לחץ לסינון)
              </p>
              <div className="space-y-2">
                {analytics.cardholderBreakdown.map((holder) => {
                  const isSelected =
                    selectedCardholderId === holder.cardholderId;
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
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 font-semibold text-indigo-900 ring-1 ring-indigo-500'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>
                        {holder.cardholderName} ({holder.transactionCount}{' '}
                        עסקאות)
                      </span>
                      <span className="font-semibold text-slate-900">
                        ₪{holder.totalIls.toLocaleString('he-IL')} (
                        {holder.sharePercent}%)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Category Breakdown Visualization (Horizontal Bar & Donut Views + Budget Target Progress) */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  פילוח לפי קטגוריה ויעדי תקציב (Category Breakdown & Budget
                  Targets)
                </h3>
                <p className="text-xs text-slate-500">
                  לחץ על כל קטגוריה לסינון טבלת העסקאות למטה
                </p>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setChartViewMode('bar')}
                  className={`rounded-md px-3 py-1 font-medium ${
                    chartViewMode === 'bar'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  תרשים עמודות (Bar)
                </button>
                <button
                  type="button"
                  onClick={() => setChartViewMode('donut')}
                  className={`rounded-md px-3 py-1 font-medium ${
                    chartViewMode === 'donut'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  תרשים עוגה (Donut)
                </button>
              </div>
            </div>

            {chartViewMode === 'donut' ? (
              <div
                data-testid="category-donut-view"
                className="flex flex-wrap items-center justify-center gap-8 rounded-lg bg-slate-50/70 p-4"
              >
                <svg
                  viewBox="0 0 42 42"
                  className="h-40 w-40"
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

                <div className="flex flex-wrap gap-2">
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
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs shadow-2xs hover:bg-slate-50"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-medium text-slate-800">
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
                    className={`cursor-pointer rounded-lg border p-3.5 transition-colors ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="font-bold text-slate-900">
                          {cat.categoryName}
                        </span>
                        <span className="text-slate-500">
                          ({cat.transactionCount} עסקאות • {cat.sharePercent}%
                          מהחודש)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-slate-500">
                          ממוצע היסטורי: ₪
                          {cat.historicalAverageIls.toLocaleString('he-IL')}
                        </span>
                        <span className="text-slate-500">
                          חודש קודם: ₪
                          {cat.previousMonthIls.toLocaleString('he-IL')} (
                          {cat.deltaVsPreviousMonthIls > 0 ? '+' : ''}₪
                          {cat.deltaVsPreviousMonthIls.toLocaleString('he-IL')})
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          ₪{cat.totalIls.toLocaleString('he-IL')}
                        </span>
                      </div>
                    </div>

                    {/* Share Horizontal Bar */}
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${barWidthPercent}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>

                    {/* Budget Target Utilization Bar */}
                    {cat.budgetTargetIls !== null ? (
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">
                            יעד תקציב חודשי: ₪
                            {cat.budgetTargetIls.toLocaleString('he-IL')} (
                            {cat.budgetUtilizationPercent ?? 0}%)
                          </span>
                          {cat.isOverBudget ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                              חריגה מהיעד
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                              במסגרת היעד
                            </span>
                          )}
                        </div>
                        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${
                              cat.isOverBudget
                                ? 'bg-rose-600'
                                : 'bg-emerald-600'
                            }`}
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
        </>
      ) : null}

      {/* Interactive Drill-Down Transactions Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            פירוט עסקאות לחודש החיוב ({transactions.length})
          </h3>

          <input
            type="search"
            placeholder="חיפוש חופשי לפי בית עסק או הערה..."
            aria-label="חיפוש חופשי בעסקאות"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
          />
        </div>

        <div
          data-testid="dashboard-drilldown-table"
          className="overflow-x-auto rounded-lg border border-slate-200"
        >
          <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  תאריך עסקה
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  בית עסק
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  כרטיס ומחזיק
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  קטגוריה, הערות והחרגה
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  סכום חיוב בש&quot;ח
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className={tx.isExcluded ? 'bg-slate-50/70 opacity-60' : ''}
                >
                  <td className="px-4 py-2.5 text-slate-600">
                    {tx.purchaseDate}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <div>{tx.merchantName}</div>
                    {tx.rawMerchantName !== tx.merchantName ? (
                      <div className="text-[11px] text-slate-500">
                        {tx.rawMerchantName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {tx.cardNickname} ({tx.cardLastFourDigits}) •{' '}
                    {tx.cardholderName}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
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
                  <td
                    className={`px-4 py-2.5 font-semibold ${
                      tx.billedAmountIls < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    ₪{tx.billedAmountIls.toLocaleString('he-IL')}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-xs text-slate-500"
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
