import React, { useEffect, useState } from 'react';
import type {
  CategoryDto,
  TransactionListItemDto,
  UpdateTransactionInput,
} from '@bills/shared';

export async function requestTransactionUpdate(
  transactionId: string,
  payload: UpdateTransactionInput,
): Promise<void> {
  const res = await fetch(`/api/transactions/${transactionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export interface TransactionInlineControlsProps {
  transaction: TransactionListItemDto;
  categories: readonly CategoryDto[];
  defaultOptionLabel: string;
  onUpdate: (
    transactionId: string,
    payload: UpdateTransactionInput,
  ) => Promise<void>;
}

export function TransactionInlineControls({
  transaction,
  categories,
  defaultOptionLabel,
  onUpdate,
}: TransactionInlineControlsProps): React.ReactElement {
  const [notesDraft, setNotesDraft] = useState<string>(transaction.notes ?? '');

  useEffect(() => {
    setNotesDraft(transaction.notes ?? '');
  }, [transaction.notes]);

  function commitNotesIfChanged(): void {
    const nextNotes = notesDraft.trim() || null;
    if (nextNotes !== (transaction.notes ?? null)) {
      void onUpdate(transaction.id, { notes: nextNotes });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        data-testid={`category-override-${transaction.id}`}
        aria-label={`סיווג עסקה ${transaction.rawMerchantName} (${transaction.purchaseDate})`}
        value={transaction.categoryOverrideId ?? ''}
        onChange={(e) =>
          void onUpdate(transaction.id, {
            categoryOverrideId: e.target.value || null,
          })
        }
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900"
      >
        <option value="">{defaultOptionLabel}</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      <input
        type="text"
        data-testid={`notes-input-${transaction.id}`}
        placeholder="הוסף הערה..."
        aria-label={`הערה עבור ${transaction.rawMerchantName} (${transaction.purchaseDate})`}
        value={notesDraft}
        onChange={(e) => setNotesDraft(e.target.value)}
        onBlur={() => commitNotesIfChanged()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitNotesIfChanged();
          }
        }}
        className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      />

      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
        <input
          type="checkbox"
          data-testid={`exclude-tx-${transaction.id}`}
          aria-label={`החרג עסקה ${transaction.rawMerchantName} (${transaction.purchaseDate})`}
          checked={transaction.isExcluded}
          onChange={(e) =>
            void onUpdate(transaction.id, {
              isExcluded: e.target.checked,
            })
          }
          className="rounded border-slate-300 text-indigo-600"
        />
        <span>החרג</span>
      </label>
    </div>
  );
}
