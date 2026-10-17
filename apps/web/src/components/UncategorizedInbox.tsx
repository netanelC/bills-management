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
  const [targetMerchantId, setTargetMerchantId] = useState<string>('');
  const [sourceMerchantIds, setSourceMerchantIds] = useState<string[]>([]);

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

  async function handleToggleAmbiguous(
    merchantId: string,
    isAmbiguous: boolean,
  ): Promise<void> {
    try {
      setErrorMessage(null);
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAmbiguous }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatusMessage(
        isAmbiguous
          ? 'בית העסק סומן כדו-משמעי (Ambiguous Merchant)'
          : 'סימון דו-משמעי הוסר מבית העסק',
      );
      await loadInboxData();
    } catch {
      setErrorMessage('שגיאה בעדכון הגדרת בית עסק דו-משמעי');
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
      setStatusMessage('כלל הזיהוי (Merchant Alias) נוסף בהצלחה');
      await loadInboxData();
    } catch {
      setErrorMessage('שגיאה בהוספת כלל זיהוי לבית העסק');
    }
  }

  function toggleSourceMerchantSelection(merchantId: string): void {
    setSourceMerchantIds((prev) =>
      prev.includes(merchantId)
        ? prev.filter((id) => id !== merchantId)
        : [...prev, merchantId],
    );
  }

  async function handleMergeMerchants(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const validSourceIds = sourceMerchantIds.filter(
      (id) => id !== targetMerchantId,
    );
    if (!targetMerchantId || validSourceIds.length === 0) {
      return;
    }

    try {
      setErrorMessage(null);
      const res = await fetch('/api/merchants/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMerchantId,
          sourceMerchantIds: validSourceIds,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setStatusMessage('בתי העסק מוזגו בהצלחה וכל העסקאות הועברו ליעד');
      setSourceMerchantIds([]);
      await loadInboxData();
    } catch {
      setErrorMessage('שגיאה במיזוג בתי העסק');
    }
  }

  const uncategorizedList = inbox?.uncategorizedMerchants ?? [];
  const ambiguousTransactions = inbox?.ambiguousTransactions ?? [];
  const categorizedOrAmbiguousMerchants = merchants.filter(
    (m) => m.defaultCategoryId !== null || m.isAmbiguous,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            תיבת סיווג מהיר וניהול בתי עסק (Uncategorized Inbox)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            סיווג חד-פעמי של בתי עסק חדשים מחיל את הקטגוריה רטרואקטיבית ועתידית
            על כל העסקאות שלהם
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-600/20">
          <span>פריטים הממתינים לסיווג:</span>
          <span
            data-testid="inbox-badge-count"
            className="rounded-full bg-indigo-600 px-2 py-0.5 text-white"
          >
            {inbox?.totalInboxCount ?? 0}
          </span>
        </div>
      </div>

      {loading && !inbox ? (
        <div className="py-4 text-sm text-slate-500">
          טוען תיבת סיווג ובתי עסק...
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

      {/* Uncategorized Merchants Section */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900">
          בתי עסק ללא קטגוריית ברירת מחדל ({uncategorizedList.length})
        </h3>

        {uncategorizedList.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center text-sm text-emerald-800">
            כל בתי העסק מסווגים! אין בתי עסק הממתינים לשיוך קטגוריה.
          </div>
        ) : (
          <div className="space-y-4">
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
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        {merchant.canonicalName}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {item.transactionCount} עסקאות • סה&quot;כ חיוב: ₪
                        {item.totalBilledIls.toLocaleString('he-IL')}
                      </p>

                      {merchant.aliases.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {merchant.aliases.map((alias) => (
                            <span
                              key={alias.id}
                              className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"
                            >
                              {alias.matchType === 'CONTAINS' ? 'מכיל' : 'מדויק'}
                              : {alias.pattern}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-xs font-medium text-slate-700">
                        <span className="sr-only">
                          בחר קטגוריה עבור {merchant.canonicalName}
                        </span>
                        <select
                          aria-label={`בחר קטגוריה עבור ${merchant.canonicalName}`}
                          value={merchant.defaultCategoryId ?? ''}
                          onChange={(e) =>
                            void handleAssignCategory(
                              merchant.id,
                              e.target.value,
                            )
                          }
                          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-2xs focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">בחר קטגוריה לשיוך...</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          void handleToggleAmbiguous(
                            merchant.id,
                            !merchant.isAmbiguous,
                          )
                        }
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      >
                        סמן כדו-משמעי (Bit / PayBox)
                      </button>
                    </div>
                  </div>

                  {/* Sample Transactions for Context */}
                  {sampleTransactions.length > 0 ? (
                    <div className="mt-3 rounded-md border border-slate-200/80 bg-white p-2.5">
                      <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                        עסקאות לדוגמה מתוך הדוחות:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {sampleTransactions.map((tx) => (
                          <span
                            key={tx.id}
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                          >
                            <span>{tx.purchaseDate}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-900">
                              ₪{tx.billedAmountIls.toLocaleString('he-IL')}
                            </span>
                            {tx.cardNickname ? (
                              <span className="text-[11px] text-slate-500">
                                ({tx.cardNickname})
                              </span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Add Alias Rule Inline */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
                    <input
                      type="text"
                      placeholder="הוסף תבנית זיהוי (למשל: שופרסל)"
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
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
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
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      <option value="CONTAINS">מכיל מחרוזת (CONTAINS)</option>
                      <option value="EXACT">התאמה מדויקת (EXACT)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleAddAlias(merchant.id)}
                      className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900"
                    >
                      הוסף כלל זיהוי
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ambiguous Transactions Section */}
      {ambiguousTransactions.length > 0 ? (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="text-base font-semibold text-amber-950">
            עסקאות בבתי עסק דו-משמעיים הממתינות לסיווג פרטני (
            {ambiguousTransactions.length})
          </h3>
          <div className="space-y-2">
            {ambiguousTransactions.map((tx) => (
              <div
                key={tx.id}
                data-testid={`inbox-ambiguous-tx-${tx.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-white px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {tx.rawMerchantName}
                  </span>
                  <span className="text-slate-500">({tx.purchaseDate})</span>
                  {tx.cardNickname ? (
                    <span className="text-slate-500">• {tx.cardNickname}</span>
                  ) : null}
                </div>
                <span className="font-bold text-slate-900">
                  ₪{tx.billedAmountIls.toLocaleString('he-IL')}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Merge Merchants Section */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-5">
        <h3 className="text-base font-semibold text-slate-900">
          מיזוג בתי עסק כפולים (Merchant Merge)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          מזג וריאציות שונות של אותו בית עסק לבית עסק קנוני אחד — כל העסקאות
          וכללי הזיהוי יועברו אוטומטית.
        </p>

        <form
          onSubmit={(e) => void handleMergeMerchants(e)}
          className="mt-4 grid gap-4 sm:grid-cols-3"
        >
          <label className="block text-xs font-medium text-slate-700">
            בית עסק יעד למיזוג
            <select
              aria-label="בית עסק יעד למיזוג"
              value={targetMerchantId}
              onChange={(e) => {
                const nextTarget = e.target.value;
                setTargetMerchantId(nextTarget);
                setSourceMerchantIds((prev) =>
                  prev.filter((id) => id !== nextTarget),
                );
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">בחר בית עסק יעד...</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.canonicalName} ({m.transactionCount} עסקאות)
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-xs font-medium text-slate-700">
            <legend className="mb-1">בתי עסק מקור למיזוג (ניתן לבחור מספר וריאציות)</legend>
            <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-md border border-slate-300 bg-white p-2">
              {merchants
                .filter((m) => m.id !== targetMerchantId)
                .map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-800"
                  >
                    <input
                      type="checkbox"
                      aria-label={`מזג את ${m.canonicalName}`}
                      checked={sourceMerchantIds.includes(m.id)}
                      onChange={() => toggleSourceMerchantSelection(m.id)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>
                      {m.canonicalName} ({m.transactionCount} עסקאות)
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              מזג בתי עסק
            </button>
          </div>
        </form>
      </section>

      {/* Categorized & Ambiguous Merchants Directory */}
      {categorizedOrAmbiguousMerchants.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">
            ספריית בתי עסק מסווגים ודו-משמעיים (
            {categorizedOrAmbiguousMerchants.length})
          </h3>
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {categorizedOrAmbiguousMerchants.map((merchant) => {
              const draft = aliasDraftByMerchant[merchant.id] ?? {
                pattern: '',
                matchType: 'CONTAINS',
              };
              return (
                <div
                  key={merchant.id}
                  data-testid={`directory-merchant-${merchant.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {merchant.canonicalName}
                      </span>
                      {merchant.isAmbiguous ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          דו-משמעי
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-slate-500">
                      {merchant.transactionCount} עסקאות • ₪
                      {merchant.totalBilledIls.toLocaleString('he-IL')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`בחר קטגוריה עבור ${merchant.canonicalName}`}
                      value={merchant.defaultCategoryId ?? ''}
                      onChange={(e) =>
                        void handleAssignCategory(merchant.id, e.target.value)
                      }
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                    >
                      <option value="">ללא קטגוריית ברירת מחדל</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        void handleToggleAmbiguous(
                          merchant.id,
                          !merchant.isAmbiguous,
                        )
                      }
                      className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      {merchant.isAmbiguous
                        ? 'בטל סימון דו-משמעי'
                        : 'סמן כדו-משמעי'}
                    </button>

                    <input
                      type="text"
                      placeholder="הוסף תבנית זיהוי..."
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
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddAlias(merchant.id)}
                      className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900"
                    >
                      הוסף כלל
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
