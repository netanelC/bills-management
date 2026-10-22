import React from 'react';
import type { CategoryDto, SpendingNature } from '@bills/shared';
import type { CategoryFormState } from './types.js';

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
  newCategoryForm: CategoryFormState;
  onNewCategoryFormChange: React.Dispatch<
    React.SetStateAction<CategoryFormState>
  >;
  onCreateCategory: (e: React.FormEvent) => Promise<void>;
  editingCatId: string | null;
  editCategoryForm: CategoryFormState;
  onStartEditCategory: (cat: CategoryDto) => void;
  onCancelEditCategory: () => void;
  onEditCategoryFormChange: React.Dispatch<
    React.SetStateAction<CategoryFormState>
  >;
  onSaveCategoryEdit: (id: string) => Promise<void>;
}

export function CategorySettingsSection({
  categories,
  newCategoryForm,
  onNewCategoryFormChange,
  onCreateCategory,
  editingCatId,
  editCategoryForm,
  onStartEditCategory,
  onCancelEditCategory,
  onEditCategoryFormChange,
  onSaveCategoryEdit,
}: CategorySettingsSectionProps): React.ReactElement {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
      <h3 className="text-base font-semibold text-slate-900">
        קטלוג קטגוריות ויעדי תקציב (Categories & Budget Targets)
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        הקטגוריות מחולקות ל-3 קבוצות-על (`Spending Nature`). ניתן להוסיף,
        לערוך ולהגדיר יעד תקציב חודשי בש"ח (`Budget Target`).
      </p>

      <form
        onSubmit={(e) => void onCreateCategory(e)}
        className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
      >
        <input
          type="text"
          placeholder="שם קטגוריה חדשה"
          aria-label="שם קטגוריה חדשה"
          value={newCategoryForm.name}
          onChange={(e) =>
            onNewCategoryFormChange((prev) => ({
              ...prev,
              name: e.target.value,
            }))
          }
          required
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="קבוצת הוצאה לקטגוריה חדשה"
          value={newCategoryForm.spendingNature}
          onChange={(e) =>
            onNewCategoryFormChange((prev) => ({
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
            onNewCategoryFormChange((prev) => ({
              ...prev,
              color: e.target.value,
            }))
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
            onNewCategoryFormChange((prev) => ({
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
                              onEditCategoryFormChange((prev) => ({
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
                              onEditCategoryFormChange((prev) => ({
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
                              onEditCategoryFormChange((prev) => ({
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
                              onEditCategoryFormChange((prev) => ({
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
                              onEditCategoryFormChange((prev) => ({
                                ...prev,
                                sortOrder: e.target.value,
                              }))
                            }
                            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void onSaveCategoryEdit(cat.id)
                            }
                            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                          >
                            שמור קטגוריה
                          </button>
                          <button
                            type="button"
                            onClick={onCancelEditCategory}
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
                              onClick={() => onStartEditCategory(cat)}
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
  );
}
