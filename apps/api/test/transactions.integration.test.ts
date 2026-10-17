import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type DatabaseConnection } from '@bills/db';
import {
  ErrorResponseSchema,
  InboxResponseSchema,
  TransactionListItemSchema,
  TransactionsListResponseSchema,
  type BillingMonth,
} from '@bills/shared';
import { buildServer } from '../src/app.js';

interface TestContext {
  app: FastifyInstance;
  dbConn: DatabaseConnection;
}

const DEFAULT_PRIMARY_CARDHOLDER_ID = 'cardholder-primary';
const GROCERIES_CATEGORY_ID = 'cat-var-groceries';
const DINING_CATEGORY_ID = 'cat-disc-dining';
const EDUCATION_CATEGORY_ID = 'cat-fixed-education';

function randomBillingMonth(): BillingMonth {
  const year = faker.number.int({ min: 2023, max: 2027 });
  const month = faker.number.int({ min: 1, max: 12 });
  return `${year}-${String(month).padStart(2, '0')}`;
}

function randomPurchaseDateInMonth(yearMonth: BillingMonth): string {
  const day = faker.number.int({ min: 1, max: 28 });
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
}

async function seedSingleTransaction(
  app: FastifyInstance,
  params: {
    rawMerchantName?: string;
    billingMonth?: BillingMonth;
    billedAmountIls?: number;
  } = {},
): Promise<{
  transactionId: string;
  merchantId: string;
  billingMonth: BillingMonth;
}> {
  const cardLastFour = faker.string.numeric(4);
  const billingMonth = params.billingMonth ?? randomBillingMonth();
  const rawMerchantName =
    params.rawMerchantName ?? `בית עסק ${faker.company.name()}`;
  const billedAmountIls =
    params.billedAmountIls ??
    faker.number.float({ min: 40, max: 350, fractionDigits: 2 });

  await app.inject({
    method: 'POST',
    url: '/api/statements/commit',
    payload: {
      files: [
        {
          filename: `stmt_${cardLastFour}_${billingMonth}.xls`,
          cardLastFour,
          billingMonth,
          provider: 'ISRACARD',
          newCardOnboarding: {
            cardholderId: DEFAULT_PRIMARY_CARDHOLDER_ID,
            nickname: `כרטיס ${faker.word.noun()}`,
          },
          transactions: [
            {
              purchaseDate: randomPurchaseDateInMonth(billingMonth),
              rawMerchantName,
              billedAmountIls,
              originalAmount: billedAmountIls,
              originalCurrency: 'ILS',
              installmentCurrent: null,
              installmentTotal: null,
              installmentTotalAmountIls: null,
              occurrenceIndexWithinStatement: 0,
              dedupFingerprint: faker.string.alphanumeric(24),
            },
          ],
        },
      ],
    },
  });

  const txRes = await app.inject({
    method: 'GET',
    url: `/api/transactions?billingMonth=${billingMonth}`,
  });
  const txList = TransactionsListResponseSchema.parse(txRes.json());
  const tx = txList.transactions[0]!;
  return {
    transactionId: tx.id,
    merchantId: tx.merchantId,
    billingMonth,
  };
}

