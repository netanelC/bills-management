import { beforeEach, describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  CategoryDto,
  InboxResponseDto,
  MerchantDto,
} from '@bills/shared';
import { UncategorizedInbox } from '../src/components/UncategorizedInbox.js';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildInboxScenario() {
  const groceriesCategory: CategoryDto = {
    id: faker.string.uuid(),
    name: `קניות-${faker.word.noun()}`,
    spendingNature: 'VARIABLE',
    color: faker.color.rgb(),
    budgetTargetIls: null,
    sortOrder: faker.number.int({ min: 1, max: 10 }),
  };
  const diningCategory: CategoryDto = {
    id: faker.string.uuid(),
    name: `מסעדות-${faker.word.noun()}`,
    spendingNature: 'DISCRETIONARY',
    color: faker.color.rgb(),
    budgetTargetIls: null,
    sortOrder: faker.number.int({ min: 11, max: 20 }),
  };

  const sampleAmountOne = faker.number.float({
    min: 50,
    max: 350,
    fractionDigits: 2,
  });
  const sampleAmountTwo = faker.number.float({
    min: 40,
    max: 290,
    fractionDigits: 2,
  });
  const sampleDate = faker.date.recent({ days: 25 }).toISOString().slice(0, 10);
  const firstTxCount = faker.number.int({ min: 2, max: 6 });
  const secondTxCount = faker.number.int({ min: 1, max: 4 });

  const firstMerchant: MerchantDto = {
    id: faker.string.uuid(),
    canonicalName: `שופרסל ${faker.word.noun()}`,
    defaultCategoryId: null,
    defaultCategoryName: null,
    isAmbiguous: false,
    createdAt: faker.date.recent().toISOString(),
    aliases: [
      {
        id: faker.string.uuid(),
        merchantId: faker.string.uuid(),
        pattern: `שופרסל-${faker.string.alpha(4)}`,
        matchType: 'EXACT',
      },
    ],
    transactionCount: firstTxCount,
    totalBilledIls: sampleAmountOne,
  };

  const secondMerchant: MerchantDto = {
    id: faker.string.uuid(),
    canonicalName: `קפה ${faker.word.noun()}`,
    defaultCategoryId: diningCategory.id,
    defaultCategoryName: diningCategory.name,
    isAmbiguous: false,
    createdAt: faker.date.recent().toISOString(),
    aliases: [],
    transactionCount: secondTxCount,
    totalBilledIls: sampleAmountTwo,
  };

  const uncategorizedMerchants = [
    {
      merchant: firstMerchant,
      transactionCount: firstTxCount,
      totalBilledIls: sampleAmountOne,
      sampleTransactions: [
        {
          id: faker.string.uuid(),
          purchaseDate: sampleDate,
          rawMerchantName: firstMerchant.canonicalName,
          billedAmountIls: sampleAmountOne,
          cardNickname: `ישראכרט ${faker.word.noun()}`,
        },
      ],
    },
  ];

  const inbox: InboxResponseDto = {
    totalInboxCount: uncategorizedMerchants.length,
    uncategorizedMerchants,
    ambiguousTransactions: [],
  };

  return {
    categories: [groceriesCategory, diningCategory],
    groceriesCategory,
    diningCategory,
    firstMerchant,
    secondMerchant,
    inbox,
  };
}

