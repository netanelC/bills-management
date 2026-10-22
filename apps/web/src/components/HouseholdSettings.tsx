import React, { useEffect, useState } from 'react';
import type {
  CardDto,
  CardholderDto,
  CardProvider,
  CategoryDto,
  SpendingNature,
} from '@bills/shared';
import { CardholderSettingsSection } from './household/CardholderSettingsSection.js';
import { CardSettingsSection } from './household/CardSettingsSection.js';
import { CategorySettingsSection } from './household/CategorySettingsSection.js';

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

  async function handleCreateCard(input: {
    nickname: string;
    lastFourDigits: string;
    provider: CardProvider;
    cardholderId: string;
  }): Promise<void> {
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Create card failed');
      const created = (await res.json()) as CardDto;
      setCards((prev) => [...prev, created]);
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה בהוספת כרטיס אשראי (ודא 4 ספרות ושם כינוי)');
    }
  }

  async function handleUpdateCard(
    id: string,
    input: {
      nickname: string;
      lastFourDigits: string;
      provider: CardProvider;
      cardholderId: string;
    },
  ): Promise<void> {
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Update card failed');
      const updated = (await res.json()) as CardDto;
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
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

  async function handleCreateCategory(input: {
    name: string;
    spendingNature: SpendingNature;
    color: string;
    budgetTargetIls: number | null;
  }): Promise<void> {
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Create category failed');
      const created = (await res.json()) as CategoryDto;
      setCategories((prev) => [...prev, created].sort(compareCategories));
      setErrorMessage(null);
    } catch {
      setErrorMessage('שגיאה ביצירת קטגוריה חדשה');
    }
  }

  async function handleUpdateCategory(
    id: string,
    input: {
      name: string;
      spendingNature: SpendingNature;
      color: string;
      budgetTargetIls: number | null;
      sortOrder?: number;
    },
  ): Promise<void> {
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Update category failed');
      const updated = (await res.json()) as CategoryDto;
      setCategories((prev) =>
        prev
          .map((cat) => (cat.id === id ? updated : cat))
          .sort(compareCategories),
      );
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

      <CardholderSettingsSection
        cardholders={cardholders}
        editingCardholderNames={editingCardholderNames}
        onNameChange={(id, value) =>
          setEditingCardholderNames((prev) => ({ ...prev, [id]: value }))
        }
        onSaveName={handleSaveCardholderName}
      />

      <CardSettingsSection
        cards={cards}
        cardholders={cardholders}
        onCreateCard={handleCreateCard}
        onUpdateCard={handleUpdateCard}
        onDeleteCard={handleDeleteCard}
      />

      <CategorySettingsSection
        categories={categories}
        onCreateCategory={handleCreateCategory}
        onUpdateCategory={handleUpdateCategory}
      />
    </div>
  );
}