describe('Per-Transaction Controls & Ambiguous Merchant Routing API', () => {
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

  it('When an Ambiguous Merchant Transaction is classified with a Category Override, Then it disappears from GET /api/inbox and resolves to that Category', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const { transactionId, merchantId } = await seedSingleTransaction(app, {
      rawMerchantName: `BIT ${faker.string.alpha(5)}`,
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/merchants/${merchantId}`,
      payload: { isAmbiguous: true },
    });

    // Act
    const patchRes = await app.inject({ method: 'PATCH', url: `/api/transactions/${transactionId}`, payload: { categoryOverrideId: EDUCATION_CATEGORY_ID } });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const updatedTx = TransactionListItemSchema.parse(patchRes.json());
    expect(updatedTx.categoryOverrideId).toBe(EDUCATION_CATEGORY_ID);
    expect(updatedTx.effectiveCategoryId).toBe(EDUCATION_CATEGORY_ID);

    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    expect(inbox.ambiguousTransactions).toHaveLength(0);
    expect(inbox.totalInboxCount).toBe(0);
  });

  it('When a Transaction has a Category Override and its Merchant default Category later changes, Then the Transaction retains its Category Override', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const { transactionId, merchantId } = await seedSingleTransaction(app);
    await app.inject({
      method: 'PATCH',
      url: `/api/merchants/${merchantId}`,
      payload: { defaultCategoryId: GROCERIES_CATEGORY_ID },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/transactions/${transactionId}`,
      payload: { categoryOverrideId: DINING_CATEGORY_ID },
    });

    // Act
    await app.inject({ method: 'PATCH', url: `/api/merchants/${merchantId}`, payload: { defaultCategoryId: EDUCATION_CATEGORY_ID } });

    // Assert
    const txAfterMerchantChangeRes = await app.inject({
      method: 'GET',
      url: '/api/transactions',
    });
    const txAfterMerchantChange = TransactionsListResponseSchema.parse(
      txAfterMerchantChangeRes.json(),
    );
    expect(txAfterMerchantChange.transactions[0]?.effectiveCategoryId).toBe(
      DINING_CATEGORY_ID,
    );
  });

  it('When a Transaction Category Override is cleared with null, Then the Transaction restores inheritance from its Merchant default Category', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const { transactionId, merchantId } = await seedSingleTransaction(app);
    await app.inject({
      method: 'PATCH',
      url: `/api/merchants/${merchantId}`,
      payload: { defaultCategoryId: EDUCATION_CATEGORY_ID },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/transactions/${transactionId}`,
      payload: { categoryOverrideId: DINING_CATEGORY_ID },
    });

    // Act
    const clearOverrideRes = await app.inject({ method: 'PATCH', url: `/api/transactions/${transactionId}`, payload: { categoryOverrideId: null } });

    // Assert
    expect(clearOverrideRes.statusCode).toBe(200);
    const restoredTx = TransactionListItemSchema.parse(clearOverrideRes.json());
    expect(restoredTx.categoryOverrideId).toBeNull();
    expect(restoredTx.effectiveCategoryId).toBe(EDUCATION_CATEGORY_ID);
  });

  it('When updating free-text Notes and toggling Excluded Transaction flag, Then the values persist and excluded Ambiguous Merchant Transactions leave the inbox', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const { transactionId, merchantId } = await seedSingleTransaction(app, {
      rawMerchantName: `PAYBOX ${faker.string.alpha(5)}`,
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/merchants/${merchantId}`,
      payload: { isAmbiguous: true },
    });
    const customNote = `מתנה ליום הולדת ${faker.word.noun()}`;

    // Act
    const patchRes = await app.inject({ method: 'PATCH', url: `/api/transactions/${transactionId}`, payload: { notes: customNote, isExcluded: true } });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const updatedTx = TransactionListItemSchema.parse(patchRes.json());
    expect(updatedTx.notes).toBe(customNote);
    expect(updatedTx.isExcluded).toBe(true);

    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    expect(inbox.ambiguousTransactions).toHaveLength(0);
  });

  it('When PATCH /api/transactions/:id is called with a non-existent categoryOverrideId, Then it returns a 400 validation error matching ErrorResponseSchema', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const { transactionId } = await seedSingleTransaction(app);
    const invalidCategoryId = faker.string.uuid();

    // Act
    const response = await app.inject({ method: 'PATCH', url: `/api/transactions/${transactionId}`, payload: { categoryOverrideId: invalidCategoryId } });

    // Assert
    expect(response.statusCode).toBe(400);
    const errBody = ErrorResponseSchema.parse(response.json());
    expect(errBody.error.code).toBe('VALIDATION_ERROR');
  });
});
