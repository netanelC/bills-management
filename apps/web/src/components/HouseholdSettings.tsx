import React, { useEffect, useState } from 'react';
import type {
  CardDto,
  CardholderDto,
  CardProvider,
  CategoryDto,
  SpendingNature,
} from '@bills/shared';

const SPENDING_NATURE_META: Record<
  SpendingNature,
  { title: string; subtitle: string; badgeClass: string }
> = {
  FIXED: {
    title: 'הוצאות קבועות (Fixed)',
    subtitle: 'חשבונות, תקשורת, ביטוחים והתחייבויות קשיחות',
    badgeClass: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  },
  VARIABLE: {
    title: 'הוצאות מחיה משתנות (Variable)',
    subtitle: 'קניות לסופרמרקט, פארם, דלק ותחזוקה שוטפת',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  DISCRETIONARY: {
    title: 'פינוקים ופנאי (Discretionary)',
    subtitle: 'מסעדות, שופינג, בילויים, חופשות ומתנות',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
};

const PROVIDER_LABELS: Record<CardProvider, string> = {
  ISRACARD: 'ישראכרט',
  AMEX: 'אמריקן אקספרס',
  OTHER: 'אחר',
};

const SPENDING_NATURES: readonly SpendingNature[] = [
  'FIXED',
  'VARIABLE',
  'DISCRETIONARY',
];

interface CardFormState {
  nickname: string;
  lastFourDigits: string;
  provider: CardProvider;
  cardholderId: string;
}

interface CategoryFormState {
  name: string;
  spendingNature: SpendingNature;
  color: string;
  budgetTarget: string;
  sortOrder: string;
}

const INITIAL_CARD_FORM: CardFormState = {
  nickname: '',
  lastFourDigits: '',
  provider: 'ISRACARD',
  cardholderId: '',
};

const INITIAL_CATEGORY_FORM: CategoryFormState = {
  name: '',
  spendingNature: 'VARIABLE',
  color: '#10b981',
  budgetTarget: '',
  sortOrder: '1',
};

function parseBudgetInput(rawBudget: string): number | null {
  const trimmed = rawBudget.trim();
  if (trimmed === '') {
    return null;
  }
  const numericValue = Number(trimmed);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return null;
  }
  return numericValue;
}

function compareCategories(a: CategoryDto, b: CategoryDto): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function HouseholdSettings(): React.ReactElement {
  const [cardholders, setCardholders] = useState<CardholderDto[]>([]);
  const [cards, setCards] = useState<CardDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingCardholderNames, setEditingCardholderNames] = useState<
    Record<string, string>
  >({});

  const [newCardForm, setNewCardForm] =
    useState<CardFormState>(INITIAL_CARD_FORM);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardForm, setEditCardForm] =
    useState<CardFormState>(INITIAL_CARD_FORM);

  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>(
    INITIAL_CATEGORY_FORM,
  );
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState<CategoryFormState>(
    INITIAL_CATEGORY_FORM,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHouseholdData(): Promise<void> {
      try {
        const [chRes, cardsRes, catsRes] = await Promise.all([
          fetch('/api/cardholders'),
          fetch('/api/cards'),
          fetch('/api/categories'),
        ]);

        if (!chRes.ok || !cardsRes.ok || !catsRes.ok) {
          throw new Error('Failed to load household configuration');
        }

        const chData = (await chRes.json()) as { cardholders: CardholderDto[] };
        const cardsData = (await cardsRes.json()) as { cards: CardDto[] };
        const catsData = (await catsRes.json()) as {
          categories: CategoryDto[];
        };

        if (!cancelled) {
          setCardholders(chData.cardholders);
          setCards(cardsData.cards);
          setCategories(catsData.categories);

          const initialNames: Record<string, string> = {};
          for (const ch of chData.cardholders) {
            initialNames[ch.id] = ch.name;
          }
          setEditingCardholderNames(initialNames);
          const firstCardholder = chData.cardholders[0];
          if (firstCardholder) {
            setNewCardForm((prev) => ({
              ...prev,
              cardholderId: firstCardholder.id,
            }));
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage('שגיאה בטעינת הגדרות משק הבית');
          setLoading(false);
        }
      }
    }

    void loadHouseholdData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveCardholderName(id: string): Promise<void> {
    const newName = editingCardholderNames[id]?.trim();
    if (!newName) return;

    try {
      const res = await fetch(`/api/cardholders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = (await res.json()) as CardholderDto;
      setCardholders((prev) =>
        prev.map((ch) => (ch.id === id ? updated : ch)),
      );
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בעדכון שם מחזיק הכרטיס');
    }
  }

  async function handleCreateCard(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardholderId: newCardForm.cardholderId,
          lastFourDigits: newCardForm.lastFourDigits.trim(),
          provider: newCardForm.provider,
          nickname: newCardForm.nickname.trim(),
        }),
      });
      if (!res.ok) throw new Error('Create card failed');
      const created = (await res.json()) as CardDto;
      setCards((prev) => [...prev, created]);
      setNewCardForm((prev) => ({
        ...prev,
        nickname: '',
        lastFourDigits: '',
      }));
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בהוספת כרטיס אשראי (ודא 4 ספרות ושם כינוי)');
    }
  }

  function startEditCard(card: CardDto): void {
    setEditingCardId(card.id);
    setEditCardForm({
      nickname: card.nickname,
      lastFourDigits: card.lastFourDigits,
      provider: card.provider,
      cardholderId: card.cardholderId,
    });
  }

  async function handleSaveCardEdit(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: editCardForm.nickname.trim(),
          lastFourDigits: editCardForm.lastFourDigits.trim(),
          provider: editCardForm.provider,
          cardholderId: editCardForm.cardholderId,
        }),
      });
      if (!res.ok) throw new Error('Update card failed');
      const updated = (await res.json()) as CardDto;
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingCardId(null);
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בעדכון פרטי הכרטיס');
    }
  }

  async function handleDeleteCard(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete card failed');
      setCards((prev) => prev.filter((c) => c.id !== id));
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה במחיקת הכרטיס');
    }
  }

  async function handleCreateCategory(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const budgetTargetIls = parseBudgetInput(newCategoryForm.budgetTarget);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryForm.name.trim(),
          spendingNature: newCategoryForm.spendingNature,
          color: newCategoryForm.color,
          budgetTargetIls,
        }),
      });
      if (!res.ok) throw new Error('Create category failed');
      const created = (await res.json()) as CategoryDto;
      setCategories((prev) => [...prev, created].sort(compareCategories));
      setNewCategoryForm((prev) => ({
        ...prev,
        name: '',
        budgetTarget: '',
      }));
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה ביצירת קטגוריה חדשה');
    }
  }

  function startEditCategory(cat: CategoryDto): void {
    setEditingCatId(cat.id);
    setEditCategoryForm({
      name: cat.name,
      spendingNature: cat.spendingNature,
      color: cat.color,
      budgetTarget:
        cat.budgetTargetIls !== null ? String(cat.budgetTargetIls) : '',
      sortOrder: String(cat.sortOrder),
    });
  }

  async function handleSaveCategoryEdit(id: string): Promise<void> {
    const budgetTargetIls = parseBudgetInput(editCategoryForm.budgetTarget);
    const parsedOrder = Number(editCategoryForm.sortOrder);

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCategoryForm.name.trim(),
          spendingNature: editCategoryForm.spendingNature,
          color: editCategoryForm.color,
          budgetTargetIls,
          sortOrder: Number.isNaN(parsedOrder) ? undefined : parsedOrder,
        }),
      });
      if (!res.ok) throw new Error('Update category failed');
      const updated = (await res.json()) as CategoryDto;
      setCategories((prev) =>
        prev
          .map((cat) => (cat.id === id ? updated : cat))
          .sort(compareCategories),
      );
      setEditingCatId(null);
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בעדכון הקטגוריה');
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-slate-500">
        טוען הגדרות משק בית...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          הגדרות משק בית (Household Settings)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          ניהול מחזיקי כרטיס (`Cardholder`), מצבת כרטיסי אשראי (`Card`) וקטלוג
          הקטגוריות (`Category` & `Budget Target`).
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      {/* 1. Cardholders Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
        <h3 className="text-base font-semibold text-slate-900">
          מחזיקי כרטיס (Cardholders)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          שני פרופילי ברירת המחדל של משק הבית – ניתן לערוך את שמות התצוגה.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {cardholders.map((ch) => (
            <div
              key={ch.id}
              data-testid={`cardholder-row-${ch.id}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <input
                type="text"
                aria-label={`שם מחזיק כרטיס ${ch.name}`}
                value={editingCardholderNames[ch.id] ?? ch.name}
                onChange={(e) =>
                  setEditingCardholderNames((prev) => ({
                    ...prev,
                    [ch.id]: e.target.value,
                  }))
                }
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => void handleSaveCardholderName(ch.id)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                שמור שם
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Cards Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
        <h3 className="text-base font-semibold text-slate-900">
          כרטיסי אשראי רשומים (Cards)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          כרטיסי ישראכרט ואמריקן אקספרס של משק הבית המזוהים לפי 4 ספרות אחרונות.
        </p>

        <form
          onSubmit={(e) => void handleCreateCard(e)}
          className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
        >
          <input
            type="text"
            placeholder="כינוי כרטיס (למשל אמקס שלי)"
            aria-label="כינוי כרטיס חדש"
            value={newCardForm.nickname}
            onChange={(e) =>
              setNewCardForm((prev) => ({ ...prev, nickname: e.target.value }))
            }
            required
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <input
            type="text"
            placeholder="4 ספרות אחרונות"
            aria-label="4 ספרות אחרונות לכרטיס חדש"
            maxLength={4}
            value={newCardForm.lastFourDigits}
            onChange={(e) =>
              setNewCardForm((prev) => ({
                ...prev,
                lastFourDigits: e.target.value,
              }))
            }
            required
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            aria-label="חברת אשראי לכרטיס חדש"
            value={newCardForm.provider}
            onChange={(e) =>
              setNewCardForm((prev) => ({
                ...prev,
                provider: e.target.value as CardProvider,
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="ISRACARD">ישראכרט</option>
            <option value="AMEX">אמריקן אקספרס</option>
            <option value="OTHER">אחר</option>
          </select>
          <select
            aria-label="מחזיק כרטיס לכרטיס חדש"
            value={newCardForm.cardholderId}
            onChange={(e) =>
              setNewCardForm((prev) => ({
                ...prev,
                cardholderId: e.target.value,
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {cardholders.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            הוסף כרטיס
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {cards.length === 0 ? (
            <p className="text-xs text-slate-500">
              טרם נרשמו כרטיסי אשראי. ניתן להוסיף כאן או לשייך אוטומטית בעת
              העלאת דוח.
            </p>
          ) : (
            cards.map((card) => {
              const owner = cardholders.find(
                (ch) => ch.id === card.cardholderId,
              );
              const isEditing = editingCardId === card.id;

              return (
                <div
                  key={card.id}
                  data-testid={`card-row-${card.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  {isEditing ? (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label="ערוך כינוי כרטיס"
                        value={editCardForm.nickname}
                        onChange={(e) =>
                          setEditCardForm((prev) => ({
                            ...prev,
                            nickname: e.target.value,
                          }))
                        }
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="text"
                        aria-label="ערוך 4 ספרות"
                        maxLength={4}
                        value={editCardForm.lastFourDigits}
                        onChange={(e) =>
                          setEditCardForm((prev) => ({
                            ...prev,
                            lastFourDigits: e.target.value,
                          }))
                        }
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <select
                        aria-label="ערוך חברת אשראי"
                        value={editCardForm.provider}
                        onChange={(e) =>
                          setEditCardForm((prev) => ({
                            ...prev,
                            provider: e.target.value as CardProvider,
                          }))
                        }
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        <option value="ISRACARD">ישראכרט</option>
                        <option value="AMEX">אמריקן אקספרס</option>
                        <option value="OTHER">אחר</option>
                      </select>
                      <select
                        aria-label="ערוך מחזיק כרטיס"
                        value={editCardForm.cardholderId}
                        onChange={(e) =>
                          setEditCardForm((prev) => ({
                            ...prev,
                            cardholderId: e.target.value,
                          }))
                        }
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      >
                        {cardholders.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleSaveCardEdit(card.id)}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                      >
                        שמור כרטיס
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCardId(null)}
                        className="rounded-md bg-slate-200 px-3 py-1 text-xs text-slate-700"
                      >
                        ביטול
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">
                          {card.nickname}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                          •••• {card.lastFourDigits}
                        </span>
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {PROVIDER_LABELS[card.provider]}
                        </span>
                        <span className="text-xs text-slate-500">
                          מחזיק: {owner?.name ?? 'לא ידוע'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditCard(card)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          ערוך כרטיס
                        </button>
                        <button
                          type="button"
                          aria-label={`מחק כרטיס ${card.nickname}`}
                          onClick={() => void handleDeleteCard(card.id)}
                          className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          מחק
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Categories Taxonomy Section */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
        <h3 className="text-base font-semibold text-slate-900">
          קטלוג קטגוריות ויעדי תקציב (Categories & Budget Targets)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          הקטגוריות מחולקות ל-3 קבוצות-על (`Spending Nature`). ניתן להוסיף,
          לערוך ולהגדיר יעד תקציב חודשי בש"ח (`Budget Target`).
        </p>

        <form
          onSubmit={(e) => void handleCreateCategory(e)}
          className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
        >
          <input
            type="text"
            placeholder="שם קטגוריה חדשה"
            aria-label="שם קטגוריה חדשה"
            value={newCategoryForm.name}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, name: e.target.value }))
            }
            required
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            aria-label="קבוצת הוצאה לקטגוריה חדשה"
            value={newCategoryForm.spendingNature}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({
                ...prev,
                spendingNature: e.target.value as SpendingNature,
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="FIXED">הוצאות קבועות (Fixed)</option>
            <option value="VARIABLE">הוצאות מחיה משתנות (Variable)</option>
            <option value="DISCRETIONARY">פינוקים ופנאי (Discretionary)</option>
          </select>
          <input
            type="color"
            aria-label="צבע קטגוריה חדשה"
            value={newCategoryForm.color}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({ ...prev, color: e.target.value }))
            }
            className="h-9 w-full cursor-pointer rounded-md border border-slate-300 p-1"
          />
          <input
            type="number"
            min="1"
            step="any"
            placeholder="יעד תקציב חודשי (₪ - אופציונלי)"
            aria-label="יעד תקציב חודשי לקטגוריה חדשה"
            value={newCategoryForm.budgetTarget}
            onChange={(e) =>
              setNewCategoryForm((prev) => ({
                ...prev,
                budgetTarget: e.target.value,
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            הוסף קטגוריה
          </button>
        </form>

        <div className="mt-6 space-y-6">
          {SPENDING_NATURES.map((nature) => {
            const meta = SPENDING_NATURE_META[nature];
            const groupCategories = categories.filter(
              (c) => c.spendingNature === nature,
            );

            return (
              <div
                key={nature}
                data-testid={`spending-nature-group-${nature}`}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {meta.title}
                    </h4>
                    <p className="text-xs text-slate-500">{meta.subtitle}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${meta.badgeClass}`}
                  >
                    {groupCategories.length} קטגוריות
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {groupCategories.map((cat) => {
                    const isEditing = editingCatId === cat.id;

                    return (
                      <div
                        key={cat.id}
                        data-testid={`category-row-${cat.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        {isEditing ? (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            <input
                              type="text"
                              aria-label="ערוך שם קטגוריה"
                              value={editCategoryForm.name}
                              onChange={(e) =>
                                setEditCategoryForm((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                            <select
                              aria-label="ערוך קבוצת הוצאה"
                              value={editCategoryForm.spendingNature}
                              onChange={(e) =>
                                setEditCategoryForm((prev) => ({
                                  ...prev,
                                  spendingNature: e.target
                                    .value as SpendingNature,
                                }))
                              }
                              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                            >
                              <option value="FIXED">הוצאות קבועות</option>
                              <option value="VARIABLE">הוצאות משתנות</option>
                              <option value="DISCRETIONARY">
                                פינוקים ופנאי
                              </option>
                            </select>
                            <input
                              type="color"
                              aria-label="ערוך צבע קטגוריה"
                              value={editCategoryForm.color}
                              onChange={(e) =>
                                setEditCategoryForm((prev) => ({
                                  ...prev,
                                  color: e.target.value,
                                }))
                              }
                              className="h-8 w-12 cursor-pointer rounded-md border border-slate-300 p-0.5"
                            />
                            <input
                              type="number"
                              min="1"
                              step="any"
                              placeholder="יעד תקציב (₪)"
                              aria-label="ערוך יעד תקציב"
                              value={editCategoryForm.budgetTarget}
                              onChange={(e) =>
                                setEditCategoryForm((prev) => ({
                                  ...prev,
                                  budgetTarget: e.target.value,
                                }))
                              }
                              className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                            <input
                              type="number"
                              aria-label="ערוך סדר תצוגה"
                              value={editCategoryForm.sortOrder}
                              onChange={(e) =>
                                setEditCategoryForm((prev) => ({
                                  ...prev,
                                  sortOrder: e.target.value,
                                }))
                              }
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void handleSaveCategoryEdit(cat.id)
                              }
                              className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                            >
                              שמור קטגוריה
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCatId(null)}
                              className="rounded-md bg-slate-200 px-3 py-1 text-xs text-slate-700"
                            >
                              ביטול
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <span
                                className="h-3.5 w-3.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="font-medium text-slate-900">
                                {cat.name}
                              </span>
                              <span className="text-xs text-slate-500">
                                {cat.budgetTargetIls !== null
                                  ? `יעד חודשי: ₪${cat.budgetTargetIls.toLocaleString('he-IL')}`
                                  : 'ללא יעד תקציב'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={`ערוך קטגוריה ${cat.name}`}
                                onClick={() => startEditCategory(cat)}
                                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                ערוך
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
