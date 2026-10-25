import React, { useEffect, useRef, useState } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Match category by override ID, or fallback to effectiveCategoryId or effectiveCategoryName
  const activeCategoryId =
    transaction.categoryOverrideId ?? transaction.effectiveCategoryId;
  const currentCategory =
    categories.find((c) => c.id === activeCategoryId) ??
    categories.find((c) => c.name === transaction.effectiveCategoryName);
  const isOverridden = Boolean(transaction.categoryOverrideId);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent): void {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function handleSelect(catId: string | null): Promise<void> {
    setIsOpen(false);
    setSearch('');
    await onUpdate(transaction.id, {
      categoryOverrideId: catId,
    });
  }

  const labelText = `סיווג עסקה ${transaction.rawMerchantName} (${transaction.purchaseDate})`;

  return (
    <div className="relative inline-block text-right" ref={popoverRef}>
      {/* Accessible native select for screen-readers and headless automation */}
      <select
        data-testid={`category-override-${transaction.id}`}
        aria-label={labelText}
        value={transaction.categoryOverrideId ?? ''}
        onChange={(e) =>
          void onUpdate(transaction.id, {
            categoryOverrideId: e.target.value || null,
          })
        }
        className="sr-only"
        tabIndex={-1}
      >
        <option value="">{defaultOptionLabel}</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      {/* Interactive Chip / Badge Button styled with the category's unique color */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={
          currentCategory
            ? {
                backgroundColor: `${currentCategory.color}15`,
                borderColor: `${currentCategory.color}45`,
                color: currentCategory.color,
              }
            : undefined
        }
        className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-2xs border transition-all ${
          !currentCategory
            ? 'bg-amber-50 text-amber-800 border-amber-300/60 hover:bg-amber-100'
            : 'hover:brightness-95'
        }`}
        title="לחץ לשינוי סיווג קטגוריה"
      >
        <span
          className="h-2 w-2 rounded-full shrink-0 shadow-2xs"
          style={{
            backgroundColor: currentCategory?.color ?? '#f59e0b',
          }}
        />
        <span className="truncate max-w-[130px] font-bold">
          {currentCategory?.name ??
            transaction.effectiveCategoryName ??
            'ללא סיווג'}
        </span>
        {isOverridden ? (
          <span
            className="rounded bg-indigo-100 px-1 text-[10px] font-normal text-indigo-700"
            title="דריסה ידנית"
          >
            ידני
          </span>
        ) : null}
        <span className="text-[10px] opacity-60 group-hover:opacity-100">
          ▾
        </span>
      </button>

      {/* Floating Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-1.5">
            <input
              type="search"
              placeholder="חיפוש קטגוריה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 text-xs">
            {/* Reset to default option */}
            <button
              type="button"
              onClick={() => void handleSelect(null)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-right transition-colors ${
                !isOverridden
                  ? 'bg-indigo-50 font-semibold text-indigo-900'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{defaultOptionLabel}</span>
              {!isOverridden && (
                <span className="text-indigo-600 text-[11px]">✓</span>
              )}
            </button>

            <div className="border-t border-slate-100 my-1" />

            {filteredCategories.map((cat) => {
              const isSelected =
                (transaction.categoryOverrideId ??
                  transaction.effectiveCategoryId) === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => void handleSelect(cat.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-right transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 font-semibold text-indigo-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 shadow-2xs"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </div>
                  {isSelected && (
                    <span className="text-indigo-600 text-[11px]">✓</span>
                  )}
                </button>
              );
            })}

            {filteredCategories.length === 0 && (
              <div className="py-2 text-center text-[11px] text-slate-400">
                לא נמצאו קטגוריות מתאימות
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
