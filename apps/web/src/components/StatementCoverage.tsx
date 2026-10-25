import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CardholderSchema,
  CategorySchema,
  CoverageMatrixResponseSchema,
  StatementCommitResponseSchema,
  StatementPreviewResponseSchema,
  TransactionsListResponseSchema,
  type BillingMonth,
  type CardCoverageRowDto,
  type CardholderDto,
  type CategoryDto,
  type ColumnMappingOverrideDto,
  type CoverageMatrixResponseDto,
  type StatementPreviewFileItemDto,
  type TransactionListItemDto,
  type UpdateTransactionInput,
} from '@bills/shared';
import {
  buildDefaultCardNickname,
  StatementBatchPreviewSection,
  type CardOnboardingDraft,
} from './statements/StatementBatchPreviewSection.js';
import {
  requestTransactionUpdate,
  TransactionInlineControls,
} from './TransactionInlineControls.js';

interface UploadedFileBuffer {
  filename: string;
  contentBase64: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function readFileAsBase64(file: File): Promise<string> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then(arrayBufferToBase64);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(arrayBufferToBase64(reader.result));
      } else {
        resolve('');
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export function StatementCoverage(): React.ReactElement {
  const [cardholders, setCardholders] = useState<CardholderDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [coverage, setCoverage] = useState<CoverageMatrixResponseDto | null>(
    null,
  );
  const [transactions, setTransactions] = useState<TransactionListItemDto[]>(
    [],
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [rawFiles, setRawFiles] = useState<UploadedFileBuffer[]>([]);
  const [previewFiles, setPreviewFiles] = useState<
    StatementPreviewFileItemDto[]
  >([]);
  const [onboardingByLastFour, setOnboardingByLastFour] = useState<
    Record<string, CardOnboardingDraft>
  >({});
  const [columnMappingsByFile, setColumnMappingsByFile] = useState<
    Record<string, ColumnMappingOverrideDto>
  >({});
  const [manualLastFourByFile, setManualLastFourByFile] = useState<
    Record<string, string>
  >({});
  const [manualMonthByFile, setManualMonthByFile] = useState<
    Record<string, string>
  >({});

  const loadCoverageAndTransactions = useCallback(
    async (monthFilter: string, cardFilter: string): Promise<void> => {
      try {
        setLoading(true);
        const query = new URLSearchParams();
        if (monthFilter) query.set('billingMonth', monthFilter);
        if (cardFilter) query.set('cardId', cardFilter);
        const txUrl = query.toString()
          ? `/api/transactions?${query.toString()}`
          : '/api/transactions';

        const [chRes, catRes, covRes, txRes] = await Promise.all([
          fetch('/api/cardholders'),
          fetch('/api/categories'),
          fetch('/api/coverage'),
          fetch(txUrl),
        ]);

        if (!chRes.ok || !catRes.ok || !covRes.ok || !txRes.ok) {
          throw new Error('Failed to load statement coverage data');
        }

        const rawCh = (await chRes.json()) as { cardholders?: unknown };
        const parsedCardholders = CardholderSchema.array().parse(
          rawCh.cardholders ?? [],
        );
        const rawCats = (await catRes.json()) as { categories?: unknown };
        const parsedCategories = CategorySchema.array().parse(
          rawCats.categories ?? [],
        );
        const covData = CoverageMatrixResponseSchema.parse(await covRes.json());
        const txData = TransactionsListResponseSchema.parse(await txRes.json());

        setCardholders(parsedCardholders);
        setCategories(parsedCategories);
        setCoverage(covData);
        setTransactions(txData.transactions);
        setErrorMessage(null);
      } catch {
        setErrorMessage('שגיאה בטעינת נתוני כיסוי דפי פירוט ועסקאות');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadCoverageAndTransactions(selectedMonth, selectedCardId);
  }, [loadCoverageAndTransactions, selectedMonth, selectedCardId]);

  async function runPreviewRequest(
    filesToPreview: UploadedFileBuffer[],
    mappingsOverride: Record<string, ColumnMappingOverrideDto>,
  ): Promise<void> {
    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const payloadFiles = filesToPreview.map((f) => ({
        filename: f.filename,
        contentBase64: f.contentBase64,
        columnMapping: mappingsOverride[f.filename],
      }));

      const res = await fetch('/api/statements/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const parsed = StatementPreviewResponseSchema.parse(await res.json());
      setPreviewFiles(parsed.files);

      const defaultCardholderId = cardholders[0]?.id ?? 'cardholder-primary';
      const knownCards = coverage?.cards.map((c) => c.card) ?? [];
      const nextOnboarding: Record<string, CardOnboardingDraft> = {
        ...onboardingByLastFour,
      };

      for (const file of parsed.files) {
        const lastFour = file.detectedLastFour;
        const alreadyExists =
          file.existingCard ||
          (lastFour && knownCards.some((c) => c.lastFourDigits === lastFour));
        if (!alreadyExists && lastFour) {
          if (!nextOnboarding[lastFour]) {
            nextOnboarding[lastFour] = {
              cardholderId: defaultCardholderId,
              nickname: buildDefaultCardNickname(
                file.detectedProvider,
                lastFour,
              ),
              provider: file.detectedProvider,
            };
          }
        }
      }
      setOnboardingByLastFour(nextOnboarding);
    } catch {
      setErrorMessage('שגיאה בפענוח קובצי דפי הפירוט לתצוגה מקדימה');
    }
  }

  async function processSelectedFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const uploaded: UploadedFileBuffer[] = [];
    for (const f of files) {
      const contentBase64 = await readFileAsBase64(f);
      uploaded.push({
        filename: f.name,
        contentBase64,
      });
    }

    setRawFiles(uploaded);
    await runPreviewRequest(uploaded, columnMappingsByFile);
  }

  async function handleFileSelect(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) {
      return;
    }
    await processSelectedFiles(Array.from(fileList));
  }

  async function handleDrop(
    event: React.DragEvent<HTMLElement>,
  ): Promise<void> {
    event.preventDefault();
    setIsDragging(false);
    const fileList = event.dataTransfer?.files;
    if (!fileList || fileList.length === 0) {
      return;
    }
    await processSelectedFiles(Array.from(fileList));
  }

  async function handleApplyColumnMapping(filename: string): Promise<void> {
    await runPreviewRequest(rawFiles, columnMappingsByFile);
    setStatusMessage(`מיפוי העמודות הוחל עבור ${filename}`);
  }


  const groupedCoverageRows = useMemo(() => {
    if (!coverage) return [];
    const groups = new Map<string, CardCoverageRowDto[]>();
    for (const row of coverage.cards) {
      const holderName = row.cardholderName || 'ללא שיוך';
      const list = groups.get(holderName) ?? [];
      list.push(row);
      groups.set(holderName, list);
    }
    return Array.from(groups.entries()).map(([cardholderName, rows]) => ({
      cardholderName,
      rows,
    }));
  }, [coverage]);

  async function handleCommitBatch(): Promise<void> {
    try {
      setErrorMessage(null);
      const defaultCardholderId = cardholders[0]?.id ?? 'cardholder-primary';
      const knownCards = coverage?.cards.map((c) => c.card) ?? [];

      const commitFiles = previewFiles.map((file) => {
        const cardLastFour = (
          file.detectedLastFour ??
          manualLastFourByFile[file.filename] ??
          '0000'
        ).trim();
        const billingMonth = (file.detectedBillingMonth ??
          manualMonthByFile[file.filename] ??
          '2026-01') as BillingMonth;

        const resolvedExistingCard =
          file.existingCard ??
          knownCards.find((c) => c.lastFourDigits === cardLastFour);

        const draft = onboardingByLastFour[cardLastFour];
        const newCardOnboarding = !resolvedExistingCard
          ? {
              cardholderId: draft?.cardholderId ?? defaultCardholderId,
              nickname:
                draft?.nickname.trim() ||
                buildDefaultCardNickname(file.detectedProvider, cardLastFour),
              provider: draft?.provider ?? file.detectedProvider,
            }
          : undefined;

        return {
          filename: file.filename,
          cardLastFour,
          billingMonth,
          provider: file.detectedProvider,
          newCardOnboarding,
          transactions: file.transactions,
        };
      });

      const res = await fetch('/api/statements/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: commitFiles }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const commitResult = StatementCommitResponseSchema.parse(
        await res.json(),
      );
      setStatusMessage(
        `יובאו בהצלחה ${commitResult.newTransactionsCount} עסקאות חדשות (${commitResult.skippedDuplicatesCount} כפילויות דולגו)`,
      );
      setPreviewFiles([]);
      setRawFiles([]);
      await loadCoverageAndTransactions(selectedMonth, selectedCardId);
    } catch {
      setErrorMessage('שגיאה בשמירת דפי הפירוט במסד הנתונים');
    }
  }

  async function handleUpdateTransaction(
    transactionId: string,
    payload: UpdateTransactionInput,
  ): Promise<void> {
    try {
      setErrorMessage(null);
      await requestTransactionUpdate(transactionId, payload);
      setStatusMessage('פרטי העסקה עודכנו בהצלחה');
      await loadCoverageAndTransactions(selectedMonth, selectedCardId);
    } catch {
      setErrorMessage('שגיאה בעדכון העסקה');
    }
  }

  if (loading && !coverage) {
    return (
      <div className="py-6 text-sm text-slate-500">
        טוען מטריצת כיסוי דפי פירוט ועסקאות...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
            🟣 שלב 2
          </span>
          <h2 className="text-lg font-semibold text-slate-900">
            קליטת דפי פירוט וכיסוי
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            חודשי חיוב במערכת: <strong className="text-slate-900">{coverage?.billingMonths.length ?? 0}</strong>
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            כרטיסים במעקב: <strong className="text-slate-900">{coverage?.cards.length ?? 0}</strong>
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            עסקאות שנטענו: <strong className="text-slate-900">{transactions.length}</strong>
          </span>
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {statusMessage}
        </div>
      ) : null}

      {/* Batch Upload Section (Drag and Drop + File Picker) */}
      <section
        data-testid="statement-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => void handleDrop(e)}
        className={`rounded-lg border border-dashed p-6 transition-colors ${
          isDragging
            ? 'border-indigo-600 bg-indigo-100/60'
            : 'border-indigo-300 bg-indigo-50/40'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              העלאת קובצי דפי פירוט (Batch Upload — גרירה או בחירת קבצים)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              גרור לכאן או בחר קובץ אחד או יותר של ישראכרט / אמריקן אקספרס.
              המערכת תזהה אוטומטית 4 ספרות אחרונות, חודש חיוב, עסקאות בארץ
              ובחו&quot;ל ותשלומים.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-700">
            בחירת קובצי דפי פירוט
            <input
              type="file"
              multiple
              accept=".xls,.xlsx,.csv"
              aria-label="בחירת קבצי דפי פירוט"
              onChange={(e) => void handleFileSelect(e)}
              className="sr-only"
            />
          </label>
        </div>

        {previewFiles.length > 0 ? (
          <StatementBatchPreviewSection
            previewFiles={previewFiles}
            cards={coverage?.cards.map((c) => c.card) ?? []}
            cardholders={cardholders}
            onboardingByLastFour={onboardingByLastFour}
            manualLastFourByFile={manualLastFourByFile}
            manualMonthByFile={manualMonthByFile}
            columnMappingsByFile={columnMappingsByFile}
            onUpdateOnboarding={(lastFour, updater) =>
              setOnboardingByLastFour((prev) => ({
                ...prev,
                [lastFour]: updater(prev[lastFour]),
              }))
            }
            onUpdateManualLastFour={(filename, val) =>
              setManualLastFourByFile((prev) => ({
                ...prev,
                [filename]: val,
              }))
            }
            onUpdateManualMonth={(filename, val) =>
              setManualMonthByFile((prev) => ({
                ...prev,
                [filename]: val,
              }))
            }
            onUpdateColumnMapping={(filename, mapping) =>
              setColumnMappingsByFile((prev) => ({
                ...prev,
                [filename]: mapping,
              }))
            }
            onApplyColumnMapping={(filename) => void handleApplyColumnMapping(filename)}
            onCancel={() => {
              setPreviewFiles([]);
              setRawFiles([]);
            }}
            onCommit={() => void handleCommitBatch()}
          />
        ) : null}
      </section>

      {/* Statement Coverage Matrix Grouped by Cardholder */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">
          מטריצת כיסוי כרטיסים לפי חודש חיוב (Card × Billing Month)
        </h3>

        {coverage && coverage.cards.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table
              data-testid="coverage-matrix-table"
              className="min-w-full divide-y divide-slate-200 text-right text-sm"
            >
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    כרטיס אשראי
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    מחזיק כרטיס
                  </th>
                  {coverage.billingMonths.map((month) => (
                    <th
                      key={month}
                      className="px-4 py-3 font-semibold text-slate-700"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMonth((prev) =>
                            prev === month ? '' : month,
                          )
                        }
                        className="hover:text-indigo-600"
                      >
                        {month}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {groupedCoverageRows.map((group) => (
                  <React.Fragment key={group.cardholderName}>
                    <tr className="bg-slate-100/70">
                      <td
                        colSpan={2 + coverage.billingMonths.length}
                        className="px-4 py-2 text-xs font-bold text-slate-700"
                      >
                        מחזיק כרטיס: {group.cardholderName} ({group.rows.length}{' '}
                        כרטיסים)
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.card.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {row.card.nickname}{' '}
                          <span className="text-xs text-slate-500">
                            ({row.card.provider} •••• {row.card.lastFourDigits})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.cardholderName}
                        </td>
                        {coverage.billingMonths.map((month) => {
                          const cell = row.cells[month];
                          const hasStmt = cell?.hasStatement ?? false;
                          return (
                            <td
                              key={month}
                              data-testid={`coverage-cell-${row.card.id}-${month}`}
                              className="px-4 py-3"
                            >
                              {hasStmt ? (
                                <div className="inline-flex flex-col rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-600/20">
                                  <span className="font-semibold">
                                    הועלה • ₪
                                    {(
                                      cell?.totalBilledIls ?? 0
                                    ).toLocaleString('he-IL')}
                                  </span>
                                  <span className="text-[11px] text-emerald-600">
                                    {cell?.transactionsCount ?? 0} עסקאות
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20">
                                  חסר דף פירוט
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            טרם הועלו דפי פירוט או כרטיסים. העלה קובץ דף פירוט ראשון כדי לאכלס
            את המטריצה.
          </p>
        )}
      </section>

      {/* Imported Transactions Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            עסקאות שיובאו ({transactions.length})
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="סינון לפי חודש חיוב"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">כל חודשי החיוב</option>
              {(coverage?.billingMonths ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              aria-label="סינון לפי כרטיס"
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="">כל הכרטיסים</option>
              {(coverage?.cards ?? []).map((r) => (
                <option key={r.card.id} value={r.card.id}>
                  {r.card.nickname} ({r.card.lastFourDigits})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          data-testid="transactions-table"
          className="overflow-x-auto rounded-lg border border-slate-200"
        >
          <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  תאריך עסקה
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  בית עסק
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  כרטיס
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  קטגוריה
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  תשלומים / מט&quot;ח
                </th>
                <th className="px-4 py-2.5 font-semibold text-slate-700">
                  סכום חיוב בש&quot;ח
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-2.5 text-slate-600">
                    {tx.purchaseDate}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    <div>{tx.merchantName}</div>
                    {tx.rawMerchantName !== tx.merchantName ? (
                      <div className="text-[11px] text-slate-500">
                        {tx.rawMerchantName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {tx.cardNickname} ({tx.cardLastFourDigits}) •{' '}
                    {tx.cardholderName}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <TransactionInlineControls
                      transaction={tx}
                      categories={categories}
                      defaultOptionLabel={
                        tx.effectiveCategoryName
                          ? `ברירת מחדל (${tx.effectiveCategoryName})`
                          : 'ללא דריסת קטגוריה'
                      }
                      onUpdate={handleUpdateTransaction}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {tx.installmentCurrent && tx.installmentTotal ? (
                      <span className="ml-2 inline-flex rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                        תשלום {tx.installmentCurrent} מתוך {tx.installmentTotal}
                      </span>
                    ) : null}
                    {tx.originalCurrency !== 'ILS' ? (
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                        {tx.originalAmount} {tx.originalCurrency}
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-4 py-2.5 font-semibold ${
                      tx.billedAmountIls < 0
                        ? 'text-emerald-700'
                        : 'text-slate-900'
                    }`}
                  >
                    ₪{tx.billedAmountIls.toLocaleString('he-IL')}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    אין עסקאות להצגה עבור הסינון הנוכחי.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
