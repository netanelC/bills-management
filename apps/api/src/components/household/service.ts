import crypto from 'node:crypto';
import type {
  CardDto,
  CardholderDto,
  CategoryDto,
  CreateCardholderInput,
  CreateCardInput,
  CreateCategoryInput,
  UpdateCardholderInput,
  UpdateCardInput,
  UpdateCategoryInput,
} from '@bills/shared';
import { AppError } from '../../errors/app-error.js';
import type { HouseholdRepository } from './repository.js';

export class HouseholdService {
  constructor(private readonly repository: HouseholdRepository) {}

  private ensureCardholderExists(cardholderId: string): void {
    const owner = this.repository.findCardholderById(cardholderId);
    if (!owner) {
      throw new AppError({
        code: 'CARDHOLDER_NOT_FOUND',
        httpCode: 404,
        description: `Cardholder ${cardholderId} was not found`,
      });
    }
  }

  public listCardholders(): CardholderDto[] {
    return this.repository.listCardholders();
  }

  public createCardholder(input: CreateCardholderInput): CardholderDto {
    const cardholder: CardholderDto = {
      id: crypto.randomUUID(),
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    return this.repository.insertCardholder(cardholder);
  }

  public updateCardholder(
    id: string,
    input: UpdateCardholderInput,
  ): CardholderDto {
    const updated = this.repository.updateCardholderName(id, input.name);
    if (!updated) {
      throw new AppError({
        code: 'CARDHOLDER_NOT_FOUND',
        httpCode: 404,
        description: `Cardholder ${id} was not found`,
      });
    }
    return updated;
  }

  public deleteCardholder(id: string): void {
    const deleted = this.repository.deleteCardholder(id);
    if (!deleted) {
      throw new AppError({
        code: 'CARDHOLDER_NOT_FOUND',
        httpCode: 404,
        description: `Cardholder ${id} was not found`,
      });
    }
  }

  public listCards(): CardDto[] {
    return this.repository.listCards();
  }

  public createCard(input: CreateCardInput): CardDto {
    this.ensureCardholderExists(input.cardholderId);

    const card: CardDto = {
      id: crypto.randomUUID(),
      cardholderId: input.cardholderId,
      lastFourDigits: input.lastFourDigits,
      provider: input.provider,
      nickname: input.nickname,
      createdAt: new Date().toISOString(),
    };

    return this.repository.insertCard(card);
  }

  public updateCard(id: string, input: UpdateCardInput): CardDto {
    if (input.cardholderId !== undefined) {
      this.ensureCardholderExists(input.cardholderId);
    }

    const updated = this.repository.updateCard(id, input);
    if (!updated) {
      throw new AppError({
        code: 'CARD_NOT_FOUND',
        httpCode: 404,
        description: `Card ${id} was not found`,
      });
    }

    return updated;
  }

  public deleteCard(id: string): void {
    const deleted = this.repository.deleteCard(id);
    if (!deleted) {
      throw new AppError({
        code: 'CARD_NOT_FOUND',
        httpCode: 404,
        description: `Card ${id} was not found`,
      });
    }
  }

  public listCategories(): CategoryDto[] {
    return this.repository.listCategories();
  }

  public createCategory(input: CreateCategoryInput): CategoryDto {
    const existingCategories = this.repository.listCategories();
    const maxSortOrder = existingCategories.reduce(
      (max, cat) => (cat.sortOrder > max ? cat.sortOrder : max),
      0,
    );

    const category: CategoryDto = {
      id: crypto.randomUUID(),
      name: input.name,
      spendingNature: input.spendingNature,
      color: input.color,
      budgetTargetIls: input.budgetTargetIls ?? null,
      sortOrder: input.sortOrder ?? maxSortOrder + 1,
    };

    return this.repository.insertCategory(category);
  }

  public updateCategory(id: string, input: UpdateCategoryInput): CategoryDto {
    const updated = this.repository.updateCategory(id, input);
    if (!updated) {
      throw new AppError({
        code: 'CATEGORY_NOT_FOUND',
        httpCode: 404,
        description: `Category ${id} was not found`,
      });
    }

    return updated;
  }

  public deleteCategory(id: string): void {
    const deleted = this.repository.deleteCategory(id);
    if (!deleted) {
      throw new AppError({
        code: 'CATEGORY_NOT_FOUND',
        httpCode: 404,
        description: `Category ${id} was not found`,
      });
    }
  }
}
