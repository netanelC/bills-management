import React from 'react';
import type { CardholderDto } from '@bills/shared';

export interface CardholderSettingsSectionProps {
  cardholders: CardholderDto[];
  editingCardholderNames: Record<string, string>;
  onNameChange: (id: string, value: string) => void;
  onSaveName: (id: string) => Promise<void>;
}

export function CardholderSettingsSection({
  cardholders,
  editingCardholderNames,
  onNameChange,
  onSaveName,
}: CardholderSettingsSectionProps): React.ReactElement {
  return (
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
              onChange={(e) => onNameChange(ch.id, e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-600 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={() => void onSaveName(ch.id)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              שמור שם
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
