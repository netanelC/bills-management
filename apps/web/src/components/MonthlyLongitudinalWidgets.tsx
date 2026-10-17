import React, { useState } from 'react';
import type {
  FutureInstallmentsForecastDto,
  MultiMonthTrendPointDto,
  SpendingNature,
  TopMerchantItemDto,
} from '@bills/shared';

export const SPENDING_NATURE_LABELS: Record<SpendingNature, string> = {
  FIXED: 'הוצאות קבועות (FIXED)',
  VARIABLE: 'הוצאות משתנות (VARIABLE)',
  DISCRETIONARY: 'פינוקים ופנאי (DISCRETIONARY)',
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
            מגמות רב-חודשיות לפי חודש חיוב (Multi-Month Trends)
          </h3>
          <p className="text-xs text-slate-500">
            השוואת סך הוצאה נטו בין חודשי חיוב בחלוקה לפי אופי הוצאה או קטגוריה
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTrendSegmentBy('nature')}
            className={`rounded-md px-3 py-1 font-medium ${
              trendSegmentBy === 'nature'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            לפי אופי הוצאה (Spending Nature)
          </button>
          <button
            type="button"
            onClick={() => setTrendSegmentBy('category')}
            className={`rounded-md px-3 py-1 font-medium ${
              trendSegmentBy === 'category'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            לפי קטגוריה (Category)
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
                  ? 'border-indigo-300 bg-indigo-50/30'
                  : 'border-slate-200 hover:bg-slate-50/70'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  {point.billingMonth}
                  {isCurrentMonth ? ' (חודש נבחר)' : ''}
                </span>
                <span className="font-bold text-slate-900">
                  ₪{point.totalNetSpendIls.toLocaleString('he-IL')}
                </span>
              </div>

              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="flex h-full overflow-hidden rounded-full"
                  style={{ width: `${monthWidthPercent}%` }}
                >
                  {segments.map((seg) => (
                    <div
                      key={seg.key}
                      data-testid={`trend-segment-${point.billingMonth}-${seg.key}`}
                      title={`${seg.label}: ₪${seg.totalIls.toLocaleString('he-IL')}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        seg.onClick();
                      }}
                      style={{
                        width: `${(seg.totalIls / positiveSum) * 100}%`,
                        backgroundColor: seg.color,
                      }}
                      className="h-full cursor-pointer transition-opacity hover:opacity-80"
                    />
                  ))}
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
    <section
      data-testid="top-merchants-section"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            בתי עסק מובילים (Top Merchants)
          </h3>
          <p className="text-xs text-slate-500">
            לחץ על בית עסק לסינון טבלת העסקאות למטה
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChangeScope('selected-month')}
            className={`rounded-md px-2.5 py-1 font-medium ${
              topMerchantsScope === 'selected-month'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600'
            }`}
          >
            חודש החיוב הנבחר
          </button>
          <button
            type="button"
            onClick={() => onChangeScope('multi-month')}
            className={`rounded-md px-2.5 py-1 font-medium ${
              topMerchantsScope === 'multi-month'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600'
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
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {merchant.transactionCount} עסקאות • ממוצע לעסקה: ₪
                  {merchant.averageTransactionIls.toLocaleString('he-IL')}
                </div>
              </div>
              <span className="text-sm font-bold text-slate-900">
                ₪{merchant.totalIls.toLocaleString('he-IL')}
              </span>
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
  return (
    <section
      data-testid="future-installments-section"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          תחזית התחייבויות תשלומים עתידיים (Future Installments Forecast)
        </h3>
        <p className="text-xs text-slate-500">
          התחייבויות פתוחות מתוך דוח החיוב האחרון של כל כרטיס (X &lt; Y)
        </p>
      </div>

      {forecast.upcomingMonths.length === 0 ? (
        <p className="text-xs text-slate-500">
          אין עסקאות תשלומים פעילות עם יתרת תשלומים עתידית.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {forecast.upcomingMonths.map((m) => (
              <div
                key={m.billingMonth}
                data-testid={`forecast-month-${m.billingMonth}`}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs"
              >
                <div className="font-semibold text-slate-700">
                  {m.billingMonth}
                </div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  ₪{m.totalProjectedIls.toLocaleString('he-IL')}
                </div>
                <div className="text-[11px] text-slate-500">
                  {m.dealsCount} עסקאות תשלומים
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold text-slate-700">
              עסקאות תשלומים פעילות תורמות (
              {forecast.activeInstallmentDeals.length})
            </h4>
            {forecast.activeInstallmentDeals.map((deal) => (
              <div
                key={deal.transactionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
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
                    ₪{deal.monthlyAmountIls.toLocaleString('he-IL')} / חודש
                  </div>
                  <div className="text-[11px] text-slate-500">
                    יתרה כוללת: ₪
                    {deal.remainingTotalAmountIls.toLocaleString('he-IL')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
