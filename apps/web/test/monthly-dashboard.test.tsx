import { beforeEach, describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  BillingMonth,
  CardDto,
  CardholderDto,
  CategoryDto,
  MonthlyAnalyticsResponseDto,
  TransactionListItemDto,
} from '@bills/shared';
import { MonthlyDashboard } from '../src/components/MonthlyDashboard.js';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildDashboardScenario() {
  const year = faker.number.int({ min: 2024, max: 2027 });
  const activeMonth: BillingMonth = `${year}-04`;
  const prevMonth: BillingMonth = `${year}-03`;

  const primaryHolder: CardholderDto = {
    id: faker.string.uuid(),
    name: `מחזיק-${faker.person.firstName()}`,
    createdAt: faker.date.recent().toISOString(),
  };

  const card: CardDto = {
    id: faker.string.uuid(),
    cardholderId: primaryHolder.id,
    lastFourDigits: faker.string.numeric(4),
    provider: 'ISRACARD',
    nickname: `כרטיס-${faker.word.noun()}`,
    createdAt: faker.date.recent().toISOString(),
  };

  const groceriesCategory: CategoryDto = {
    id: faker.string.uuid(),
    name: `סופרמרקט-${faker.word.noun()}`,
    spendingNature: 'VARIABLE',
    color: faker.color.rgb(),
    budgetTargetIls: faker.number.float({
      min: 300,
      max: 500,
      fractionDigits: 2,
    }),
    sortOrder: 1,
  };

  const groceriesSpend = faker.number.float({
    min: 600,
    max: 900,
    fractionDigits: 2,
  });
  const trailingAvg = faker.number.float({
    min: 400,
    max: 550,
    fractionDigits: 2,
  });

  const analytics: MonthlyAnalyticsResponseDto = {
    selectedBillingMonth: activeMonth,
    availableBillingMonths: [activeMonth, prevMonth],
    totalNetSpendIls: groceriesSpend,
    trailingAverageSpendIls: trailingAvg,
    deltaVsTrailingAverageIls: Number(
      (groceriesSpend - trailingAvg).toFixed(2),
    ),
    deltaVsTrailingAveragePercent: Number(
      (((groceriesSpend - trailingAvg) / trailingAvg) * 100).toFixed(2),
    ),
    previousBillingMonth: prevMonth,
    previousMonthSpendIls: trailingAvg,
    spendingNatureBreakdown: [
      {
        spendingNature: 'FIXED',
        totalIls: 0,
        sharePercent: 0,
        transactionCount: 0,
      },
      {
        spendingNature: 'VARIABLE',
        totalIls: groceriesSpend,
        sharePercent: 100,
        transactionCount: 1,
      },
      {
        spendingNature: 'DISCRETIONARY',
        totalIls: 0,
        sharePercent: 0,
        transactionCount: 0,
      },
    ],
    cardholderBreakdown: [
      {
        cardholderId: primaryHolder.id,
        cardholderName: primaryHolder.name,
        totalIls: groceriesSpend,
        sharePercent: 100,
        transactionCount: 1,
      },
    ],
    categoryBreakdown: [
      {
        categoryId: groceriesCategory.id,
        categoryName: groceriesCategory.name,
        spendingNature: 'VARIABLE',
        color: groceriesCategory.color,
        totalIls: groceriesSpend,
        sharePercent: 100,
        transactionCount: 1,
        previousMonthIls: trailingAvg,
        deltaVsPreviousMonthIls: Number(
          (groceriesSpend - trailingAvg).toFixed(2),
        ),
        historicalAverageIls: trailingAvg,
        budgetTargetIls: groceriesCategory.budgetTargetIls,
        budgetUtilizationPercent: Number(
          (
            (groceriesSpend / (groceriesCategory.budgetTargetIls ?? 1)) *
            100
          ).toFixed(2),
        ),
        isOverBudget: true,
      },
    ],
  };

  const sampleTx: TransactionListItemDto = {
    id: faker.string.uuid(),
    statementId: faker.string.uuid(),
    cardId: card.id,
    cardLastFourDigits: card.lastFourDigits,
    cardNickname: card.nickname,
    cardProvider: card.provider,
    cardholderId: primaryHolder.id,
    cardholderName: primaryHolder.name,
    merchantId: faker.string.uuid(),
    merchantName: `שופרסל ${faker.word.noun()}`,
    billingMonth: activeMonth,
    purchaseDate: `${activeMonth}-${String(faker.number.int({ min: 10, max: 28 })).padStart(2, '0')}`,
    rawMerchantName: `שופרסל ${faker.word.noun()}`,
    billedAmountIls: groceriesSpend,
    originalAmount: groceriesSpend,
    originalCurrency: 'ILS',
    installmentCurrent: null,
    installmentTotal: null,
    installmentTotalAmountIls: null,
    categoryOverrideId: null,
    effectiveCategoryId: groceriesCategory.id,
    effectiveCategoryName: groceriesCategory.name,
    notes: null,
    isExcluded: false,
  };

  return {
    activeMonth,
    primaryHolder,
    card,
    groceriesCategory,
    groceriesSpend,
    analytics,
    transactions: [sampleTx],
  };
}

describe('MonthlyDashboard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('When MonthlyDashboard renders and a Category bar is clicked, Then it displays KPI cards, Budget Target overrun status, and filters the drill-down transactions table by that Category', async () => {
    // Arrange
    const scenario = buildDashboardScenario();
    const requestedUrls: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(url);
      if (url === '/api/cardholders') {
        return createJsonResponse({ cardholders: [scenario.primaryHolder] });
      }
      if (url === '/api/cards') {
        return createJsonResponse({ cards: [scenario.card] });
      }
      if (url === '/api/categories') {
        return createJsonResponse({ categories: [scenario.groceriesCategory] });
      }
      if (url.startsWith('/api/analytics/monthly')) {
        return createJsonResponse(scenario.analytics);
      }
      if (url.startsWith('/api/transactions')) {
        return createJsonResponse({ transactions: scenario.transactions });
      }
      return createJsonResponse({});
    });

    render(<MonthlyDashboard />);
    const categoryButton = await screen.findByTestId(
      `dashboard-category-row-${scenario.groceriesCategory.id}`,
    );

    // Act
    fireEvent.click(categoryButton);

    // Assert
    await waitFor(() => {
      expect(
        requestedUrls.some((u) =>
          u.includes(`categoryId=${scenario.groceriesCategory.id}`),
        ),
      ).toBe(true);
    });
    expect(screen.getByTestId('kpi-total-net-spend')).toHaveTextContent(
      scenario.groceriesSpend.toLocaleString('he-IL'),
    );
    expect(
      screen.getByTestId(
        `dashboard-category-row-${scenario.groceriesCategory.id}`,
      ),
    ).toHaveTextContent('חריגה מהיעד');
  });
});
