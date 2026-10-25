import React from 'react';
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
  return (
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
  );
}
