import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type DatabaseConnection } from '@bills/db';
import {
  InboxResponseSchema,
  MonthlyAnalyticsResponseSchema,
  StatementCommitResponseSchema,
  TransactionsListResponseSchema,
  type BillingMonth,
} from '@bills/shared';
import { buildServer } from '../src/app.js';

interface TestContext {
  app: FastifyInstance;
  dbConn: DatabaseConnection;
}

const PRIMARY_CARDHOLDER_ID = 'cardholder-primary';
const SPOUSE_CARDHOLDER_ID = 'cardholder-spouse';
const GROCERIES_CATEGORY_ID = 'cat-var-groceries';
const DINING_CATEGORY_ID = 'cat-disc-dining';
const TELECOM_CATEGORY_ID = 'cat-fixed-telecom';

function randomPurchaseDateInMonth(yearMonth: BillingMonth): string {
  const day = faker.number.int({ min: 1, max: 28 });
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
}

async function commitStatementBatchHelper(
  app: FastifyInstance,
  files: ReadonlyArray<{
    cardLastFour: string;
    billingMonth: BillingMonth;
    cardholderId?: string;
    amountsByMerchant: ReadonlyArray<{
      rawMerchantName: string;
      billedAmountIls: number;
    }>;
  }>,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/statements/commit',
    payload: {
      files: files.map((file, fileIdx) => ({
        filename: `stmt_${fileIdx}_${file.cardLastFour}_${file.billingMonth}.xls`,
        cardLastFour: file.cardLastFour,
        billingMonth: file.billingMonth,
        provider: 'ISRACARD' as const,
        newCardOnboarding: file.cardholderId
          ? {
              cardholderId: file.cardholderId,
              nickname: `כרטיס ${faker.word.noun()}`,
            }
          : undefined,
        transactions: file.amountsByMerchant.map((item, idx) => ({
          purchaseDate: randomPurchaseDateInMonth(file.billingMonth),
          rawMerchantName: item.rawMerchantName,
          billedAmountIls: item.billedAmountIls,
          originalAmount: item.billedAmountIls,
          originalCurrency: 'ILS',
          installmentCurrent: null,
          installmentTotal: null,
          installmentTotalAmountIls: null,
          occurrenceIndexWithinStatement: idx,
          dedupFingerprint: faker.string.alphanumeric(24),
        })),
      })),
    },
  });
  return StatementCommitResponseSchema.parse(res.json());
}

