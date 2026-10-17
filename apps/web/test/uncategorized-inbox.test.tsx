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
    canonicalName: `BIT ${faker.word.noun()}`,
    defaultCategoryId: null,
    defaultCategoryName: null,
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
    {
      merchant: secondMerchant,
      transactionCount: secondTxCount,
      totalBilledIls: sampleAmountTwo,
      sampleTransactions: [
        {
          id: faker.string.uuid(),
          purchaseDate: sampleDate,
          rawMerchantName: secondMerchant.canonicalName,
          billedAmountIls: sampleAmountTwo,
          cardNickname: `אמקס ${faker.word.noun()}`,
        },
      ],
    },
  ];

  const sampleBillingMonth = `${faker.number.int({ min: 2024, max: 2027 })}-${String(faker.number.int({ min: 1, max: 12 })).padStart(2, '0')}` as const;

  const ambiguousTx = {
    id: faker.string.uuid(),
    statementId: faker.string.uuid(),
    cardId: faker.string.uuid(),
    cardLastFourDigits: faker.string.numeric(4),
    cardNickname: `ישראכרט ${faker.word.noun()}`,
    cardProvider: 'ISRACARD' as const,
    cardholderId: faker.string.uuid(),
    cardholderName: `מחזיק-${faker.person.firstName()}`,
    merchantId: secondMerchant.id,
    merchantName: secondMerchant.canonicalName,
    billingMonth: sampleBillingMonth,
    purchaseDate: sampleDate,
    rawMerchantName: `BIT ${faker.word.noun()}`,
    billedAmountIls: sampleAmountTwo,
    originalAmount: sampleAmountTwo,
    originalCurrency: 'ILS',
    installmentCurrent: null,
    installmentTotal: null,
    installmentTotalAmountIls: null,
    categoryOverrideId: null,
    effectiveCategoryId: null,
    effectiveCategoryName: null,
    notes: null,
    isExcluded: false,
  };

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
    ambiguousTx,
    sampleDate,
    sampleAmountOne,
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
        const remainingMerchants = currentInbox.uncategorizedMerchants.filter(
          (m) => m.merchant.id !== scenario.firstMerchant.id,
        );
        currentInbox = {
          ...currentInbox,
          totalInboxCount: remainingMerchants.length,
          uncategorizedMerchants: remainingMerchants,
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
      expect(screen.getByTestId('inbox-badge-count')).toHaveTextContent('1');
    });
  });

  it('When merging a source Merchant into a target Merchant, Then it sends POST /api/merchants/merge', async () => {
    // Arrange
    const scenario = buildInboxScenario();
    let mergePayload: unknown = null;

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
      if (url === '/api/merchants/merge' && method === 'POST') {
        mergePayload = JSON.parse(String(init?.body));
        return createJsonResponse({
          mergedMerchant: scenario.firstMerchant,
          reassignedTransactionsCount: scenario.secondMerchant.transactionCount,
        });
      }
      return createJsonResponse({});
    });

    render(<UncategorizedInbox />);
    const targetSelect = await screen.findByLabelText('בית עסק יעד למיזוג');
    fireEvent.change(targetSelect, {
      target: { value: scenario.firstMerchant.id },
    });
    const sourceCheckbox = await screen.findByLabelText(
      `מזג את ${scenario.secondMerchant.canonicalName}`,
    );
    fireEvent.click(sourceCheckbox);

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'מזג בתי עסק' }));

    // Assert
    await waitFor(() => {
      expect(mergePayload).toEqual({
        targetMerchantId: scenario.firstMerchant.id,
        sourceMerchantIds: [scenario.secondMerchant.id],
      });
    });
  });

  it('When an Ambiguous Merchant Transaction is displayed in the Uncategorized Inbox, Then selecting a Category Override sends PATCH /api/transactions/:id', async () => {
    // Arrange
    const scenario = buildInboxScenario();
    const inboxWithAmbiguous: InboxResponseDto = {
      ...scenario.inbox,
      totalInboxCount: scenario.inbox.uncategorizedMerchants.length + 1,
      ambiguousTransactions: [scenario.ambiguousTx],
    };
    let patchedTransactionPayload: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/categories' && method === 'GET') {
        return createJsonResponse({ categories: scenario.categories });
      }
      if (url === '/api/inbox' && method === 'GET') {
        return createJsonResponse(inboxWithAmbiguous);
      }
      if (url === '/api/merchants' && method === 'GET') {
        return createJsonResponse({
          merchants: [scenario.firstMerchant, scenario.secondMerchant],
        });
      }
      if (
        url === `/api/transactions/${scenario.ambiguousTx.id}` &&
        method === 'PATCH'
      ) {
        patchedTransactionPayload = JSON.parse(String(init?.body));
        return createJsonResponse({
          ...scenario.ambiguousTx,
          categoryOverrideId: scenario.diningCategory.id,
          effectiveCategoryId: scenario.diningCategory.id,
          effectiveCategoryName: scenario.diningCategory.name,
        });
      }
      return createJsonResponse({});
    });

    render(<UncategorizedInbox />);
    const overrideSelect = await screen.findByLabelText(
      `סיווג עסקה ${scenario.ambiguousTx.rawMerchantName} (${scenario.ambiguousTx.purchaseDate})`,
    );

    // Act
    fireEvent.change(overrideSelect, { target: { value: scenario.diningCategory.id } });

    // Assert
    await waitFor(() => {
      expect(patchedTransactionPayload).toEqual({
        categoryOverrideId: scenario.diningCategory.id,
      });
    });
    expect(
      screen.getByTestId(`inbox-ambiguous-tx-${scenario.ambiguousTx.id}`),
    ).toHaveTextContent(scenario.ambiguousTx.cardholderName);
  });
});
