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
    multiMonthTrends: [
      {
        billingMonth: prevMonth,
        totalNetSpendIls: trailingAvg,
        bySpendingNature: [
          { spendingNature: 'FIXED', totalIls: 0 },
          { spendingNature: 'VARIABLE', totalIls: trailingAvg },
          { spendingNature: 'DISCRETIONARY', totalIls: 0 },
        ],
        byCategory: [
          {
            categoryId: groceriesCategory.id,
            categoryName: groceriesCategory.name,
            color: groceriesCategory.color,
            totalIls: trailingAvg,
          },
        ],
      },
      {
        billingMonth: activeMonth,
        totalNetSpendIls: groceriesSpend,
        bySpendingNature: [
          { spendingNature: 'FIXED', totalIls: 0 },
          { spendingNature: 'VARIABLE', totalIls: groceriesSpend },
          { spendingNature: 'DISCRETIONARY', totalIls: 0 },
        ],
        byCategory: [
          {
            categoryId: groceriesCategory.id,
            categoryName: groceriesCategory.name,
            color: groceriesCategory.color,
            totalIls: groceriesSpend,
          },
        ],
      },
    ],
    topMerchants: [],
    topMerchantsMultiMonth: [],
    futureInstallmentsForecast: {
      activeInstallmentDeals: [],
      upcomingMonths: [],
    },
  };

  const topMerchantId = `merchant-${faker.string.uuid()}`;
  const topMerchantName = `רשת-${faker.company.name()}`;
  const installmentMerchantName = `מחשבים-${faker.company.name()}`;
  const installmentCurrent = faker.number.int({ min: 1, max: 3 });
  const remainingInstallmentsCount = faker.number.int({ min: 2, max: 4 });
  const installmentTotal = installmentCurrent + remainingInstallmentsCount;
  const installmentMonthlyIls = faker.number.float({
    min: 250,
    max: 650,
    fractionDigits: 2,
  });
  const remainingTotalAmountIls = Number(
    (installmentMonthlyIls * remainingInstallmentsCount).toFixed(2),
  );

  analytics.topMerchants = [
    {
      merchantId: topMerchantId,
      merchantName: topMerchantName,
      totalIls: groceriesSpend,
      transactionCount: 2,
      averageTransactionIls: Number((groceriesSpend / 2).toFixed(2)),
    },
  ];
  analytics.topMerchantsMultiMonth = [
    {
      merchantId: topMerchantId,
      merchantName: topMerchantName,
      totalIls: Number((groceriesSpend + trailingAvg).toFixed(2)),
      transactionCount: 3,
      averageTransactionIls: Number(
        ((groceriesSpend + trailingAvg) / 3).toFixed(2),
      ),
    },
  ];
  analytics.futureInstallmentsForecast = {
    activeInstallmentDeals: [
      {
        transactionId: faker.string.uuid(),
        merchantId: topMerchantId,
        merchantName: installmentMerchantName,
        rawMerchantName: `${installmentMerchantName} בע"מ`,
        cardId: card.id,
        cardNickname: card.nickname,
        cardholderName: primaryHolder.name,
        sourceBillingMonth: activeMonth,
        purchaseDate: `${activeMonth}-${String(faker.number.int({ min: 10, max: 28 })).padStart(2, '0')}`,
        monthlyAmountIls: installmentMonthlyIls,
        installmentCurrent,
        installmentTotal,
        remainingInstallmentsCount,
        remainingTotalAmountIls,
      },
    ],
    upcomingMonths: [
      {
        billingMonth: `${year}-05`,
        totalProjectedIls: installmentMonthlyIls,
        dealsCount: 1,
      },
      {
        billingMonth: `${year}-06`,
        totalProjectedIls: installmentMonthlyIls,
        dealsCount: 1,
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
    merchantId: topMerchantId,
    merchantName: topMerchantName,
    billingMonth: activeMonth,
    purchaseDate: `${activeMonth}-${String(faker.number.int({ min: 10, max: 28 })).padStart(2, '0')}`,
    rawMerchantName: topMerchantName,
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
    topMerchantId,
    installmentMerchantName,
    installmentCurrent,
    installmentTotal,
    analytics,
    transactions: [sampleTx],
  };
}

function mockDashboardFetch(
  scenario: ReturnType<typeof buildDashboardScenario>,
  requestedUrls: string[],
) {
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
}

describe('MonthlyDashboard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('When MonthlyDashboard renders and a Category bar is clicked, Then it displays KPI cards, Budget Target overrun status, and filters the drill-down transactions table by that Category', async () => {
    // Arrange
    const scenario = buildDashboardScenario();
    const requestedUrls: string[] = [];
    mockDashboardFetch(scenario, requestedUrls);

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

  it('When MonthlyDashboard renders Multi-Month Trends, Top Merchants, and Future Installments Forecast and a Top Merchant is clicked, Then it filters the drill-down transactions table by merchantId', async () => {
    // Arrange
    const scenario = buildDashboardScenario();
    const requestedUrls: string[] = [];
    mockDashboardFetch(scenario, requestedUrls);

    render(<MonthlyDashboard />);
    const topMerchantButton = await screen.findByTestId(
      `top-merchant-row-${scenario.topMerchantId}`,
    );

    // Act
    fireEvent.click(topMerchantButton);

    // Assert
    await waitFor(() => {
      expect(
        requestedUrls.some((u) =>
          u.includes(`merchantId=${scenario.topMerchantId}`),
        ),
      ).toBe(true);
    });
    expect(
      screen.getByTestId('multi-month-trends-section'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('future-installments-section'),
    ).toHaveTextContent(scenario.installmentMerchantName);
    expect(
      screen.getByTestId('future-installments-section'),
    ).toHaveTextContent(
      `תשלום ${scenario.installmentCurrent} מתוך ${scenario.installmentTotal}`,
    );
  });
});