describe('Billing Month Analytics Dashboard & Drill-Down Filters API', () => {
  let context: TestContext | null = null;

  async function setupTestServer(): Promise<TestContext> {
    const dbConn = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConn.db,
      sqlite: dbConn.sqlite,
      logger: false,
    });
    context = { app, dbConn };
    return context;
  }

  afterEach(async () => {
    if (context) {
      await context.app.close();
      context.dbConn.close();
      context = null;
    }
  });

  it('When GET /api/analytics/monthly is queried for a Billing Month, Then it nets refunds within their Category, omits Excluded Transactions, and computes Budget Target utilization and trailing average delta', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const primaryCardLastFour = faker.string.numeric(4);
    const spouseCardLastFour = faker.string.numeric(4);
    const baseYear = faker.number.int({ min: 2024, max: 2026 });
    const previousMonth: BillingMonth = `${baseYear}-02`;
    const activeMonth: BillingMonth = `${baseYear}-03`;

    const groceriesMerchantName = `שופרסל ${faker.company.name()}`;
    const diningMerchantName = `מסעדת ${faker.company.name()}`;
    const telecomMerchantName = `פרטנר ${faker.company.name()}`;

    const prevMonthGroceriesSpend = faker.number.float({
      min: 400,
      max: 800,
      fractionDigits: 2,
    });
    const activeGroceriesPurchase = faker.number.float({
      min: 600,
      max: 900,
      fractionDigits: 2,
    });
    const activeGroceriesRefund = -faker.number.float({
      min: 50,
      max: 150,
      fractionDigits: 2,
    });
    const activeDiningSpend = faker.number.float({
      min: 200,
      max: 450,
      fractionDigits: 2,
    });
    const excludedTelecomSpend = faker.number.float({
      min: 100,
      max: 300,
      fractionDigits: 2,
    });
    const groceriesBudgetTarget = faker.number.float({
      min: 300,
      max: 450,
      fractionDigits: 2,
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/categories/${GROCERIES_CATEGORY_ID}`,
      payload: { budgetTargetIls: groceriesBudgetTarget },
    });

    await commitStatementBatchHelper(app, [
      {
        cardLastFour: primaryCardLastFour,
        billingMonth: previousMonth,
        cardholderId: PRIMARY_CARDHOLDER_ID,
        amountsByMerchant: [
          {
            rawMerchantName: groceriesMerchantName,
            billedAmountIls: prevMonthGroceriesSpend,
          },
        ],
      },
      {
        cardLastFour: primaryCardLastFour,
        billingMonth: activeMonth,
        amountsByMerchant: [
          {
            rawMerchantName: groceriesMerchantName,
            billedAmountIls: activeGroceriesPurchase,
          },
          {
            rawMerchantName: groceriesMerchantName,
            billedAmountIls: activeGroceriesRefund,
          },
          {
            rawMerchantName: telecomMerchantName,
            billedAmountIls: excludedTelecomSpend,
          },
        ],
      },
      {
        cardLastFour: spouseCardLastFour,
        billingMonth: activeMonth,
        cardholderId: SPOUSE_CARDHOLDER_ID,
        amountsByMerchant: [
          {
            rawMerchantName: diningMerchantName,
            billedAmountIls: activeDiningSpend,
          },
        ],
      },
    ]);

    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    for (const item of inbox.uncategorizedMerchants) {
      const catId =
        item.merchant.canonicalName === groceriesMerchantName
          ? GROCERIES_CATEGORY_ID
          : item.merchant.canonicalName === diningMerchantName
            ? DINING_CATEGORY_ID
            : TELECOM_CATEGORY_ID;
      await app.inject({
        method: 'PATCH',
        url: `/api/merchants/${item.merchant.id}`,
        payload: { defaultCategoryId: catId },
      });
    }

    const activeTxsRes = await app.inject({
      method: 'GET',
      url: `/api/transactions?billingMonth=${activeMonth}`,
    });
    const activeTxs = TransactionsListResponseSchema.parse(activeTxsRes.json());
    const telecomTx = activeTxs.transactions.find(
      (t) => t.rawMerchantName === telecomMerchantName,
    )!;
    await app.inject({
      method: 'PATCH',
      url: `/api/transactions/${telecomTx.id}`,
      payload: { isExcluded: true },
    });

    const expectedNetGroceries =
      activeGroceriesPurchase + activeGroceriesRefund;
    const expectedTotalActiveSpend = expectedNetGroceries + activeDiningSpend;

    // Act
    const response = await app.inject({ method: 'GET', url: `/api/analytics/monthly?billingMonth=${activeMonth}` });

    // Assert
    expect(response.statusCode).toBe(200);
    const analytics = MonthlyAnalyticsResponseSchema.parse(response.json());
    expect(analytics.selectedBillingMonth).toBe(activeMonth);
    expect(analytics.totalNetSpendIls).toBeCloseTo(expectedTotalActiveSpend, 2);
    expect(analytics.trailingAverageSpendIls).toBeCloseTo(
      prevMonthGroceriesSpend,
      2,
    );
    expect(analytics.deltaVsTrailingAverageIls).toBeCloseTo(
      expectedTotalActiveSpend - prevMonthGroceriesSpend,
      2,
    );

    const groceriesRow = analytics.categoryBreakdown.find(
      (c) => c.categoryId === GROCERIES_CATEGORY_ID,
    )!;
    expect(groceriesRow.totalIls).toBeCloseTo(expectedNetGroceries, 2);
    expect(groceriesRow.budgetTargetIls).toBeCloseTo(groceriesBudgetTarget, 2);
    expect(groceriesRow.isOverBudget).toBe(true);
    expect(groceriesRow.budgetUtilizationPercent).toBeCloseTo(
      (expectedNetGroceries / groceriesBudgetTarget) * 100,
      1,
    );
  });

  it('When filtering GET /api/analytics/monthly by Cardholder and Card, Then only Transactions for that Cardholder and Card are aggregated', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const primaryCardLastFour = faker.string.numeric(4);
    const spouseCardLastFour = faker.string.numeric(4);
    const billingMonth: BillingMonth = `${faker.number.int({ min: 2024, max: 2026 })}-05`;
    const primarySpend = faker.number.float({
      min: 200,
      max: 500,
      fractionDigits: 2,
    });
    const spouseSpend = faker.number.float({
      min: 80,
      max: 190,
      fractionDigits: 2,
    });

    const committed = await commitStatementBatchHelper(app, [
      {
        cardLastFour: primaryCardLastFour,
        billingMonth,
        cardholderId: PRIMARY_CARDHOLDER_ID,
        amountsByMerchant: [
          {
            rawMerchantName: `סופרמרקט ${faker.string.alpha(5)}`,
            billedAmountIls: primarySpend,
          },
        ],
      },
      {
        cardLastFour: spouseCardLastFour,
        billingMonth,
        cardholderId: SPOUSE_CARDHOLDER_ID,
        amountsByMerchant: [
          {
            rawMerchantName: `קפה ${faker.string.alpha(5)}`,
            billedAmountIls: spouseSpend,
          },
        ],
      },
    ]);
    const spouseCardId = committed.cards.find(
      (c) => c.lastFourDigits === spouseCardLastFour,
    )!.id;

    // Act
    const spouseAnalyticsRes = await app.inject({ method: 'GET', url: `/api/analytics/monthly?billingMonth=${billingMonth}&cardholderId=${SPOUSE_CARDHOLDER_ID}&cardId=${spouseCardId}` });

    // Assert
    expect(spouseAnalyticsRes.statusCode).toBe(200);
    const spouseAnalytics = MonthlyAnalyticsResponseSchema.parse(
      spouseAnalyticsRes.json(),
    );
    expect(spouseAnalytics.totalNetSpendIls).toBeCloseTo(spouseSpend, 2);
  });

  it('When filtering GET /api/transactions by Category, Spending Nature, and free-text search, Then only matching drill-down Transactions are returned', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const billingMonth: BillingMonth = `${faker.number.int({ min: 2024, max: 2026 })}-06`;
    const groceriesMerchant = `שופרסל-${faker.string.alpha(5)}`;
    const diningMerchant = `קפה-${faker.string.alpha(5)}`;

    await commitStatementBatchHelper(app, [
      {
        cardLastFour,
        billingMonth,
        cardholderId: PRIMARY_CARDHOLDER_ID,
        amountsByMerchant: [
          {
            rawMerchantName: groceriesMerchant,
            billedAmountIls: faker.number.float({
              min: 100,
              max: 300,
              fractionDigits: 2,
            }),
          },
          {
            rawMerchantName: diningMerchant,
            billedAmountIls: faker.number.float({
              min: 50,
              max: 150,
              fractionDigits: 2,
            }),
          },
        ],
      },
    ]);

    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    for (const item of inbox.uncategorizedMerchants) {
      const catId =
        item.merchant.canonicalName === groceriesMerchant
          ? GROCERIES_CATEGORY_ID
          : DINING_CATEGORY_ID;
      await app.inject({
        method: 'PATCH',
        url: `/api/merchants/${item.merchant.id}`,
        payload: { defaultCategoryId: catId },
      });
    }

    // Act
    const searchTxRes = await app.inject({ method: 'GET', url: `/api/transactions?billingMonth=${billingMonth}&categoryId=${DINING_CATEGORY_ID}&spendingNature=DISCRETIONARY&search=${encodeURIComponent(diningMerchant)}` });

    // Assert
    expect(searchTxRes.statusCode).toBe(200);
    const searchTx = TransactionsListResponseSchema.parse(searchTxRes.json());
    expect(searchTx.transactions).toHaveLength(1);
    expect(searchTx.transactions[0]?.rawMerchantName).toBe(diningMerchant);
  });
});
