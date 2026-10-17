import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CardholderSchema,
  CoverageMatrixResponseSchema,
  StatementCommitResponseSchema,
  StatementPreviewResponseSchema,
  TransactionsListResponseSchema,
  type BillingMonth,
  type CardCoverageRowDto,
  type CardholderDto,
  type CardProvider,
  type ColumnMappingOverrideDto,
  type CoverageMatrixResponseDto,
  type StatementPreviewFileItemDto,
  type TransactionListItemDto,
} from '@bills/shared';

interface UploadedFileBuffer {
  filename: string;
  contentBase64: string;
}

interface CardOnboardingDraft {
  cardholderId: string;
  nickname: string;
  provider: CardProvider;
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

function buildDefaultCardNickname(
  provider: CardProvider,
  lastFour: string,
): string {
  const prefix = provider === 'AMEX' ? 'אמקס' : 'ישראכרט';
  return `${prefix} ${lastFour}`;
}

export function StatementCoverage(): React.ReactElement {
  const [cardholders, setCardholders] = useState<CardholderDto[]>([]);
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

        const [chRes, covRes, txRes] = await Promise.all([
          fetch('/api/cardholders'),
          fetch('/api/coverage'),
          fetch(txUrl),
        ]);

        if (!chRes.ok || !covRes.ok || !txRes.ok) {
          throw new Error('Failed to load statement coverage data');
        }

        const rawCh = (await chRes.json()) as { cardholders?: unknown };
        const parsedCardholders = CardholderSchema.array().parse(
          rawCh.cardholders ?? [],
        );
        const covData = CoverageMatrixResponseSchema.parse(await covRes.json());
        const txData = TransactionsListResponseSchema.parse(await txRes.json());

        setCardholders(parsedCardholders);
        setCoverage(covData);
        setTransactions(txData.transactions);
        setErrorMessage(null);
      } catch {
        setErrorMessage('שגיאה בטעינת נתוני כיסוי דוחות ועסקאות');
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
      const nextOnboarding: Record<string, CardOnboardingDraft> = {
        ...onboardingByLastFour,
      };

      for (const file of parsed.files) {
        if (!file.existingCard && file.detectedLastFour) {
          if (!nextOnboarding[file.detectedLastFour]) {
            nextOnboarding[file.detectedLastFour] = {
              cardholderId: defaultCardholderId,
              nickname: buildDefaultCardNickname(
                file.detectedProvider,
                file.detectedLastFour,
              ),
              provider: file.detectedProvider,
            };
          }
        }
      }
      setOnboardingByLastFour(nextOnboarding);
    } catch {
      setErrorMessage('שגיאה בפענוח קבצי הדוחות לתצוגה מקדימה');
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

  const unrecognizedCardsForOnboarding = useMemo(() => {
    const map = new Map<string, CardProvider>();
    for (const file of previewFiles) {
      if (file.existingCard) continue;
      const lastFour = (
        file.detectedLastFour ??
        manualLastFourByFile[file.filename] ??
        ''
      ).trim();
      if (/^\d{4}$/.test(lastFour) && !map.has(lastFour)) {
        map.set(lastFour, file.detectedProvider);
      }
    }
    return Array.from(map.entries()).map(([lastFour, provider]) => ({
      lastFour,
      provider,
    }));
  }, [previewFiles, manualLastFourByFile]);

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

      const commitFiles = previewFiles.map((file) => {
        const cardLastFour = (
          file.detectedLastFour ??
          manualLastFourByFile[file.filename] ??
          '0000'
        ).trim();
        const billingMonth = (file.detectedBillingMonth ??
          manualMonthByFile[file.filename] ??
          '2026-01') as BillingMonth;

        const draft = onboardingByLastFour[cardLastFour];
        const newCardOnboarding = !file.existingCard
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
      setErrorMessage('שגיאה בשמירת הדוחות במסד הנתונים');
    }
  }

  if (loading && !coverage) {
    return (
      <div className="py-6 text-sm text-slate-500">
        טוען מטריצת כיסוי דוחות ועסקאות...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          מטריצת כיסוי דוחות וייבוא קבצים (Statement Coverage)
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          העלאה מרוכזת של דוחות ישראכרט ואמריקן אקספרס (.xls, .xlsx, .csv),
          שיוך כרטיסים חדשים ומעקב אחר שלמות הדוחות החודשיים
        </p>
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
              העלאת קבצי דוחות (Batch Upload — גרירה או בחירת קבצים)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              גרור לכאן או בחר קובץ אחד או יותר של ישראכרט / אמריקן אקספרס.
              המערכת תזהה אוטומטית 4 ספרות אחרונות, חודש חיוב, עסקאות בארץ
              ובחו&quot;ל ותשלומים.
            </p>
          </div>
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-700">
            בחירת קבצי דוחות
            <input
              type="file"
              multiple
              accept=".xls,.xlsx,.csv"
              aria-label="בחירת קבצי דוחות"
              onChange={(e) => void handleFileSelect(e)}
              className="sr-only"
            />
          </label>
        </div>

        {previewFiles.length > 0 ? (
          <div
            data-testid="statement-preview-panel"
            className="mt-6 space-y-4 border-t border-indigo-200 pt-4"
          >
            <h4 className="text-sm font-semibold text-slate-900">
              תצוגה מקדימה לפני ייבוא ({previewFiles.length} קבצים)
            </h4>

            {/* Once-per-card Onboarding Section */}
            {unrecognizedCardsForOnboarding.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-900">
                  זוהו כרטיסים חדשים — הגדר שיוך חד-פעמי לכל כרטיס:
                </p>
                {unrecognizedCardsForOnboarding.map(({ lastFour, provider }) => {
                  const onboarding = onboardingByLastFour[lastFour];
                  const defaultNickname = buildDefaultCardNickname(
                    provider,
                    lastFour,
                  );

                  return (
                    <div
                      key={lastFour}
                      className="grid gap-3 rounded-md border border-amber-200/80 bg-white p-3 sm:grid-cols-2"
                    >
                      <label className="block text-xs text-slate-700">
                        מחזיק כרטיס עבור {lastFour}
                        <select
                          aria-label={`מחזיק כרטיס עבור ${lastFour}`}
                          value={
                            onboarding?.cardholderId ??
                            cardholders[0]?.id ??
                            ''
                          }
                          onChange={(e) =>
                            setOnboardingByLastFour((prev) => ({
                              ...prev,
                              [lastFour]: {
                                cardholderId: e.target.value,
                                nickname:
                                  prev[lastFour]?.nickname ?? defaultNickname,
                                provider: prev[lastFour]?.provider ?? provider,
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        >
                          {cardholders.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-slate-700">
                        כינוי כרטיס עבור {lastFour}
                        <input
                          type="text"
                          aria-label={`כינוי כרטיס עבור ${lastFour}`}
                          value={onboarding?.nickname ?? defaultNickname}
                          onChange={(e) =>
                            setOnboardingByLastFour((prev) => ({
                              ...prev,
                              [lastFour]: {
                                cardholderId:
                                  prev[lastFour]?.cardholderId ??
                                  cardholders[0]?.id ??
                                  'cardholder-primary',
                                nickname: e.target.value,
                                provider: prev[lastFour]?.provider ?? provider,
                              },
                            }))
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="space-y-4">
              {previewFiles.map((file) => {
                const lastFour =
                  file.detectedLastFour ??
                  manualLastFourByFile[file.filename] ??
                  '';
                const mapping = columnMappingsByFile[file.filename] ?? {
                  purchaseDateIndex: 0,
                  rawMerchantNameIndex: 1,
                  billedAmountIlsIndex: 2,
                };

                return (
                  <div
                    key={file.filename}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-slate-900">
                          {file.filename}
                        </span>
                        <span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {file.detectedProvider} •{' '}
                          {lastFour ? `•••• ${lastFour}` : 'ללא זיהוי כרטיס'}
                        </span>
                        <span className="mr-2 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          חודש חיוב: {file.detectedBillingMonth ?? 'לא זוהה'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-medium text-emerald-700">
                          {file.newTransactionsCount} עסקאות חדשות
                        </span>
                        <span className="text-slate-500">
                          {file.duplicateTransactionsCount} כפילויות שידולגו
                        </span>
                        <span className="font-semibold text-slate-900">
                          סה&quot;כ: ₪
                          {file.totalBilledIls.toLocaleString('he-IL')}
                        </span>
                      </div>
                    </div>

                    {!file.detectedLastFour ? (
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-xs text-slate-700">
                          4 ספרות אחרונות:
                          <input
                            type="text"
                            maxLength={4}
                            value={manualLastFourByFile[file.filename] ?? ''}
                            onChange={(e) =>
                              setManualLastFourByFile((prev) => ({
                                ...prev,
                                [file.filename]: e.target.value,
                              }))
                            }
                            className="mr-2 w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          />
                        </label>
                      </div>
                    ) : null}

                    {!file.detectedBillingMonth ? (
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-xs text-slate-700">
                          חודש חיוב (YYYY-MM):
                          <input
                            type="text"
                            placeholder="2026-03"
                            value={manualMonthByFile[file.filename] ?? ''}
                            onChange={(e) =>
                              setManualMonthByFile((prev) => ({
                                ...prev,
                                [file.filename]: e.target.value,
                              }))
                            }
                            className="mr-2 w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          />
                        </label>
                      </div>
                    ) : null}

                    {file.requiresColumnMapping ? (
                      <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                        <p className="mb-2 text-xs font-semibold text-rose-900">
                          לא זוהו כותרות מוכרות בקובץ זה — בחר מיפוי עמודות ידני:
                        </p>
                        <div className="grid gap-3 sm:grid-cols-4">
                          <label className="block text-xs text-slate-700">
                            עמודת תאריך עסקה
                            <select
                              aria-label={`עמודת תאריך עבור ${file.filename}`}
                              value={mapping.purchaseDateIndex}
                              onChange={(e) =>
                                setColumnMappingsByFile((prev) => ({
                                  ...prev,
                                  [file.filename]: {
                                    ...mapping,
                                    purchaseDateIndex: Number(e.target.value),
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              {file.availableHeaders.map((h, idx) => (
                                <option key={idx} value={idx}>
                                  {h || `עמודה ${idx + 1}`}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-xs text-slate-700">
                            עמודת שם בית עסק
                            <select
                              aria-label={`עמודת בית עסק עבור ${file.filename}`}
                              value={mapping.rawMerchantNameIndex}
                              onChange={(e) =>
                                setColumnMappingsByFile((prev) => ({
                                  ...prev,
                                  [file.filename]: {
                                    ...mapping,
                                    rawMerchantNameIndex: Number(
                                      e.target.value,
                                    ),
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              {file.availableHeaders.map((h, idx) => (
                                <option key={idx} value={idx}>
                                  {h || `עמודה ${idx + 1}`}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-xs text-slate-700">
                            עמודת סכום חיוב בש&quot;ח
                            <select
                              aria-label={`עמודת סכום עבור ${file.filename}`}
                              value={mapping.billedAmountIlsIndex}
                              onChange={(e) =>
                                setColumnMappingsByFile((prev) => ({
                                  ...prev,
                                  [file.filename]: {
                                    ...mapping,
                                    billedAmountIlsIndex: Number(
                                      e.target.value,
                                    ),
                                  },
                                }))
                              }
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              {file.availableHeaders.map((h, idx) => (
                                <option key={idx} value={idx}>
                                  {h || `עמודה ${idx + 1}`}
                                </option>
                              ))}
                            </select>
                          </label>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() =>
                                void handleApplyColumnMapping(file.filename)
                              }
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                            >
                              החל מיפוי עמודות
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPreviewFiles([]);
                  setRawFiles([]);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void handleCommitBatch()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                אישור וייבוא דוחות
              </button>
            </div>
          </div>
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
                                  חסר דוח
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
            טרם הועלו דוחות או כרטיסים. העלה קובץ דוח ראשון כדי לאכלס את המטריצה.
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
                    {tx.merchantName}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {tx.cardNickname} ({tx.cardLastFourDigits}) •{' '}
                    {tx.cardholderName}
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
                    colSpan={5}
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
