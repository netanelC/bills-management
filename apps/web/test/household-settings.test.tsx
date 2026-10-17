import { beforeEach, describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CardholderDto, CategoryDto } from '@bills/shared';
import { HouseholdSettings } from '../src/components/HouseholdSettings.js';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildMockCardholders(): CardholderDto[] {
  return [
    {
      id: faker.string.uuid(),
      name: 'אני',
      createdAt: faker.date.recent().toISOString(),
    },
    {
      id: faker.string.uuid(),
      name: 'אשתי',
      createdAt: faker.date.recent().toISOString(),
    },
  ];
}

function buildMockCategories(): CategoryDto[] {
  return [
    {
      id: faker.string.uuid(),
      name: 'חשבונות ודיור',
      spendingNature: 'FIXED',
      color: faker.color.rgb(),
      budgetTargetIls: null,
      sortOrder: 1,
    },
    {
      id: faker.string.uuid(),
      name: 'קניות וסופרמרקט',
      spendingNature: 'VARIABLE',
      color: faker.color.rgb(),
      budgetTargetIls: faker.number.int({ min: 1000, max: 5000 }),
      sortOrder: 2,
    },
    {
      id: faker.string.uuid(),
      name: 'פינוקים ומסעדות',
      spendingNature: 'DISCRETIONARY',
      color: faker.color.rgb(),
      budgetTargetIls: faker.number.int({ min: 500, max: 2000 }),
      sortOrder: 3,
    },
  ];
}

function setupDefaultFetchMocks(createdCardId: string): void {
  const cardholders = buildMockCardholders();
  const categories = buildMockCategories();

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url === '/api/cardholders' && method === 'GET') {
      return createJsonResponse({ cardholders });
    }

    if (url === '/api/cards' && method === 'GET') {
      return createJsonResponse({ cards: [] });
    }

    if (url === '/api/categories' && method === 'GET') {
      return createJsonResponse({ categories });
    }

    if (url === '/api/cards' && method === 'POST') {
      const parsed = JSON.parse(String(init?.body)) as {
        cardholderId: string;
        lastFourDigits: string;
        provider: string;
        nickname: string;
      };
      return createJsonResponse(
        {
          id: createdCardId,
          ...parsed,
          createdAt: faker.date.recent().toISOString(),
        },
        201,
      );
    }

    return createJsonResponse({}, 200);
  });
}

describe('HouseholdSettings Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders pre-seeded Cardholders and Categories grouped by FIXED, VARIABLE, and DISCRETIONARY', async () => {
    // Arrange
    setupDefaultFetchMocks(faker.string.uuid());

    // Act
    render(<HouseholdSettings />);

    // Assert
    await waitFor(() => {
      expect(screen.getByLabelText('שם מחזיק כרטיס אני')).toHaveValue('אני');
    });
    expect(screen.getByLabelText('שם מחזיק כרטיס אשתי')).toHaveValue('אשתי');
    expect(
      screen.getByTestId('spending-nature-group-FIXED'),
    ).toHaveTextContent('חשבונות ודיור');
    expect(
      screen.getByTestId('spending-nature-group-VARIABLE'),
    ).toHaveTextContent('קניות וסופרמרקט');
    expect(
      screen.getByTestId('spending-nature-group-DISCRETIONARY'),
    ).toHaveTextContent('פינוקים ומסעדות');
  });

  it('adds a new Card when the add-card form is submitted', async () => {
    // Arrange
    const createdCardId = faker.string.uuid();
    const cardNickname = faker.finance.accountName();
    const lastFour = faker.string.numeric(4);
    setupDefaultFetchMocks(createdCardId);
    render(<HouseholdSettings />);
    await waitFor(() => {
      expect(screen.getByLabelText('כינוי כרטיס חדש')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('כינוי כרטיס חדש'), {
      target: { value: cardNickname },
    });
    fireEvent.change(screen.getByLabelText('4 ספרות אחרונות לכרטיס חדש'), {
      target: { value: lastFour },
    });

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'הוסף כרטיס' }));

    // Assert
    await waitFor(() => {
      expect(
        screen.getByTestId(`card-row-${createdCardId}`),
      ).toHaveTextContent(cardNickname);
    });
    expect(screen.getByTestId(`card-row-${createdCardId}`)).toHaveTextContent(
      lastFour,
    );
  });
});
