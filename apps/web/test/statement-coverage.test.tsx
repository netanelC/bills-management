import { beforeEach, describe, expect, it, vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  CardDto,
  CardholderDto,
  CoverageMatrixResponseDto,
  StatementPreviewResponseDto,
  TransactionListItemDto,
} from '@bills/shared';
import { StatementCoverage } from '../src/components/StatementCoverage.js';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildTestScenario() {
  const primaryHolder: CardholderDto = {
    id: faker.string.uuid(),
    name: 'אני',
    createdAt: faker.date.recent().toISOString(),
  };
  const spouseHolder: CardholderDto = {
    id: faker.string.uuid(),
    name: 'אשתי',
    createdAt: faker.date.recent().toISOString(),
  };

  const existingCard: CardDto = {
    id: faker.string.uuid(),
    cardholderId: primaryHolder.id,
    lastFourDigits: faker.string.numeric(4),
    provider: 'ISRACARD',
    nickname: `כרטיס ראשי ${faker.word.noun()}`,
    createdAt: faker.date.recent().toISOString(),
  };

  const missingCard: CardDto = {
    id: faker.string.uuid(),
    cardholderId: spouseHolder.id,
    lastFourDigits: faker.string.numeric(4),
    provider: 'AMEX',
    nickname: `אמקס אשתי ${faker.word.noun()}`,
    createdAt: faker.date.recent().toISOString(),
  };

  const billingMonth = '2026-03' as const;
  const coveredAmount = faker.number.float({
    min: 500,
    max: 4500,
    fractionDigits: 2,
  });

  const coverage: CoverageMatrixResponseDto = {
    billingMonths: [billingMonth],
    cards: [
      {
        card: existingCard,
        cardholderName: primaryHolder.name,
        cells: {
          [billingMonth]: {
            hasStatement: true,
            statementId: faker.string.uuid(),
            totalBilledIls: coveredAmount,
            transactionsCount: faker.number.int({ min: 2, max: 15 }),
          },
        },
      },
      {
        card: missingCard,
        cardholderName: spouseHolder.name,
        cells: {
          [billingMonth]: {
            hasStatement: false,
            statementId: null,
            totalBilledIls: 0,
            transactionsCount: 0,
          },
        },
      },
    ],
  };

  const sampleMonthlyInstallment = faker.number.float({
    min: 100,
    max: 600,
    fractionDigits: 2,
  });
  const sampleInstallmentTotal = 3;
  const sampleDate = faker.date
    .between({ from: '2026-03-01T00:00:00.000Z', to: '2026-03-28T00:00:00.000Z' })
    .toISOString()
    .slice(0, 10);

  const sampleTx: TransactionListItemDto = {
    id: faker.string.uuid(),
    statementId: faker.string.uuid(),
    cardId: existingCard.id,
    cardLastFourDigits: existingCard.lastFourDigits,
    cardNickname: existingCard.nickname,
    cardProvider: existingCard.provider,
    cardholderId: primaryHolder.id,
    cardholderName: primaryHolder.name,
    merchantId: faker.string.uuid(),
    merchantName: `שופרסל ${faker.company.name()}`,
    billingMonth,
    purchaseDate: sampleDate,
    rawMerchantName: `שופרסל ${faker.company.name()}`,
    billedAmountIls: sampleMonthlyInstallment,
    originalAmount: sampleMonthlyInstallment * sampleInstallmentTotal,
    originalCurrency: 'ILS',
    installmentCurrent: 2,
    installmentTotal: sampleInstallmentTotal,
    installmentTotalAmountIls:
      sampleMonthlyInstallment * sampleInstallmentTotal,
    categoryOverrideId: null,
    effectiveCategoryId: null,
    effectiveCategoryName: null,
    notes: null,
    isExcluded: false,
  };

  const newCardLastFour = faker.string.numeric(4);
  const previewBilledIls = faker.number.float({
    min: 40,
    max: 250,
    fractionDigits: 2,
  });
  const previewOriginalUsd = faker.number.float({
    min: 10,
    max: 50,
    fractionDigits: 2,
  });

  const previewResponse: StatementPreviewResponseDto = {
    files: [
      {
        filename: `statement_${newCardLastFour}.xls`,
        detectedLastFour: newCardLastFour,
        detectedProvider: 'ISRACARD',
        existingCard: null,
        detectedBillingMonth: billingMonth,
        requiresColumnMapping: false,
        availableHeaders: [],
        sampleRows: [],
        newTransactionsCount: 2,
        duplicateTransactionsCount: 1,
        totalBilledIls: previewBilledIls,
        transactions: [
          {
            purchaseDate: sampleDate,
            rawMerchantName: 'NETFLIX',
            normalizedMerchantName: 'NETFLIX',
            billedAmountIls: previewBilledIls,
            originalAmount: previewOriginalUsd,
            originalCurrency: 'USD',
            installmentCurrent: null,
            installmentTotal: null,
            installmentTotalAmountIls: null,
            occurrenceIndexWithinStatement: 0,
            dedupFingerprint: faker.string.alphanumeric(24),
            isDuplicate: false,
          },
        ],
      },
    ],
  };

  return {
    cardholders: [primaryHolder, spouseHolder],
    existingCard,
    missingCard,
    billingMonth,
    coveredAmount,
    coverage,
    transactions: [sampleTx],
    newCardLastFour,
    previewResponse,
  };
}

