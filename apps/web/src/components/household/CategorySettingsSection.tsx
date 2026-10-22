import React, { useState } from 'react';
import type { CategoryDto, SpendingNature } from '@bills/shared';
import {
  type CategoryFormState,
  INITIAL_CATEGORY_FORM,
  parseBudgetInput,
} from './types.js';

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

const SPENDING_NATURES: readonly SpendingNature[] = [
  'FIXED',
  'VARIABLE',
  'DISCRETIONARY',
];

export interface CategorySettingsSectionProps {
  categories: CategoryDto[];
  onCreateCategory: (input: {
    name: string;
    spendingNature: SpendingNature;
    color: string;
    budgetTargetIls: number | null;
  }) => Promise<void>;
  onUpdateCategory: (
    id: string,
    input: {
      name: string;
      spendingNature: SpendingNature;
      color: string;
      budgetTargetIls: number | null;
      sortOrder?: number;
    },
  ) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

export function CategorySettingsSection({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CategorySettingsSectionProps): React.ReactElement {
  const [newCategoryForm, setNewCategoryForm] = useState<CategoryFormState>(
    INITIAL_CATEGORY_FORM,
  );
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editCategoryForm, setEditCategoryForm] = useState<CategoryFormState>(
    INITIAL_CATEGORY_FORM,
  );

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const budgetTargetIls = parseBudgetInput(newCategoryForm.budgetTarget);
    await onCreateCategory({
      name: newCategoryForm.name.trim(),
      spendingNature: newCategoryForm.spendingNature,
      color: newCategoryForm.color,
      budgetTargetIls,
    });
    setNewCategoryForm(INITIAL_CATEGORY_FORM);
  }

  function startEdit(cat: CategoryDto): void {
    setEditingCategoryId(cat.id);
    setEditCategoryForm({
      name: cat.name,
      spendingNature: cat.spendingNature,
      color: cat.color,
      budgetTarget:
        cat.budgetTargetIls !== null ? String(cat.budgetTargetIls) : '',
      sortOrder: String(cat.sortOrder),
    });
  }

  async function handleSaveEdit(id: string): Promise<void> {
    const budgetTargetIls = parseBudgetInput(editCategoryForm.budgetTarget);
    const parsedOrder = Number(editCategoryForm.sortOrder);
    await onUpdateCategory(id, {
      name: editCategoryForm.name.trim(),
      spendingNature: editCategoryForm.spendingNature,
      color: editCategoryForm.color,
      budgetTargetIls,
      sortOrder: Number.isNaN(parsedOrder) ? undefined : parsedOrder,
    });
    setEditingCategoryId(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
      <h3 className="text-base font-semibold text-slate-900">
        קטלוג קטגוריות ויעדי תקציב (Categories & Budget Targets)
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        הקטגוריות מחולקות לפי אופי הוצאה (`Spending Nature`). ניתן להוסיף,
        לערוך ולהגדיר יעד תקציב חודשי בש"ח (`Budget Target`).
      </p>

      <form
        onSubmit={(e) => void handleCreate(e)}
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
          aria-label="אופי הוצאה לקטגוריה חדשה"
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
                  const isEditing = editingCategoryId === cat.id;

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
                            aria-label="ערוך אופי הוצאה"
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
                            onClick={() => void handleSaveEdit(cat.id)}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                          >
                            שמור קטגוריה
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
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
                              onClick={() => startEdit(cat)}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              ערוך
                            </button>
                            <button
                              type="button"
                              aria-label={`מחק קטגוריה ${cat.name}`}
                              onClick={() => void onDeleteCategory(cat.id)}
                              className="rounded-md border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              מחק
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
  );
}
