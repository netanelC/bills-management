import {
  asc,
  cardholders,
  cards,
  categories,
  eq,
  type AppDatabase,
} from '@bills/db';
import type {
  CardDto,
  CardholderDto,
  CategoryDto,
  UpdateCardInput,
  UpdateCategoryInput,
} from '@bills/shared';

export class HouseholdRepository {
  constructor(private readonly db: AppDatabase) {}

  public listCardholders(): CardholderDto[] {
    return this.db
      .select()
      .from(cardholders)
      .orderBy(asc(cardholders.createdAt))
      .all();
  }

  public findCardholderById(id: string): CardholderDto | undefined {
    return this.db
      .select()
      .from(cardholders)
      .where(eq(cardholders.id, id))
      .get();
  }

  public insertCardholder(cardholder: CardholderDto): CardholderDto {
    this.db.insert(cardholders).values(cardholder).run();
    return cardholder;
  }

  public updateCardholderName(
    id: string,
    name: string,
  ): CardholderDto | undefined {
    const result = this.db
      .update(cardholders)
      .set({ name })
      .where(eq(cardholders.id, id))
      .run();
    if (Number(result.changes) === 0) {
      return undefined;
    }
    return this.findCardholderById(id);
  }

  public deleteCardholder(id: string): boolean {
    const result = this.db
      .delete(cardholders)
      .where(eq(cardholders.id, id))
      .run();
    return Number(result.changes) > 0;
  }

  public listCards(): CardDto[] {
    return this.db.select().from(cards).orderBy(asc(cards.createdAt)).all();
  }

  public findCardById(id: string): CardDto | undefined {
    return this.db.select().from(cards).where(eq(cards.id, id)).get();
  }

  public insertCard(card: CardDto): CardDto {
    this.db.insert(cards).values(card).run();
    return card;
  }

  public updateCard(id: string, updates: UpdateCardInput): CardDto | undefined {
    const result = this.db
      .update(cards)
      .set(updates)
      .where(eq(cards.id, id))
      .run();
    if (Number(result.changes) === 0) {
      return undefined;
    }
    return this.findCardById(id);
  }

  public deleteCard(id: string): boolean {
    const result = this.db.delete(cards).where(eq(cards.id, id)).run();
    return Number(result.changes) > 0;
  }

  public listCategories(): CategoryDto[] {
    return this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
  }

  public findCategoryById(id: string): CategoryDto | undefined {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .get();
  }

  public insertCategory(category: CategoryDto): CategoryDto {
    this.db.insert(categories).values(category).run();
    return category;
  }

  public updateCategory(
    id: string,
    updates: UpdateCategoryInput,
  ): CategoryDto | undefined {
    const result = this.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .run();
    if (Number(result.changes) === 0) {
      return undefined;
    }
    return this.findCategoryById(id);
  }

  public deleteCategory(id: string): boolean {
    const result = this.db
      .delete(categories)
      .where(eq(categories.id, id))
      .run();
    return Number(result.changes) > 0;
  }
}
