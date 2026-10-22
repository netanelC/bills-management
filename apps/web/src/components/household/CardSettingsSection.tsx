import React, { useState } from 'react';
import type {
  CardDto,
  CardholderDto,
  CardProvider,
  CreateCardInput,
  UpdateCardInput,
} from '@bills/shared';
import { type CardFormState, INITIAL_CARD_FORM } from './types.js';

const PROVIDER_LABELS: Record<CardProvider, string> = {
  ISRACARD: 'ישראכרט',
  AMEX: 'אמריקן אקספרס',
  OTHER: 'אחר',
};

export interface CardSettingsSectionProps {
  cards: CardDto[];
  cardholders: CardholderDto[];
  onCreateCard: (input: CreateCardInput) => Promise<void>;
  onUpdateCard: (id: string, input: UpdateCardInput) => Promise<void>;
  onDeleteCard: (id: string) => Promise<void>;
}

export function CardSettingsSection({
  cards,
  cardholders,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
}: CardSettingsSectionProps): React.ReactElement {
  const [newCardForm, setNewCardForm] = useState<CardFormState>(() => ({
    ...INITIAL_CARD_FORM,
    cardholderId: cardholders[0]?.id ?? '',
  }));
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardForm, setEditCardForm] =
    useState<CardFormState>(INITIAL_CARD_FORM);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    await onCreateCard({
      nickname: newCardForm.nickname.trim(),
      lastFourDigits: newCardForm.lastFourDigits.trim(),
      provider: newCardForm.provider,
      cardholderId: newCardForm.cardholderId || (cardholders[0]?.id ?? ''),
    });
    setNewCardForm({
      ...INITIAL_CARD_FORM,
      cardholderId: cardholders[0]?.id ?? '',
    });
  }

  function startEdit(card: CardDto): void {
    setEditingCardId(card.id);
    setEditCardForm({
      nickname: card.nickname,
      lastFourDigits: card.lastFourDigits,
      provider: card.provider,
      cardholderId: card.cardholderId,
    });
  }

  async function handleSaveEdit(id: string): Promise<void> {
    await onUpdateCard(id, {
      nickname: editCardForm.nickname.trim(),
      lastFourDigits: editCardForm.lastFourDigits.trim(),
      provider: editCardForm.provider,
      cardholderId: editCardForm.cardholderId,
    });
    setEditingCardId(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
      <h3 className="text-base font-semibold text-slate-900">
        כרטיסי אשראי רשומים (Cards)
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        כרטיסי ישראכרט ואמריקן אקספרס של משק הבית המזוהים לפי 4 ספרות אחרונות.
      </p>

      <form
        onSubmit={(e) => void handleCreate(e)}
        className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
      >
        <input
          type="text"
          placeholder="כינוי כרטיס (למשל אמקס שלי)"
          aria-label="כינוי כרטיס חדש"
          value={newCardForm.nickname}
          onChange={(e) =>
            setNewCardForm((prev) => ({
              ...prev,
              nickname: e.target.value,
            }))
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
          {Object.entries(PROVIDER_LABELS).map(([provider, label]) => (
            <option key={provider} value={provider}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="מחזיק כרטיס לכרטיס חדש"
          value={newCardForm.cardholderId || (cardholders[0]?.id ?? '')}
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
            טרם נרשמו כרטיסי אשראי. ניתן להוסיף כאן או לשייך אוטומטית בעת העלאת
            דף פירוט.
          </p>
        ) : (
          cards.map((card) => {
            const cardholder = cardholders.find(
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
                      {Object.entries(PROVIDER_LABELS).map(([provider, label]) => (
                        <option key={provider} value={provider}>
                          {label}
                        </option>
                      ))}
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
                      onClick={() => void handleSaveEdit(card.id)}
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
                        מחזיק כרטיס: {cardholder?.name ?? 'לא ידוע'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(card)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        ערוך כרטיס
                      </button>
                      <button
                        type="button"
                        aria-label={`מחק כרטיס ${card.nickname}`}
                        onClick={() => void onDeleteCard(card.id)}
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
  );
}
