import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type DatabaseConnection } from '@bills/db';
import {
  ErrorResponseSchema,
  InboxResponseSchema,
  MerchantSchema,
  MergeMerchantsResponseSchema,
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
const TELECOM_CATEGORY_ID = 'cat-fixed-telecom';

function randomBillingMonth(): BillingMonth {
  const year = faker.number.int({ min: 2023, max: 2027 });
  const month = faker.number.int({ min: 1, max: 12 });
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextBillingMonth(billingMonth: BillingMonth): BillingMonth {
  const [yearStr, monthStr] = billingMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function randomPurchaseDateInMonth(yearMonth: BillingMonth): string {
  const day = faker.number.int({ min: 1, max: 28 });
  return `${yearMonth}-${String(day).padStart(2, '0')}`;
}

async function commitTransactionsHelper(
  app: FastifyInstance,
  params: {
    cardLastFour: string;
    billingMonth: BillingMonth;
    items: ReadonlyArray<{
      purchaseDate: string;
      rawMerchantName: string;
      billedAmountIls: number;
    }>;
  },
): Promise<void> {
  await app.inject({
    method: 'POST',
    url: '/api/statements/commit',
    payload: {
      files: [
        {
          filename: `stmt_${params.cardLastFour}_${params.billingMonth}.xls`,
          cardLastFour: params.cardLastFour,
          billingMonth: params.billingMonth,
          provider: 'ISRACARD',
          newCardOnboarding: {
            cardholderId: DEFAULT_PRIMARY_CARDHOLDER_ID,
            nickname: `כרטיס ${faker.word.noun()}`,
          },
          transactions: params.items.map((item, idx) => ({
            purchaseDate: item.purchaseDate,
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
        },
      ],
    },
  });
}

describe('Merchant Normalization, Alias Rules, Merging & Uncategorized Inbox API', () => {
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

  it('When statements with PAYPAL * processor prefixes are committed, Then GET /api/inbox lists normalized uncategorized Merchants with sample transactions', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const billingMonth = randomBillingMonth();
    const expectedCanonicalMerchant = faker.company.name().toUpperCase();
    const rawProcessorMerchant = `PAYPAL *${expectedCanonicalMerchant}`;
    const firstAmount = faker.number.float({
      min: 30,
      max: 90,
      fractionDigits: 2,
    });
    const secondAmount = faker.number.float({
      min: 30,
      max: 90,
      fractionDigits: 2,
    });
    await commitTransactionsHelper(app, {
      cardLastFour,
      billingMonth,
      items: [
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: rawProcessorMerchant,
          billedAmountIls: firstAmount,
        },
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: rawProcessorMerchant,
          billedAmountIls: secondAmount,
        },
      ],
    });

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/inbox' });

    // Assert
    expect(response.statusCode).toBe(200);
    const inbox = InboxResponseSchema.parse(response.json());
    expect(inbox.totalInboxCount).toBe(1);
    expect(inbox.uncategorizedMerchants).toHaveLength(1);
    const item = inbox.uncategorizedMerchants[0]!;
    expect(item.merchant.canonicalName).toBe(expectedCanonicalMerchant);
    expect(item.transactionCount).toBe(2);
    expect(item.totalBilledIls).toBeCloseTo(firstAmount + secondAmount, 2);
    expect(item.sampleTransactions).toHaveLength(2);
  });

  it('When assigning a defaultCategoryId to an uncategorized Merchant, Then it disappears from GET /api/inbox and retroactively updates historical Transactions', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const billingMonth = randomBillingMonth();
    const telecomMerchantName = `פרטנר ${faker.company.name()}`;
    const billAmount = faker.number.float({
      min: 80,
      max: 250,
      fractionDigits: 2,
    });
    await commitTransactionsHelper(app, {
      cardLastFour,
      billingMonth,
      items: [
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: telecomMerchantName,
          billedAmountIls: billAmount,
        },
      ],
    });
    const initialInboxRes = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const initialInbox = InboxResponseSchema.parse(initialInboxRes.json());
    const merchantId = initialInbox.uncategorizedMerchants[0]!.merchant.id;

    // Act
    const patchRes = await app.inject({ method: 'PATCH', url: `/api/merchants/${merchantId}`, payload: { defaultCategoryId: TELECOM_CATEGORY_ID } });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const updatedMerchant = MerchantSchema.parse(patchRes.json());
    expect(updatedMerchant.defaultCategoryId).toBe(TELECOM_CATEGORY_ID);

    const afterInboxRes = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const afterInbox = InboxResponseSchema.parse(afterInboxRes.json());
    expect(afterInbox.uncategorizedMerchants).toHaveLength(0);

    const txRes = await app.inject({
      method: 'GET',
      url: `/api/transactions?billingMonth=${billingMonth}`,
    });
    const txList = TransactionsListResponseSchema.parse(txRes.json());
    expect(txList.transactions[0]?.effectiveCategoryId).toBe(
      TELECOM_CATEGORY_ID,
    );
  });

  it('When adding a CONTAINS Merchant Alias rule, Then future branch variations resolve to the canonical Merchant and inherit its default Category', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const firstMonth = randomBillingMonth();
    const secondMonth = nextBillingMonth(firstMonth);
    const chainKeyword = `שופרסל-${faker.string.alpha(4)}`;
    const firstAmount = faker.number.float({
      min: 100,
      max: 400,
      fractionDigits: 2,
    });
    const secondAmount = faker.number.float({
      min: 100,
      max: 400,
      fractionDigits: 2,
    });
    await commitTransactionsHelper(app, {
      cardLastFour,
      billingMonth: firstMonth,
      items: [
        {
          purchaseDate: randomPurchaseDateInMonth(firstMonth),
          rawMerchantName: `${chainKeyword} שלי`,
          billedAmountIls: firstAmount,
        },
      ],
    });
    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    const merchantId = inbox.uncategorizedMerchants[0]!.merchant.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/merchants/${merchantId}`,
      payload: {
        canonicalName: chainKeyword,
        defaultCategoryId: GROCERIES_CATEGORY_ID,
        addAlias: {
          pattern: chainKeyword,
          matchType: 'CONTAINS',
        },
      },
    });

    // Act
    await commitTransactionsHelper(app, { cardLastFour, billingMonth: secondMonth, items: [{ purchaseDate: randomPurchaseDateInMonth(secondMonth), rawMerchantName: `${chainKeyword} דיל סניף מרכז`, billedAmountIls: secondAmount }] });

    // Assert
    const afterInboxRes = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const afterInbox = InboxResponseSchema.parse(afterInboxRes.json());
    expect(afterInbox.uncategorizedMerchants).toHaveLength(0);

    const secondMonthTxRes = await app.inject({
      method: 'GET',
      url: `/api/transactions?billingMonth=${secondMonth}`,
    });
    const secondMonthTx = TransactionsListResponseSchema.parse(
      secondMonthTxRes.json(),
    );
    expect(secondMonthTx.transactions[0]).toMatchObject({
      merchantId,
      merchantName: chainKeyword,
      effectiveCategoryId: GROCERIES_CATEGORY_ID,
    });
  });

  it('When merging duplicate Merchants via POST /api/merchants/merge, Then all Transactions and Aliases consolidate under the target Merchant', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const billingMonth = randomBillingMonth();
    const branchOne = `מאפיית ${faker.company.name()} סניף א`;
    const branchTwo = `מאפיית ${faker.company.name()} סניף ב`;
    const amountOne = faker.number.float({
      min: 20,
      max: 80,
      fractionDigits: 2,
    });
    const amountTwo = faker.number.float({
      min: 20,
      max: 80,
      fractionDigits: 2,
    });
    await commitTransactionsHelper(app, {
      cardLastFour,
      billingMonth,
      items: [
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: branchOne,
          billedAmountIls: amountOne,
        },
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: branchTwo,
          billedAmountIls: amountTwo,
        },
      ],
    });
    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    const targetMerchantId = inbox.uncategorizedMerchants[0]!.merchant.id;
    const sourceMerchantId = inbox.uncategorizedMerchants[1]!.merchant.id;

    // Act
    const mergeRes = await app.inject({ method: 'POST', url: '/api/merchants/merge', payload: { targetMerchantId, sourceMerchantIds: [sourceMerchantId] } });

    // Assert
    expect(mergeRes.statusCode).toBe(200);
    const mergeBody = MergeMerchantsResponseSchema.parse(mergeRes.json());
    expect(mergeBody.reassignedTransactionsCount).toBe(1);
    expect(mergeBody.mergedMerchant.transactionCount).toBe(2);
    expect(mergeBody.mergedMerchant.totalBilledIls).toBeCloseTo(
      amountOne + amountTwo,
      2,
    );

    const afterInboxRes = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const afterInbox = InboxResponseSchema.parse(afterInboxRes.json());
    expect(afterInbox.uncategorizedMerchants).toHaveLength(1);
  });

  it('When flagging a Merchant as an Ambiguous Merchant, Then its Transactions do not inherit a default Category and surface in ambiguousTransactions', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const cardLastFour = faker.string.numeric(4);
    const billingMonth = randomBillingMonth();
    const ambiguousMerchantRaw = `BIT ${faker.string.alpha(4)}`;
    const transferAmount = faker.number.float({
      min: 50,
      max: 300,
      fractionDigits: 2,
    });
    await commitTransactionsHelper(app, {
      cardLastFour,
      billingMonth,
      items: [
        {
          purchaseDate: randomPurchaseDateInMonth(billingMonth),
          rawMerchantName: ambiguousMerchantRaw,
          billedAmountIls: transferAmount,
        },
      ],
    });
    const inboxRes = await app.inject({ method: 'GET', url: '/api/inbox' });
    const inbox = InboxResponseSchema.parse(inboxRes.json());
    const merchantId = inbox.uncategorizedMerchants[0]!.merchant.id;

    // Act
    const patchRes = await app.inject({ method: 'PATCH', url: `/api/merchants/${merchantId}`, payload: { defaultCategoryId: GROCERIES_CATEGORY_ID, isAmbiguous: true } });

    // Assert
    expect(patchRes.statusCode).toBe(200);
    const updatedMerchant = MerchantSchema.parse(patchRes.json());
    expect(updatedMerchant.isAmbiguous).toBe(true);

    const afterInboxRes = await app.inject({
      method: 'GET',
      url: '/api/inbox',
    });
    const afterInbox = InboxResponseSchema.parse(afterInboxRes.json());
    expect(afterInbox.uncategorizedMerchants).toHaveLength(0);
    expect(afterInbox.ambiguousTransactions).toHaveLength(1);
    expect(afterInbox.ambiguousTransactions[0]?.effectiveCategoryId).toBeNull();
  });

  it('When merging a Merchant into itself, Then POST /api/merchants/merge returns a 400 validation error matching ErrorResponseSchema', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const fakeMerchantId = faker.string.uuid();

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/merchants/merge', payload: { targetMerchantId: fakeMerchantId, sourceMerchantIds: [fakeMerchantId] } });

    // Assert
    expect(response.statusCode).toBe(400);
    const errBody = ErrorResponseSchema.parse(response.json());
    expect(errBody.error.code).toBe('VALIDATION_ERROR');
  });
});
