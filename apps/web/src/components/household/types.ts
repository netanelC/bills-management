import type { CardProvider, SpendingNature } from '@bills/shared';

export interface CardFormState {
  nickname: string;
  lastFourDigits: string;
  provider: CardProvider;
  cardholderId: string;
}

export interface CategoryFormState {
  name: string;
  spendingNature: SpendingNature;
  color: string;
  budgetTarget: string;
  sortOrder: string;
}

export const INITIAL_CARD_FORM: CardFormState = {
  nickname: '',
  lastFourDigits: '',
  provider: 'ISRACARD',
  cardholderId: '',
};

export const INITIAL_CATEGORY_FORM: CategoryFormState = {
  name: '',
  spendingNature: 'VARIABLE',
  color: '#10b981',
  budgetTarget: '',
  sortOrder: '1',
};

export function parseBudgetInput(rawBudget: string): number | null {
  const trimmed = rawBudget.trim();
  if (trimmed === '') {
    return null;
  }
  const numericValue = Number(trimmed);
  if (Number.isNaN(numericValue) || numericValue <= 0) {
    return null;
  }
  return numericValue;
}