describe('StatementCoverage Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('When StatementCoverage renders, Then it displays the Card x Billing Month coverage matrix grouped by Cardholder and imported transactions with Installment Info', async () => {
    // Arrange
    const scenario = buildTestScenario();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/cardholders') {
        return createJsonResponse({ cardholders: scenario.cardholders });
      }
      if (url === '/api/categories') {
        return createJsonResponse({ categories: [] });
      }
      if (url === '/api/coverage') {
        return createJsonResponse(scenario.coverage);
      }
      if (url.startsWith('/api/transactions')) {
        return createJsonResponse({ transactions: scenario.transactions });
      }
      return createJsonResponse({});
    });

    // Act
    render(<StatementCoverage />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByTestId(
          `coverage-cell-${scenario.existingCard.id}-${scenario.billingMonth}`,
        ),
      ).toHaveTextContent('הועלה');
    });
    expect(
      screen.getByTestId(
        `coverage-cell-${scenario.missingCard.id}-${scenario.billingMonth}`,
      ),
    ).toHaveTextContent('חסר דוח');
    expect(screen.getByTestId('coverage-matrix-table')).toHaveTextContent(
      'מחזיק כרטיס: אני',
    );
    expect(screen.getByTestId('coverage-matrix-table')).toHaveTextContent(
      'מחזיק כרטיס: אשתי',
    );
    expect(screen.getByTestId('transactions-table')).toHaveTextContent(
      'תשלום 2 מתוך 3',
    );
  });

  it('When uploading a statement with an unrecognized 4-digit card, Then it prompts for Card onboarding and commits the batch', async () => {
    // Arrange
    const scenario = buildTestScenario();
    const onboardedNickname = `כרטיס חדש ${faker.word.noun()}`;
    let committedPayload: unknown = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/cardholders') {
        return createJsonResponse({ cardholders: scenario.cardholders });
      }
      if (url === '/api/categories') {
        return createJsonResponse({ categories: [] });
      }
      if (url === '/api/coverage') {
        return createJsonResponse(scenario.coverage);
      }
      if (url.startsWith('/api/transactions')) {
        return createJsonResponse({ transactions: scenario.transactions });
      }
      if (url === '/api/statements/preview' && method === 'POST') {
        return createJsonResponse(scenario.previewResponse);
      }
      if (url === '/api/statements/commit' && method === 'POST') {
        committedPayload = JSON.parse(String(init?.body));
        return createJsonResponse(
          {
            importedStatementsCount: 1,
            newCardsCount: 1,
            newTransactionsCount: 2,
            skippedDuplicatesCount: 1,
            cards: [scenario.existingCard],
          },
          201,
        );
      }
      return createJsonResponse({});
    });
    render(<StatementCoverage />);
    await waitFor(() => {
      expect(screen.getByLabelText('בחירת קבצי דוחות')).toBeInTheDocument();
    });
    const fileInput = screen.getByLabelText('בחירת קבצי דוחות');
    const mockFile = new File(
      ['<html></html>'],
      `stmt_${scenario.newCardLastFour}.xls`,
      {
        type: 'application/vnd.ms-excel',
      },
    );
    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    await waitFor(() => {
      expect(
        screen.getByLabelText(`כינוי כרטיס עבור ${scenario.newCardLastFour}`),
      ).toBeInTheDocument();
    });
    fireEvent.change(
      screen.getByLabelText(`כינוי כרטיס עבור ${scenario.newCardLastFour}`),
      { target: { value: onboardedNickname } },
    );

    // Act
    fireEvent.click(
      screen.getByRole('button', { name: 'אישור וייבוא דוחות' }),
    );

    // Assert
    await waitFor(() => {
      expect(committedPayload).toMatchObject({
        files: [
          {
            cardLastFour: scenario.newCardLastFour,
            newCardOnboarding: {
              nickname: onboardedNickname,
            },
          },
        ],
      });
    });
  });

  it('When toggling Excluded Transaction on a row in the Transaction table, Then it sends PATCH /api/transactions/:id', async () => {
    // Arrange
    const scenario = buildTestScenario();
    const targetTx = scenario.transactions[0]!;
    let patchedTxBody: unknown = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      if (url === '/api/cardholders') {
        return createJsonResponse({ cardholders: scenario.cardholders });
      }
      if (url === '/api/categories') {
        return createJsonResponse({ categories: [] });
      }
      if (url === '/api/coverage') {
        return createJsonResponse(scenario.coverage);
      }
      if (url.startsWith('/api/transactions') && method === 'GET') {
        return createJsonResponse({ transactions: scenario.transactions });
      }
      if (url === `/api/transactions/${targetTx.id}` && method === 'PATCH') {
        patchedTxBody = JSON.parse(String(init?.body));
        return createJsonResponse({ ...targetTx, isExcluded: true });
      }
      return createJsonResponse({});
    });

    render(<StatementCoverage />);
    const excludeCheckbox = await screen.findByLabelText(
      `החרג עסקה ${targetTx.rawMerchantName} (${targetTx.purchaseDate})`,
    );

    // Act
    fireEvent.click(excludeCheckbox);

    // Assert
    await waitFor(() => {
      expect(patchedTxBody).toEqual({ isExcluded: true });
    });
  });
});
