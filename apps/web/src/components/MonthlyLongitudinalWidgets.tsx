import React, { useState } from 'react';
import type {
  FutureInstallmentsForecastDto,
  MultiMonthTrendPointDto,
  SpendingNature,
  TopMerchantItemDto,
} from '@bills/shared';
import { Money } from '../utils/format.js';

export const SPENDING_NATURE_LABELS: Record<SpendingNature, string> = {
  FIXED: 'הוצאות קבועות',
  VARIABLE: 'הוצאות משתנות',
  DISCRETIONARY: 'פינוקים ופנאי',
};

const SPENDING_NATURE_COLORS: Record<SpendingNature, string> = {
  FIXED: '#3b82f6',
  VARIABLE: '#10b981',
  DISCRETIONARY: '#f43f5e',
};

interface MultiMonthTrendsSectionProps {
  multiMonthTrends: readonly MultiMonthTrendPointDto[];
  selectedBillingMonth: string | null;
  onSelectBillingMonth: (month: string) => void;
  onSelectSpendingNature: (nature: SpendingNature) => void;
  onSelectCategoryId: (categoryId: string) => void;
}

export function MultiMonthTrendsSection({
  multiMonthTrends,
  selectedBillingMonth,
  onSelectBillingMonth,
  onSelectSpendingNature,
  onSelectCategoryId,
}: MultiMonthTrendsSectionProps): React.ReactElement {
  const [trendSegmentBy, setTrendSegmentBy] = useState<'nature' | 'category'>(
    'nature',
  );

  const maxMonthSpend = Math.max(
    1,
    ...multiMonthTrends.map((t) => Math.max(0, t.totalNetSpendIls)),
  );

  return (
    <section
      data-testid="multi-month-trends-section"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            מגמות רב-חודשיות לפי חודש חיוב
          </h3>
          <p className="text-xs text-slate-500">
            השוואת סך הוצאה נטו בין חודשי חיוב בחלוקה לפי אופי הוצאה או קטגוריה
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTrendSegmentBy('nature')}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              trendSegmentBy === 'nature'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            לפי אופי הוצאה
          </button>
          <button
            type="button"
            onClick={() => setTrendSegmentBy('category')}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              trendSegmentBy === 'category'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            לפי קטגוריה
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {multiMonthTrends.map((point) => {
          const isCurrentMonth = point.billingMonth === selectedBillingMonth;
          const monthWidthPercent = Math.min(
            100,
            Math.max(0, (point.totalNetSpendIls / maxMonthSpend) * 100),
          );

          const segments =
            trendSegmentBy === 'nature'
              ? point.bySpendingNature
                  .filter((s) => s.totalIls > 0)
                  .map((s) => ({
                    key: s.spendingNature,
                    label: SPENDING_NATURE_LABELS[s.spendingNature],
                    color: SPENDING_NATURE_COLORS[s.spendingNature],
                    totalIls: s.totalIls,
                    onClick: () => {
                      onSelectBillingMonth(point.billingMonth);
                      onSelectSpendingNature(s.spendingNature);
                    },
                  }))
              : point.byCategory
                  .filter((c) => c.totalIls > 0)
                  .map((c) => {
                    const filterKey = c.categoryId ?? 'UNCATEGORIZED';
                    return {
                      key: filterKey,
                      label: c.categoryName,
                      color: c.color,
                      totalIls: c.totalIls,
                      onClick: () => {
                        onSelectBillingMonth(point.billingMonth);
                        onSelectCategoryId(filterKey);
                      },
                    };
                  });

          const positiveSum = Math.max(
            1,
            segments.reduce((acc, s) => acc + s.totalIls, 0),
          );

          return (
            <div
              key={point.billingMonth}
              data-testid={`trend-month-row-${point.billingMonth}`}
              onClick={() => onSelectBillingMonth(point.billingMonth)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectBillingMonth(point.billingMonth);
                }
              }}
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                isCurrentMonth
                  ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-500'
                  : 'border-slate-200 hover:bg-slate-50/70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">
                    {point.billingMonth}
                  </span>
                  {isCurrentMonth ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
                      חודש נבחר
                    </span>
                  ) : null}
                </div>
                <Money
                  amount={point.totalNetSpendIls}
                  className="font-bold text-slate-900 text-sm"
                />
              </div>

              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="flex h-full rounded-full transition-all duration-300"
                  style={{ width: `${monthWidthPercent}%` }}
                >
                  {segments.map((seg) => {
                    const segWidth = (seg.totalIls / positiveSum) * 100;
                    return (
                      <div
                        key={seg.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          seg.onClick();
                        }}
                        style={{
                          width: `${segWidth}%`,
                          backgroundColor: seg.color,
                        }}
                        title={`${seg.label}: ${seg.totalIls.toLocaleString('he-IL')} ₪`}
                        className="h-full cursor-pointer transition-opacity hover:opacity-85"
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface TopMerchantsSectionProps {
  topMerchants: readonly TopMerchantItemDto[];
  topMerchantsMultiMonth: readonly TopMerchantItemDto[];
  topMerchantsScope: 'selected-month' | 'multi-month';
  selectedMerchantId: string;
  onChangeScope: (scope: 'selected-month' | 'multi-month') => void;
  onToggleMerchant: (merchantId: string) => void;
}

export function TopMerchantsSection({
  topMerchants,
  topMerchantsMultiMonth,
  topMerchantsScope,
  selectedMerchantId,
  onChangeScope,
  onToggleMerchant,
}: TopMerchantsSectionProps): React.ReactElement {
  const activeMerchants =
    topMerchantsScope === 'selected-month'
      ? topMerchants
      : topMerchantsMultiMonth;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            בתי עסק מובילים
          </h3>
          <p className="text-xs text-slate-500">
            בתי העסק עם נפח ההוצאה הגבוה ביותר (לחץ לסינון העסקאות)
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChangeScope('selected-month')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              topMerchantsScope === 'selected-month'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            חודש נבחר
          </button>
          <button
            type="button"
            onClick={() => onChangeScope('multi-month')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              topMerchantsScope === 'multi-month'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            כל החודשים
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {activeMerchants.slice(0, 10).map((merchant, idx) => {
          const isSelected = selectedMerchantId === merchant.merchantId;
          return (
            <button
              key={merchant.merchantId}
              type="button"
              data-testid={`top-merchant-row-${merchant.merchantId}`}
              onClick={() => onToggleMerchant(merchant.merchantId)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-xs transition-colors ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 font-semibold text-indigo-900 ring-1 ring-indigo-500'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <span className="font-bold text-slate-900">
                  {idx + 1}. {merchant.merchantName}
                </span>
                <div className="mt-0.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <span>{merchant.transactionCount} עסקאות</span>
                  <span>•</span>
                  <span>ממוצע לעסקה:</span>
                  <Money amount={merchant.averageTransactionIls} />
                </div>
              </div>
              <Money
                amount={merchant.totalIls}
                className="text-sm font-bold text-slate-900"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface FutureInstallmentsSectionProps {
  forecast: FutureInstallmentsForecastDto;
}

export function FutureInstallmentsSection({
  forecast,
}: FutureInstallmentsSectionProps): React.ReactElement {
  const maxProjected = Math.max(
    1,
    ...forecast.upcomingMonths.map((m) => m.totalProjectedIls),
  );

  return (
    <section
      data-testid="future-installments-section"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          תחזית התחייבויות תשלומים עתידיים
        </h3>
        <p className="text-xs text-slate-500">
          ציר זמן של התחייבויות תשלומים פתוחות מתוך דוחות החיוב האחרונים
        </p>
      </div>

      {forecast.upcomingMonths.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          אין עסקאות תשלומים פעילות עם יתרת תשלומים עתידית.
        </p>
      ) : (
        <>
          {/* Chronological Timeline Bar Chart */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="text-xs font-semibold text-slate-600 mb-3">
              פריסת תשלומים לפי חודש:
            </div>
            <div className="grid grid-flow-col auto-cols-fr gap-2 items-end min-h-[140px] pt-4 overflow-x-auto">
              {forecast.upcomingMonths.map((m) => {
                const heightPercent = Math.max(
                  15,
                  Math.round((m.totalProjectedIls / maxProjected) * 100),
                );
                return (
                  <div
                    key={m.billingMonth}
                    data-testid={`forecast-month-${m.billingMonth}`}
                    className="flex flex-col items-center gap-1.5 min-w-[70px]"
                  >
                    <div className="text-[11px] font-bold text-slate-800">
                      <Money amount={m.totalProjectedIls} />
                    </div>
                    <div className="w-full flex items-end justify-center h-20">
                      <div
                        className="w-8 rounded-t-lg bg-indigo-500/80 hover:bg-indigo-600 transition-all shadow-xs"
                        style={{ height: `${heightPercent}%` }}
                        title={`${m.billingMonth}: ${m.totalProjectedIls.toLocaleString('he-IL')} ₪ (${m.dealsCount} עסקאות)`}
                      />
                    </div>
                    <div className="border-t border-slate-200 w-full pt-1 text-center">
                      <div className="text-[11px] font-semibold text-slate-700">
                        {m.billingMonth}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {m.dealsCount} עסקאות
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Deals List */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold text-slate-700">
              עסקאות תשלומים פעילות תורמות ({forecast.activeInstallmentDeals.length})
            </h4>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {forecast.activeInstallmentDeals.map((deal) => (
                <div
                  key={deal.transactionId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {deal.merchantName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {deal.cardNickname} ({deal.cardholderName}) • תשלום{' '}
                      {deal.installmentCurrent} מתוך {deal.installmentTotal}{' '}
                      (נותרו {deal.remainingInstallmentsCount} תשלומים)
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-slate-900">
                      <Money amount={deal.monthlyAmountIls} /> / חודש
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1">
                      <span>יתרה כוללת:</span>
                      <Money amount={deal.remainingTotalAmountIls} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
