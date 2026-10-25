import React, { useCallback, useEffect, useState } from 'react';
import {
  CategorySchema,
  InboxResponseSchema,
  MerchantsListResponseSchema,
  type CategoryDto,
  type InboxResponseDto,
  type MerchantAliasMatchType,
  type MerchantDto,
} from '@bills/shared';
import { Money } from '../utils/format.js';

interface AliasDraft {
  pattern: string;
  matchType: MerchantAliasMatchType;
}

export function UncategorizedInbox(): React.ReactElement {
  const [inbox, setInbox] = useState<InboxResponseDto | null>(null);
  const [merchants, setMerchants] = useState<MerchantDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [aliasDraftByMerchant, setAliasDraftByMerchant] = useState<
    Record<string, AliasDraft>
  >({});

  const loadInboxData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const [catRes, inboxRes, merchantsRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/inbox'),
        fetch('/api/merchants'),
      ]);

      if (!catRes.ok || !inboxRes.ok || !merchantsRes.ok) {
        throw new Error('Failed to fetch inbox data');
      }

      const rawCats = (await catRes.json()) as { categories?: unknown };
      const parsedCats = CategorySchema.array().parse(rawCats.categories ?? []);
      const parsedInbox = InboxResponseSchema.parse(await inboxRes.json());
      const parsedMerchants = MerchantsListResponseSchema.parse(
        await merchantsRes.json(),
      );

      setCategories(parsedCats);
      setInbox(parsedInbox);
      setMerchants(parsedMerchants.merchants);
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בטעינת תיבת הסיווג ובתי העסק');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInboxData();
  }, [loadInboxData]);

  async function handleAssignCategory(
    merchantId: string,
    categoryId: string,
  ): Promise<void> {
    if (!categoryId) return;
    try {
      setErrorMessage(null);
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultCategoryId: categoryId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatusMessage('הקטגוריה שויכה בהצלחה לכל עסקאות בית העסק');
      await loadInboxData();
    } catch {
      setErrorMessage('שגיאה בעדכון קטגוריית ברירת המחדל לבית העסק');
    }
  }

  async function handleAddAlias(merchantId: string): Promise<void> {
    const draft = aliasDraftByMerchant[merchantId];
    if (!draft || !draft.pattern.trim()) {
      return;
    }

    try {
      setErrorMessage(null);
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addAlias: {
            pattern: draft.pattern.trim(),
            matchType: draft.matchType,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setAliasDraftByMerchant((prev) => ({
        ...prev,
        [merchantId]: { pattern: '', matchType: 'CONTAINS' },
      }));
      setStatusMessage('כלל הזיהוי נוסף בהצלחה');
      await loadInboxData();
    } catch {
      setErrorMessage('שגיאה בהוספת כלל זיהוי לבית העסק');
    }
  }

  const uncategorizedList = inbox?.uncategorizedMerchants ?? [];
  const categorizedMerchants = merchants.filter(
    (m) => m.defaultCategoryId !== null,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
            שלב 3
          </span>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            תיבת סיווג מהיר
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            בתי עסק ללא קטגוריה: <strong className="text-slate-900">{uncategorizedList.length}</strong>
          </span>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-600/20">
            <span>ממתינים לסיווג:</span>
            <span
              data-testid="inbox-badge-count"
              className="rounded-full bg-amber-600 px-2 py-0.5 text-white font-bold"
            >
              {uncategorizedList.length}
            </span>
          </div>
        </div>
      </div>

      {loading && !inbox ? (
        <div className="py-6 text-center text-sm text-slate-500">
          טוען תיבת סיווג ובתי עסק...
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

      {/* Uncategorized Merchants Section */}
      <section className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">
          בתי עסק הממתינים לשיוך קטגוריה ({uncategorizedList.length})
        </h3>

        {uncategorizedList.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center text-sm font-semibold text-emerald-800">
            ✨ כל בתי העסק מסווגים! אין בתי עסק הממתינים לשיוך קטגוריה.
          </div>
        ) : (
          <div className="grid gap-3">
            {uncategorizedList.map((item) => {
              const { merchant, sampleTransactions } = item;
              const draft = aliasDraftByMerchant[merchant.id] ?? {
                pattern: '',
                matchType: 'CONTAINS',
              };

              return (
                <div
                  key={merchant.id}
                  data-testid={`inbox-merchant-${merchant.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900 truncate">
                          {merchant.canonicalName}
                        </h4>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 font-medium">
                          {item.transactionCount} עסקאות
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-1.5">
                        <span>סך הוצאה:</span>
                        <Money amount={item.totalBilledIls} className="font-bold text-slate-800" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`בחר קטגוריה עבור ${merchant.canonicalName}`}
                        value={merchant.defaultCategoryId ?? ''}
                        onChange={(e) =>
                          void handleAssignCategory(
                            merchant.id,
                            e.target.value,
                          )
                        }
                        className="rounded-lg border border-indigo-300 bg-indigo-50/50 px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-2xs hover:bg-indigo-50 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">בחר קטגוריה לשיוך...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {merchant.aliases.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {merchant.aliases.map((alias) => (
                        <span
                          key={alias.id}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"
                        >
                          כלל: {alias.pattern}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Compact Sample Transactions */}
                  {sampleTransactions.length > 0 ? (
                    <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-400">
                          עסקאות לדוגמה:
                        </span>
                        {sampleTransactions.map((tx) => (
                          <span
                            key={tx.id}
                            className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-2xs ring-1 ring-slate-200"
                          >
                            <span>{tx.purchaseDate}</span>
                            <span>•</span>
                            <Money amount={tx.billedAmountIls} className="font-semibold text-slate-900" />
                            {tx.cardNickname ? (
                              <span className="text-slate-400">
                                ({tx.cardNickname})
                              </span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Human-Readable Rule Generator Template */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">
                      קטלג תמיד עסקאות המכילות:
                    </span>
                    <input
                      type="text"
                      placeholder={merchant.canonicalName}
                      aria-label={`תבנית זיהוי עבור ${merchant.canonicalName}`}
                      value={draft.pattern}
                      onChange={(e) =>
                        setAliasDraftByMerchant((prev) => ({
                          ...prev,
                          [merchant.id]: {
                            ...draft,
                            pattern: e.target.value,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none min-w-[140px]"
                    />
                    <select
                      aria-label={`סוג התאמה עבור ${merchant.canonicalName}`}
                      value={draft.matchType}
                      onChange={(e) =>
                        setAliasDraftByMerchant((prev) => ({
                          ...prev,
                          [merchant.id]: {
                            ...draft,
                            matchType: e.target.value as MerchantAliasMatchType,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      <option value="CONTAINS">מכיל</option>
                      <option value="EXACT">מדויק</option>
                    </select>
                    <button
                      type="button"
                      aria-label="הוסף כלל זיהוי"
                      onClick={() => void handleAddAlias(merchant.id)}
                      className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-900 shadow-2xs transition-colors"
                    >
                      שמור חוק
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Categorized Merchants Directory */}
      {categorizedMerchants.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            ספריית בתי עסק מסווגים ({categorizedMerchants.length})
          </h3>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-2xs">
            {categorizedMerchants.map((merchant) => (
              <div
                key={merchant.id}
                data-testid={`directory-merchant-${merchant.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs hover:bg-slate-50/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">
                      {merchant.canonicalName}
                    </span>
                    {merchant.defaultCategoryName ? (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                        {merchant.defaultCategoryName}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-slate-400 flex items-center gap-1.5">
                    <span>{merchant.transactionCount} עסקאות</span>
                    <span>•</span>
                    <Money amount={merchant.totalBilledIls} className="text-slate-700 font-medium" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`שנה קטגוריה עבור ${merchant.canonicalName}`}
                    value={merchant.defaultCategoryId ?? ''}
                    onChange={(e) =>
                      void handleAssignCategory(merchant.id, e.target.value)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">ללא קטגוריית ברירת מחדל</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
