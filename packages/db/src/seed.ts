import { DEFAULT_CARDHOLDERS, DEFAULT_CATEGORIES } from '@bills/domain';
import type { AppDatabase } from './index.js';
import { cardholders, categories } from './schema.js';

export function seedDefaultHouseholdData(db: AppDatabase): void {
  const existingCardholders = db.select().from(cardholders).all();
  if (existingCardholders.length === 0) {
    const now = new Date().toISOString();
    db.insert(cardholders)
      .values(
        DEFAULT_CARDHOLDERS.map((item) => ({
          id: item.id,
          name: item.name,
          createdAt: now,
        })),
      )
      .run();
  }

  const existingCategories = db.select().from(categories).all();
  if (existingCategories.length === 0) {
    db.insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((item) => ({
          id: item.id,
          name: item.name,
          spendingNature: item.spendingNature,
          color: item.color,
          budgetTargetIls: null,
          sortOrder: item.sortOrder,
        })),
      )
      .run();
  }
}
