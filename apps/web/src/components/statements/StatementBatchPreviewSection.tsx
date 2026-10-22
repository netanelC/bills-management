import React from 'react';
import type {
  CardholderDto,
  CardProvider,
  ColumnMappingOverrideDto,
  StatementPreviewFileItemDto,
} from '@bills/shared';

export interface CardOnboardingDraft {
  cardholderId: string;
  nickname: string;
  provider: CardProvider;
}

export function buildDefaultCardNickname(
  provider: CardProvider,
  lastFour: string,
): string {
  const prefix =
    provider === 'AMEX' ? 'אמקס' : provider === 'ISRACARD' ? 'ישראכרט' : 'כרטיס';
  return `${prefix} ${lastFour}`;
}

function renderHeaderOptions(availableHeaders: readonly string[]) {
  return availableHeaders.map((h, idx) => (
    <option key={idx} value={idx}>
      {h || `עמודה ${idx + 1}`}
    </option>
  ));
}

interface StatementBatchPreviewSectionProps {
  previewFiles: StatementPreviewFileItemDto[];
  cardholders: CardholderDto[];
  onboardingByLastFour: Record<string, CardOnboardingDraft>;
  manualLastFourByFile: Record<string, string>;
  manualMonthByFile: Record<string, string>;
  columnMappingsByFile: Record<string, ColumnMappingOverrideDto>;
  onUpdateOnboarding: (
    lastFour: string,
    updater: (prev?: CardOnboardingDraft) => CardOnboardingDraft,
  ) => void;
  onUpdateManualLastFour: (filename: string, val: string) => void;
  onUpdateManualMonth: (filename: string, val: string) => void;
  onUpdateColumnMapping: (
    filename: string,
    mapping: ColumnMappingOverrideDto,
  ) => void;
  onApplyColumnMapping: (filename: string) => void;
  onCancel: () => void;
  onCommit: () => void;
}

export function StatementBatchPreviewSection({
  previewFiles,
  cardholders,
  onboardingByLastFour,
  manualLastFourByFile,
  manualMonthByFile,
  columnMappingsByFile,
  onUpdateOnboarding,
  onUpdateManualLastFour,
  onUpdateManualMonth,
  onUpdateColumnMapping,
  onApplyColumnMapping,
  onCancel,
  onCommit,
}: StatementBatchPreviewSectionProps): React.ReactElement {
  const unrecognizedCards = Array.from(
    new Set(
      previewFiles
        .filter((f) => !f.existingCard)
        .map((f) => f.detectedLastFour ?? manualLastFourByFile[f.filename] ?? '')
        .filter((digits) => digits.length === 4),
    ),
  );

  return (
    <div
      data-testid="statement-preview-panel"
      className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">
          תצוגה מקדימה של קובצי דפי פירוט ({previewFiles.length})
        </h4>
        <span className="text-xs text-slate-500">
          בדוק את הנתונים המזוהים ואשר את הקליטה למערכת
        </span>
      </div>

      {unrecognizedCards.length > 0 ? (
        <div
          data-testid="new-card-onboarding-panel"
          className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3.5"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
            <span>⚠️</span>
            <span>זוהו כרטיסים חדשים שטרם הוגדרו במערכת:</span>
          </div>

          {unrecognizedCards.map((lastFour) => {
            const sampleFile = previewFiles.find(
              (f) =>
                (f.detectedLastFour ?? manualLastFourByFile[f.filename]) ===
                lastFour,
            );
            const provider = sampleFile?.detectedProvider ?? 'ISRACARD';
            const defaultNickname = buildDefaultCardNickname(provider, lastFour);
            const onboarding = onboardingByLastFour[lastFour];

            return (
              <div
                key={lastFour}
                className="grid gap-3 rounded-md bg-white p-3 shadow-2xs sm:grid-cols-3"
              >
                <div>
                  <span className="text-xs font-bold text-slate-900">
                    כרטיס מסתיים ב-{lastFour}
                  </span>
                  <span className="mr-2 text-xs text-slate-500">({provider})</span>
                </div>
                <label className="block text-xs text-slate-700">
                  שייך למחזיק כרטיס
                  <select
                    aria-label={`שיוך מחזיק עבור ${lastFour}`}
                    value={
                      onboarding?.cardholderId ?? cardholders[0]?.id ?? ''
                    }
                    onChange={(e) =>
                      onUpdateOnboarding(lastFour, (prev) => ({
                        cardholderId: e.target.value,
                        nickname: prev?.nickname ?? defaultNickname,
                        provider: prev?.provider ?? provider,
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
                      onUpdateOnboarding(lastFour, (prev) => ({
                        cardholderId:
                          prev?.cardholderId ?? cardholders[0]?.id ?? '',
                        nickname: e.target.value,
                        provider: prev?.provider ?? provider,
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
            file.detectedLastFour ?? manualLastFourByFile[file.filename] ?? '';
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
                  <span className="mr-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    מחזיק כרטיס:{' '}
                    {(() => {
                      const chId =
                        file.existingCard?.cardholderId ??
                        onboardingByLastFour[lastFour]?.cardholderId;
                      return (
                        (chId &&
                          cardholders.find((ch) => ch.id === chId)?.name) ||
                        'טרם שוייך'
                      );
                    })()}
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
                    סה&quot;כ: ₪{file.totalBilledIls.toLocaleString('he-IL')}
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
                        onUpdateManualLastFour(file.filename, e.target.value)
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
                        onUpdateManualMonth(file.filename, e.target.value)
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
                          onUpdateColumnMapping(file.filename, {
                            ...mapping,
                            purchaseDateIndex: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {renderHeaderOptions(file.availableHeaders)}
                      </select>
                    </label>

                    <label className="block text-xs text-slate-700">
                      עמודת שם בית עסק
                      <select
                        aria-label={`עמודת בית עסק עבור ${file.filename}`}
                        value={mapping.rawMerchantNameIndex}
                        onChange={(e) =>
                          onUpdateColumnMapping(file.filename, {
                            ...mapping,
                            rawMerchantNameIndex: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {renderHeaderOptions(file.availableHeaders)}
                      </select>
                    </label>

                    <label className="block text-xs text-slate-700">
                      עמודת סכום חיוב בש&quot;ח
                      <select
                        aria-label={`עמודת סכום עבור ${file.filename}`}
                        value={mapping.billedAmountIlsIndex}
                        onChange={(e) =>
                          onUpdateColumnMapping(file.filename, {
                            ...mapping,
                            billedAmountIlsIndex: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                      >
                        {renderHeaderOptions(file.availableHeaders)}
                      </select>
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => onApplyColumnMapping(file.filename)}
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
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          ביטול
        </button>
        <button
          type="button"
          onClick={onCommit}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          אישור וייבוא דפי פירוט
        </button>
      </div>
    </div>
  );
}
