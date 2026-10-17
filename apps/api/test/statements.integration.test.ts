import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import * as XLSX from 'xlsx';
import type { FastifyInstance } from 'fastify';
import { createDatabase, type DatabaseConnection } from '@bills/db';
import {
  CoverageMatrixResponseSchema,
  ErrorResponseSchema,
  StatementCommitResponseSchema,
  StatementPreviewResponseSchema,
  TransactionsListResponseSchema,
  type BillingMonth,
} from '@bills/shared';
import { buildServer } from '../src/app.js';

interface TestContext {
  app: FastifyInstance;
  dbConn: DatabaseConnection;
}

const DEFAULT_PRIMARY_CARDHOLDER_ID = 'cardholder-primary';
const DEFAULT_SPOUSE_CARDHOLDER_ID = 'cardholder-spouse';

function buildIsracardHtmlXlsFixture(params: {
  lastFourDigits: string;
  billingDateDisplay: string;
  domesticMerchant: string;
  domesticAmountIls: number;
  installmentMerchant: string;
  installmentMonthlyIls: number;
  installmentDealTotalIls: number;
  installmentRemarks: string;
  refundMerchant: string;
  refundAmountIls: number;
  foreignMerchant: string;
  foreignOriginalUsd: number;
  foreignBilledIls: number;
}): string {
  const ignoredSummaryTotal = faker.number.float({
    min: 50000,
    max: 99999,
    fractionDigits: 2,
  });
  return `
    <html>
      <body>
        <table>
          <tr><td>פירוט עסקאות ישראכרט</td><td>כרטיס מס' ${params.lastFourDigits}</td></tr>
          <tr><td>תאריך חיוב: ${params.billingDateDisplay}</td><td></td></tr>
          <tr><td>עסקאות בארץ</td></tr>
          <tr>
            <th>תאריך עסקה</th>
            <th>שם בית עסק</th>
            <th>סכום עסקה</th>
            <th>סכום חיוב</th>
            <th>פירוט נוסף</th>
          </tr>
          <tr>
            <td>05/03/2026</td>
            <td>${params.domesticMerchant}</td>
            <td>${params.domesticAmountIls.toFixed(2)}</td>
            <td>${params.domesticAmountIls.toFixed(2)}</td>
            <td>עסקה רגילה</td>
          </tr>
          <tr>
            <td>05/03/2026</td>
            <td>${params.domesticMerchant}</td>
            <td>${params.domesticAmountIls.toFixed(2)}</td>
            <td>${params.domesticAmountIls.toFixed(2)}</td>
            <td>עסקה רגילה</td>
          </tr>
          <tr>
            <td>08/03/2026</td>
            <td>${params.installmentMerchant}</td>
            <td>${params.installmentDealTotalIls.toFixed(2)}</td>
            <td>${params.installmentMonthlyIls.toFixed(2)}</td>
            <td>${params.installmentRemarks}</td>
          </tr>
          <tr>
            <td>11/03/2026</td>
            <td>${params.refundMerchant}</td>
            <td>-${Math.abs(params.refundAmountIls).toFixed(2)}</td>
            <td>-${Math.abs(params.refundAmountIls).toFixed(2)}</td>
            <td>זיכוי</td>
          </tr>
          <tr>
            <td>סה"כ חיוב בש"ח</td>
            <td></td>
            <td></td>
            <td>${ignoredSummaryTotal.toFixed(2)}</td>
            <td></td>
          </tr>
          <tr><td>עסקאות בחו"ל / מט"ח</td></tr>
          <tr>
            <th>תאריך עסקה</th>
            <th>שם בית עסק</th>
            <th>סכום עסקה מקורי</th>
            <th>מטבע מקור</th>
            <th>סכום חיוב בש"ח</th>
            <th>פירוט נוסף</th>
          </tr>
          <tr>
            <td>14/03/2026</td>
            <td>${params.foreignMerchant}</td>
            <td>${params.foreignOriginalUsd.toFixed(2)}</td>
            <td>USD</td>
            <td>${params.foreignBilledIls.toFixed(2)}</td>
            <td>חיוב מט"ח</td>
          </tr>
          <tr>
            <td>סה"כ חיוב חו"ל</td>
            <td></td>
            <td></td>
            <td></td>
            <td>${params.foreignBilledIls.toFixed(2)}</td>
            <td></td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildAmexWorkbookBase64(params: {
  lastFourDigits: string;
  billingMonthDisplay: string;
  merchantName: string;
  amountIls: number;
}): string {
  const rows = [
    ['אמריקן אקספרס', `מספר כרטיס ${params.lastFourDigits}`],
    ['מועד חיוב', params.billingMonthDisplay],
    ['תאריך עסקה', 'שם בית עסק', 'סכום חיוב', 'פירוט נוסף'],
    ['19/03/2026', params.merchantName, params.amountIls.toFixed(2), ''],
    ['סה"כ לחיוב', '', params.amountIls.toFixed(2), ''],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
  return buffer.toString('base64');
}

describe('Batch Statement Ingestion, Card Onboarding & Coverage Matrix API', () => {
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

  it('When previewing an Isracard HTML .xls statement, Then it extracts header metadata, domestic and foreign tables, installments, refunds, and ignores summary rows', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const lastFourDigits = faker.string.numeric(4);
    const billingDateDisplay = '10/03/2026';
    const expectedBillingMonth: BillingMonth = '2026-03';
    const domesticMerchant = `שופרסל ${faker.company.name()}`;
    const domesticAmountIls = faker.number.float({
      min: 25,
      max: 190,
      fractionDigits: 2,
    });
    const installmentMerchant = `מחסני חשמל ${faker.company.name()}`;
    const installmentCurrent = 2;
    const installmentTotal = 6;
    const installmentMonthlyIls = faker.number.int({ min: 150, max: 400 });
    const installmentDealTotalIls = installmentMonthlyIls * installmentTotal;
    const refundMerchant = `זארה ${faker.company.name()}`;
    const refundAmountIls = faker.number.float({
      min: 30,
      max: 150,
      fractionDigits: 2,
    });
    const foreignMerchant = `PAYPAL *NETFLIX`;
    const foreignOriginalUsd = faker.number.float({
      min: 9,
      max: 29,
      fractionDigits: 2,
    });
    const foreignBilledIls = faker.number.float({
      min: 35,
      max: 110,
      fractionDigits: 2,
    });

    const htmlContent = buildIsracardHtmlXlsFixture({
      lastFourDigits,
      billingDateDisplay,
      domesticMerchant,
      domesticAmountIls,
      installmentMerchant,
      installmentMonthlyIls,
      installmentDealTotalIls,
      installmentRemarks: `תשלום ${installmentCurrent} מתוך ${installmentTotal}`,
      refundMerchant,
      refundAmountIls,
      foreignMerchant,
      foreignBilledIls,
      foreignOriginalUsd,
    });

    const expectedTotalIls =
      domesticAmountIls * 2 +
      installmentMonthlyIls -
      refundAmountIls +
      foreignBilledIls;

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/statements/preview', payload: { files: [{ filename: `isracard_${lastFourDigits}.xls`, contentText: htmlContent }] } });

    // Assert
    expect(response.statusCode).toBe(200);
    const preview = StatementPreviewResponseSchema.parse(response.json());
    expect(preview.files).toHaveLength(1);
    const fileItem = preview.files[0]!;
    expect(fileItem.detectedLastFour).toBe(lastFourDigits);
    expect(fileItem.detectedProvider).toBe('ISRACARD');
    expect(fileItem.detectedBillingMonth).toBe(expectedBillingMonth);
    expect(fileItem.existingCard).toBeNull();
    expect(fileItem.requiresColumnMapping).toBe(false);
    expect(fileItem.newTransactionsCount).toBe(5);
    expect(fileItem.duplicateTransactionsCount).toBe(0);
    expect(fileItem.totalBilledIls).toBeCloseTo(expectedTotalIls, 2);

    const installmentTx = fileItem.transactions.find(
      (tx) => tx.rawMerchantName === installmentMerchant,
    );
    expect(installmentTx).toMatchObject({
      billedAmountIls: installmentMonthlyIls,
      installmentCurrent,
      installmentTotal,
      installmentTotalAmountIls: installmentDealTotalIls,
    });

    const foreignTx = fileItem.transactions.find(
      (tx) => tx.rawMerchantName === foreignMerchant,
    );
    expect(foreignTx).toMatchObject({
      normalizedMerchantName: 'NETFLIX',
      billedAmountIls: foreignBilledIls,
      originalAmount: foreignOriginalUsd,
      originalCurrency: 'USD',
    });

    const refundTx = fileItem.transactions.find(
      (tx) => tx.rawMerchantName === refundMerchant,
    );
    expect(refundTx?.billedAmountIls).toBeCloseTo(-refundAmountIls, 2);
  });

  it('When committing a batch with an unrecognized card and re-uploading the same statement, Then it onboards the card once, preserves same-day identical purchases, and skips all duplicates on re-upload', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const lastFourDigits = faker.string.numeric(4);
    const cardNickname = `ישראכרט ${faker.word.noun()}`;
    const coffeeShop = `קפה ${faker.company.name()}`;
    const coffeePrice = faker.number.float({
      min: 12,
      max: 28,
      fractionDigits: 2,
    });
    const installmentMonthly = faker.number.int({ min: 200, max: 500 });
    const htmlContent = buildIsracardHtmlXlsFixture({
      lastFourDigits,
      billingDateDisplay: '10/03/2026',
      domesticMerchant: coffeeShop,
      domesticAmountIls: coffeePrice,
      installmentMerchant: `רהיטים ${faker.company.name()}`,
      installmentMonthlyIls: installmentMonthly,
      installmentDealTotalIls: installmentMonthly * 3,
      installmentRemarks: 'תשלום 1 מתוך 3',
      refundMerchant: `ביגוד ${faker.company.name()}`,
      refundAmountIls: faker.number.float({
        min: 20,
        max: 90,
        fractionDigits: 2,
      }),
      foreignMerchant: 'GOOGLE *YouTube',
      foreignOriginalUsd: faker.number.float({
        min: 8,
        max: 19,
        fractionDigits: 2,
      }),
      foreignBilledIls: faker.number.float({
        min: 30,
        max: 70,
        fractionDigits: 2,
      }),
    });
    const firstPreviewRes = await app.inject({
      method: 'POST',
      url: '/api/statements/preview',
      payload: {
        files: [{ filename: 'march.xls', contentText: htmlContent }],
      },
    });
    const firstPreview = StatementPreviewResponseSchema.parse(
      firstPreviewRes.json(),
    );
    const previewFile = firstPreview.files[0]!;
    const commitRes = await app.inject({
      method: 'POST',
      url: '/api/statements/commit',
      payload: {
        files: [
          {
            filename: previewFile.filename,
            cardLastFour: lastFourDigits,
            billingMonth: '2026-03',
            provider: 'ISRACARD',
            newCardOnboarding: {
              cardholderId: DEFAULT_PRIMARY_CARDHOLDER_ID,
              nickname: cardNickname,
            },
            transactions: previewFile.transactions,
          },
        ],
      },
    });
    const secondPreviewRes = await app.inject({
      method: 'POST',
      url: '/api/statements/preview',
      payload: {
        files: [{ filename: 'march_reupload.xls', contentText: htmlContent }],
      },
    });

    // Act
    const secondCommitRes = await app.inject({ method: 'POST', url: '/api/statements/commit', payload: { files: [{ filename: 'march_reupload.xls', cardLastFour: lastFourDigits, billingMonth: '2026-03', provider: 'ISRACARD', transactions: previewFile.transactions }] } });

    // Assert
    expect(commitRes.statusCode).toBe(201);
    const firstCommitBody = StatementCommitResponseSchema.parse(
      commitRes.json(),
    );
    expect(firstCommitBody).toMatchObject({
      importedStatementsCount: 1,
      newCardsCount: 1,
      newTransactionsCount: 5,
      skippedDuplicatesCount: 0,
    });

    const secondPreview = StatementPreviewResponseSchema.parse(
      secondPreviewRes.json(),
    );
    expect(secondPreview.files[0]?.existingCard?.nickname).toBe(cardNickname);
    expect(secondPreview.files[0]?.newTransactionsCount).toBe(0);
    expect(secondPreview.files[0]?.duplicateTransactionsCount).toBe(5);

    expect(secondCommitRes.statusCode).toBe(201);
    const secondCommitBody = StatementCommitResponseSchema.parse(
      secondCommitRes.json(),
    );
    expect(secondCommitBody).toMatchObject({
      newCardsCount: 0,
      newTransactionsCount: 0,
      skippedDuplicatesCount: 5,
    });

    const txListRes = await app.inject({
      method: 'GET',
      url: `/api/transactions?billingMonth=2026-03`,
    });
    const txList = TransactionsListResponseSchema.parse(txListRes.json());
    const coffeeTransactions = txList.transactions.filter(
      (tx) => tx.rawMerchantName === coffeeShop,
    );
    expect(coffeeTransactions).toHaveLength(2);
  });

  it('When uploading a binary .xlsx Amex statement and querying the Statement Coverage matrix, Then it shows covered and missing card-month cells accurately', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const amexLastFour = faker.string.numeric(4);
    const missingCardLastFour = faker.string.numeric(4);
    const amexMerchant = `מסעדה ${faker.company.name()}`;
    const amexAmount = faker.number.float({
      min: 150,
      max: 850,
      fractionDigits: 2,
    });
    await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: {
        cardholderId: DEFAULT_SPOUSE_CARDHOLDER_ID,
        lastFourDigits: missingCardLastFour,
        provider: 'ISRACARD',
        nickname: `כרטיס אשתי ${faker.word.noun()}`,
      },
    });
    const xlsxBase64 = buildAmexWorkbookBase64({
      lastFourDigits: amexLastFour,
      billingMonthDisplay: '15/03/2026',
      merchantName: amexMerchant,
      amountIls: amexAmount,
    });
    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/statements/preview',
      payload: {
        files: [
          {
            filename: `amex_${amexLastFour}.xlsx`,
            contentBase64: xlsxBase64,
          },
        ],
      },
    });
    const preview = StatementPreviewResponseSchema.parse(previewRes.json());
    const fileItem = preview.files[0]!;
    await app.inject({
      method: 'POST',
      url: '/api/statements/commit',
      payload: {
        files: [
          {
            filename: fileItem.filename,
            cardLastFour: amexLastFour,
            billingMonth: '2026-03',
            provider: fileItem.detectedProvider,
            newCardOnboarding: {
              cardholderId: DEFAULT_PRIMARY_CARDHOLDER_ID,
              nickname: `אמקס ${faker.word.noun()}`,
            },
            transactions: fileItem.transactions,
          },
        ],
      },
    });

    // Act
    const coverageRes = await app.inject({ method: 'GET', url: '/api/coverage' });

    // Assert
    expect(coverageRes.statusCode).toBe(200);
    const coverage = CoverageMatrixResponseSchema.parse(coverageRes.json());
    expect(coverage.billingMonths).toContain('2026-03');
    expect(coverage.cards).toHaveLength(2);
    expect(coverage.cards[0]?.card.cardholderId).toBe(
      DEFAULT_PRIMARY_CARDHOLDER_ID,
    );
    expect(coverage.cards[1]?.card.cardholderId).toBe(
      DEFAULT_SPOUSE_CARDHOLDER_ID,
    );

    const amexRow = coverage.cards.find(
      (r) => r.card.lastFourDigits === amexLastFour,
    );
    expect(amexRow?.card.provider).toBe('AMEX');
    expect(amexRow?.cells['2026-03']).toMatchObject({
      hasStatement: true,
      totalBilledIls: amexAmount,
      transactionsCount: 1,
    });

    const spouseRow = coverage.cards.find(
      (r) => r.card.lastFourDigits === missingCardLastFour,
    );
    expect(spouseRow?.cells['2026-03']).toMatchObject({
      hasStatement: false,
      statementId: null,
      totalBilledIls: 0,
      transactionsCount: 0,
    });
  });

  it('When a CSV file has unrecognized column headers, Then preview requests fallback column mapping and succeeds once columnMapping is supplied', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const lastFourDigits = faker.string.numeric(4);
    const customMerchant = `חנות ${faker.company.name()}`;
    const customAmount = faker.number.float({
      min: 50,
      max: 499,
      fractionDigits: 2,
    });
    const csvContent = [
      `כרטיס מס' ${lastFourDigits},חודש חיוב 04/2026,`,
      'WhenBought,VendorTitle,ChargeShekels',
      `12/04/2026,"${customMerchant.replace(/"/g, '""')}",${customAmount.toFixed(2)}`,
    ].join('\n');
    const unmappedRes = await app.inject({
      method: 'POST',
      url: '/api/statements/preview',
      payload: {
        files: [{ filename: 'custom.csv', contentText: csvContent }],
      },
    });

    // Act
    const mappedRes = await app.inject({ method: 'POST', url: '/api/statements/preview', payload: { files: [{ filename: 'custom.csv', contentText: csvContent, columnMapping: { purchaseDateIndex: 0, rawMerchantNameIndex: 1, billedAmountIlsIndex: 2 } }] } });

    // Assert
    expect(unmappedRes.statusCode).toBe(200);
    const unmappedBody = StatementPreviewResponseSchema.parse(
      unmappedRes.json(),
    );
    expect(unmappedBody.files[0]?.requiresColumnMapping).toBe(true);
    expect(unmappedBody.files[0]?.availableHeaders).toEqual([
      'WhenBought',
      'VendorTitle',
      'ChargeShekels',
    ]);

    expect(mappedRes.statusCode).toBe(200);
    const mappedBody = StatementPreviewResponseSchema.parse(mappedRes.json());
    expect(mappedBody.files[0]?.requiresColumnMapping).toBe(false);
    expect(mappedBody.files[0]?.newTransactionsCount).toBe(1);
    expect(mappedBody.files[0]?.totalBilledIls).toBeCloseTo(customAmount, 2);
  });

  it('When uploading via multipart/form-data to preview, Then it parses the uploaded file stream accurately', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const lastFourDigits = faker.string.numeric(4);
    const merchantName = `סופר פארם ${faker.company.name()}`;
    const amountIls = faker.number.float({
      min: 40,
      max: 350,
      fractionDigits: 2,
    });
    const boundary = `----BillsBoundary${faker.string.alphanumeric(8)}`;
    const csvText = [
      `ישראכרט כרטיס ${lastFourDigits},תאריך חיוב 10/05/2026,`,
      'תאריך עסקה,שם בית עסק,סכום חיוב',
      `03/05/2026,"${merchantName.replace(/"/g, '""')}",${amountIls.toFixed(2)}`,
    ].join('\r\n');
    const multipartPayload = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="may_${lastFourDigits}.csv"`,
      'Content-Type: text/csv',
      '',
      csvText,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/statements/preview', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: multipartPayload });

    // Assert
    expect(response.statusCode).toBe(200);
    const body = StatementPreviewResponseSchema.parse(response.json());
    expect(body.files[0]?.detectedLastFour).toBe(lastFourDigits);
    expect(body.files[0]?.detectedBillingMonth).toBe('2026-05');
    expect(body.files[0]?.newTransactionsCount).toBe(1);
    expect(body.files[0]?.totalBilledIls).toBeCloseTo(amountIls, 2);
  });

  it('When committing an unrecognized card without newCardOnboarding, Then it returns a 400 validation error matching ErrorResponseSchema', async () => {
    // Arrange
    const { app } = await setupTestServer();
    const unknownCardLastFour = faker.string.numeric(4);

    // Act
    const response = await app.inject({ method: 'POST', url: '/api/statements/commit', payload: { files: [{ filename: 'unknown.xls', cardLastFour: unknownCardLastFour, billingMonth: '2026-03', provider: 'ISRACARD', transactions: [] }] } });

    // Assert
    expect(response.statusCode).toBe(400);
    const errorBody = ErrorResponseSchema.parse(response.json());
    expect(errorBody.error.code).toBe('VALIDATION_ERROR');
  });
});