describe('UncategorizedInbox Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('When UncategorizedInbox renders and a default Category is assigned to a Merchant, Then it sends PATCH /api/merchants/:id and removes the Merchant from the inbox list', async () => {
    // Arrange
    const scenario = buildInboxScenario();
    let currentInbox = scenario.inbox;
    let patchedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/categories' && method === 'GET') {
        return createJsonResponse({ categories: scenario.categories });
      }
      if (url === '/api/inbox' && method === 'GET') {
        return createJsonResponse(currentInbox);
      }
      if (url === '/api/merchants' && method === 'GET') {
        return createJsonResponse({
          merchants: [scenario.firstMerchant, scenario.secondMerchant],
        });
      }
      if (
        url === `/api/merchants/${scenario.firstMerchant.id}` &&
        method === 'PATCH'
      ) {
        patchedBody = JSON.parse(String(init?.body));
        currentInbox = {
          ...currentInbox,
          totalInboxCount: 0,
          uncategorizedMerchants: [],
        };
        return createJsonResponse({
          ...scenario.firstMerchant,
          defaultCategoryId: scenario.groceriesCategory.id,
          defaultCategoryName: scenario.groceriesCategory.name,
        });
      }
      return createJsonResponse({});
    });

    render(<UncategorizedInbox />);
    const categorySelect = await screen.findByLabelText(
      `בחר קטגוריה עבור ${scenario.firstMerchant.canonicalName}`,
    );

    // Act
    fireEvent.change(categorySelect, { target: { value: scenario.groceriesCategory.id } });

    // Assert
    await waitFor(() => {
      expect(patchedBody).toEqual({
        defaultCategoryId: scenario.groceriesCategory.id,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('inbox-badge-count')).toHaveTextContent('0');
    });
  });

  it('When adding an Alias rule to a Merchant, Then it sends PATCH /api/merchants/:id with addAlias', async () => {
    // Arrange
    const scenario = buildInboxScenario();
    let patchedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/categories' && method === 'GET') {
        return createJsonResponse({ categories: scenario.categories });
      }
      if (url === '/api/inbox' && method === 'GET') {
        return createJsonResponse(scenario.inbox);
      }
      if (url === '/api/merchants' && method === 'GET') {
        return createJsonResponse({
          merchants: [scenario.firstMerchant, scenario.secondMerchant],
        });
      }
      if (
        url === `/api/merchants/${scenario.firstMerchant.id}` &&
        method === 'PATCH'
      ) {
        patchedBody = JSON.parse(String(init?.body));
        return createJsonResponse(scenario.firstMerchant);
      }
      return createJsonResponse({});
    });

    render(<UncategorizedInbox />);
    const aliasInput = await screen.findByLabelText(
      `תבנית זיהוי עבור ${scenario.firstMerchant.canonicalName}`,
    );
    fireEvent.change(aliasInput, { target: { value: 'סניף מרכז' } });

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'הוסף כלל זיהוי' }));

    // Assert
    await waitFor(() => {
      expect(patchedBody).toEqual({
        addAlias: {
          pattern: 'סניף מרכז',
          matchType: 'CONTAINS',
        },
      });
    });
  });

  it('When changing category of a categorized Merchant in the directory, Then it sends PATCH /api/merchants/:id', async () => {
    // Arrange
    const scenario = buildInboxScenario();
    let patchedBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/categories' && method === 'GET') {
        return createJsonResponse({ categories: scenario.categories });
      }
      if (url === '/api/inbox' && method === 'GET') {
        return createJsonResponse(scenario.inbox);
      }
      if (url === '/api/merchants' && method === 'GET') {
        return createJsonResponse({
          merchants: [scenario.firstMerchant, scenario.secondMerchant],
        });
      }
      if (
        url === `/api/merchants/${scenario.secondMerchant.id}` &&
        method === 'PATCH'
      ) {
        patchedBody = JSON.parse(String(init?.body));
        return createJsonResponse(scenario.secondMerchant);
      }
      return createJsonResponse({});
    });

    render(<UncategorizedInbox />);
    const dirSelect = await screen.findByLabelText(
      `שנה קטגוריה עבור ${scenario.secondMerchant.canonicalName}`,
    );

    // Act
    fireEvent.change(dirSelect, { target: { value: scenario.groceriesCategory.id } });

    // Assert
    await waitFor(() => {
      expect(patchedBody).toEqual({
        defaultCategoryId: scenario.groceriesCategory.id,
      });
    });
  });
});
