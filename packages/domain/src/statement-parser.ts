import * as XLSX from 'xlsx';
import type {
  BillingMonth,
  CardProvider,
  InstallmentInfo,
} from './index.js';

export interface ColumnMappingOverride {
  purchaseDateIndex: number;
  rawMerchantNameIndex: number;
  billedAmountIlsIndex: number;
  originalAmountIndex?: number | null;
  originalCurrencyIndex?: number | null;
  remarksIndex?: number | null;
}

export interface ParseStatementOptions {
  filename?: string;
  cardLastFourOverride?: string;
  billingMonthOverride?: BillingMonth;
  providerOverride?: CardProvider;
  columnMapping?: ColumnMappingOverride;
}

export interface ParsedStatementTransaction {
  purchaseDate: string;
  rawMerchantName: string;
  normalizedMerchantName: string;
  billedAmountIls: number;
  originalAmount: number;
  originalCurrency: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  installmentTotalAmountIls: number | null;
  occurrenceIndexWithinStatement: number;
  dedupFingerprint: string;
}

export interface ParsedStatementResult {
  detectedLastFour: string | null;
  detectedProvider: CardProvider;
  detectedBillingMonth: BillingMonth | null;
  requiresColumnMapping: boolean;
  availableHeaders: string[];
  sampleRows: string[][];
  transactions: ParsedStatementTransaction[];
  totalBilledIls: number;
}

export interface DedupFingerprintInput {
  cardLast4: string;
  billingMonth: BillingMonth;
  purchaseDate: string;
  rawMerchantName: string;
  billedAmountIls: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  occurrenceIndexWithinStatement: number;
}

export interface FingerprintableTransactionInput {
  purchaseDate: string;
  rawMerchantName: string;
  billedAmountIls: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  occurrenceIndexWithinStatement?: number;
}

export function normalizeMerchantName(rawName: string): string {
  const collapsed = rawName.replace(/\s+/g, ' ').trim();
  const withoutProcessor = collapsed
    .replace(/^(?:PAYPAL|GOOGLE|APPLE\.COM\/BILL|SUMUP|SQ)\s*\*+\s*/i, '')
    .trim();
  return withoutProcessor.length > 0 ? withoutProcessor : collapsed;
}

function buildOccurrenceBaseKey(
  cardLast4: string,
  billingMonth: BillingMonth,
  tx: FingerprintableTransactionInput,
): string {
  const normalizedRaw = tx.rawMerchantName.replace(/\s+/g, ' ').trim();
  const formattedAmount = Number(tx.billedAmountIls).toFixed(2);
  const instCurrent =
    tx.installmentCurrent !== null ? String(tx.installmentCurrent) : '0';
  const instTotal =
    tx.installmentTotal !== null ? String(tx.installmentTotal) : '0';

  return [
    cardLast4.trim(),
    billingMonth.trim(),
    tx.purchaseDate.trim(),
    normalizedRaw,
    formattedAmount,
    instCurrent,
    instTotal,
  ].join('|');
}

export function computeTransactionDedupFingerprint(
  input: DedupFingerprintInput,
): string {
  return `${buildOccurrenceBaseKey(input.cardLast4, input.billingMonth, input)}|${input.occurrenceIndexWithinStatement}`;
}

export function assignStatementFingerprints<
  T extends FingerprintableTransactionInput,
>(
  cardLast4: string,
  billingMonth: BillingMonth,
  items: readonly T[],
): Array<
  T & {
    occurrenceIndexWithinStatement: number;
    dedupFingerprint: string;
  }
> {
  const occurrenceCounters = new Map<string, number>();

  return items.map((item) => {
    const baseKey = buildOccurrenceBaseKey(cardLast4, billingMonth, item);
    const computedIndex = occurrenceCounters.get(baseKey) ?? 0;
    occurrenceCounters.set(baseKey, computedIndex + 1);

    const occurrenceIndexWithinStatement =
      item.occurrenceIndexWithinStatement ?? computedIndex;

    const dedupFingerprint = computeTransactionDedupFingerprint({
      cardLast4,
      billingMonth,
      purchaseDate: item.purchaseDate,
      rawMerchantName: item.rawMerchantName,
      billedAmountIls: item.billedAmountIls,
      installmentCurrent: item.installmentCurrent,
      installmentTotal: item.installmentTotal,
      occurrenceIndexWithinStatement,
    });

    return {
      ...item,
      occurrenceIndexWithinStatement,
      dedupFingerprint,
    };
  });
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseInstallmentRemarks(
  remarks: string,
  billedAmountIls: number,
  originalAmount: number,
  originalCurrency: string,
): InstallmentInfo | null {
  const cleaned = remarks.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }

  const hebrewMatch =
    /תשלום\s*(\d{1,3})\s*(?:מתוך|מ-?|\/)\s*(\d{1,3})/u.exec(cleaned);
  const genericMatch =
    !hebrewMatch && /תשלומים/u.test(cleaned)
      ? /(\d{1,3})\s*(?:מתוך|\/)\s*(\d{1,3})/u.exec(cleaned)
      : null;

  const match = hebrewMatch ?? genericMatch;
  if (!match) {
    return null;
  }

  const current = Number.parseInt(match[1] ?? '', 10);
  const total = Number.parseInt(match[2] ?? '', 10);

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(total) ||
    current < 1 ||
    total < 1 ||
    current > total
  ) {
    return null;
  }

  let totalAmountIls: number | null = null;
  const absBilled = Math.abs(billedAmountIls);
  const absOriginal = Math.abs(originalAmount);

  if (originalCurrency === 'ILS' && absOriginal > absBilled * 1.2) {
    totalAmountIls = roundCurrency(absOriginal);
  } else if (absBilled > 0) {
    totalAmountIls = roundCurrency(absBilled * total);
  }

  return {
    installmentCurrent: current,
    installmentTotal: total,
    installmentTotalAmountIls: totalAmountIls,
  };
}

function normalizeQuoteChars(text: string): string {
  return text.replace(/[״"]/g, '"').replace(/[׳']/g, "'");
}

function isSummaryOrIgnoredRow(row: readonly string[]): boolean {
  const joined = normalizeQuoteChars(row.join(' ')).replace(/\s+/g, ' ').trim();
  if (!joined) {
    return true;
  }

  const summaryPatterns = [
    /^סה"כ/u,
    /\bסה"כ\s+(?:חיוב|לחיוב|עסקאות|בארץ|בחו"ל|מט"ח)/u,
    /^סך\s+הכל/u,
    /^אין\s+עסקאות/u,
  ];

  return summaryPatterns.some((regex) => regex.test(joined));
}

export function parsePurchaseDateCell(rawCell: string): string | null {
  const trimmed = rawCell.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number.parseInt(isoMatch[1] ?? '', 10);
    const month = Number.parseInt(isoMatch[2] ?? '', 10);
    const day = Number.parseInt(isoMatch[3] ?? '', 10);
    if (isValidYearMonthDay(year, month, day)) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dmyMatch = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2}|\d{4})$/.exec(
    trimmed,
  );
  if (dmyMatch) {
    const day = Number.parseInt(dmyMatch[1] ?? '', 10);
    const month = Number.parseInt(dmyMatch[2] ?? '', 10);
    let year = Number.parseInt(dmyMatch[3] ?? '', 10);
    if (year < 100) {
      year += 2000;
    }
    if (isValidYearMonthDay(year, month, day)) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

function isValidYearMonthDay(
  year: number,
  month: number,
  day: number,
): boolean {
  return (
    year >= 1990 &&
    year <= 2100 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

const CURRENCY_PATTERNS: ReadonlyArray<{ code: string; regex: RegExp }> = [
  { code: 'ILS', regex: /₪|ש"ח|ש״ח|\bשח\b|\bNIS\b|\bILS\b/iu },
  { code: 'USD', regex: /\$|\bUSD\b|דולר/iu },
  { code: 'EUR', regex: /€|\bEUR\b|אירו|יורו/iu },
  { code: 'GBP', regex: /£|\bGBP\b|ליש"ט/iu },
];

function detectCurrencyFromText(rawText: string): string | null {
  const cleaned = normalizeQuoteChars(rawText).trim();
  if (!cleaned) {
    return null;
  }
  for (const entry of CURRENCY_PATTERNS) {
    if (entry.regex.test(cleaned)) {
      return entry.code;
    }
  }
  return null;
}

function normalizeCurrencyCode(rawCurrency: string): string {
  const cleaned = normalizeQuoteChars(rawCurrency).trim().toUpperCase();
  if (!cleaned) {
    return 'ILS';
  }
  return detectCurrencyFromText(cleaned) ?? cleaned;
}

interface ParsedAmountAndCurrency {
  amount: number;
  currency: string | null;
}

function parseAmountCell(rawCell: string): ParsedAmountAndCurrency | null {
  const trimmed = rawCell.trim();
  if (!trimmed) {
    return null;
  }

  const detectedCurrency = detectCurrencyFromText(trimmed);

  let isNegative = false;
  let normalized = trimmed;

  if (/^\(.*\)$/.test(normalized)) {
    isNegative = true;
    normalized = normalized.slice(1, -1);
  }
  if (normalized.endsWith('-')) {
    isNegative = true;
    normalized = normalized.slice(0, -1);
  }
  if (normalized.startsWith('-')) {
    isNegative = true;
    normalized = normalized.slice(1);
  }

  const numericStr = normalized.replace(/[^0-9.]/g, '');
  if (!numericStr || numericStr === '.') {
    return null;
  }

  const parsed = Number.parseFloat(numericStr);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const signedAmount = roundCurrency(isNegative ? -parsed : parsed);
  return {
    amount: signedAmount,
    currency: detectedCurrency,
  };
}

function detectMetadataFromRows(
  rows: readonly (readonly string[])[],
  filename?: string,
): {
  lastFour: string | null;
  provider: CardProvider;
  billingMonth: BillingMonth | null;
} {
  let lastFour: string | null = null;
  let provider: CardProvider | null = null;
  let billingMonth: BillingMonth | null = null;

  const scanLimit = Math.min(rows.length, 30);

  for (let r = 0; r < scanLimit; r += 1) {
    const row = rows[r];
    if (!row) continue;

    const rowJoined = normalizeQuoteChars(row.join(' ')).trim();
    if (!rowJoined) continue;

    if (!provider) {
      if (
        /אמריקן\s*אקספרס|אמקס|american\s*express|\bamex\b/iu.test(rowJoined)
      ) {
        provider = 'AMEX';
      } else if (/ישראכרט|isracard|מאסטרקארד|mastercard/iu.test(rowJoined)) {
        provider = 'ISRACARD';
      }
    }

    if (!lastFour) {
      const cardPatterns = [
        /(?:כרטיס(?:\s+אשראי)?(?:\s+מס(?:'|פר))?|מספר\s+כרטיס|מסתיים\s+ב-?|המסתיים\s+ב-?|ישראכרט|אמריקן\s+אקספרס|אמקס|מאסטרקארד|ויזה|amex|isracard)[^0-9]{0,20}(?:\*{2,4}|x{2,4}|-|\s)*(\d{4})(?!\d)/iu,
        /(?:\*{4}|x{4})[- ]?(\d{4})(?!\d)/iu,
      ];
      for (const pattern of cardPatterns) {
        const match = pattern.exec(rowJoined);
        if (match?.[1]) {
          lastFour = match[1];
          break;
        }
      }

      if (!lastFour) {
        for (let c = 0; c < row.length - 1; c += 1) {
          const cell = normalizeQuoteChars(row[c] ?? '').trim();
          const nextCell = (row[c + 1] ?? '').trim();
          if (
            /(?:כרטיס|מספר כרטיס)/u.test(cell) &&
            /^\d{4}$/.test(nextCell)
          ) {
            lastFour = nextCell;
            break;
          }
        }
      }
    }

    if (!billingMonth) {
      billingMonth = extractBillingMonthFromText(rowJoined);
      if (!billingMonth) {
        for (let c = 0; c < row.length - 1; c += 1) {
          const cell = normalizeQuoteChars(row[c] ?? '').trim();
          const nextCell = (row[c + 1] ?? '').trim();
          if (/(?:תאריך\s+חיוב|מועד\s+חיוב|חודש\s+חיוב|לחיוב\s+ב)/u.test(cell)) {
            const candidate =
              extractBillingMonthFromDateOrMonthString(nextCell);
            if (candidate) {
              billingMonth = candidate;
              break;
            }
          }
        }
      }
    }
  }

  if (filename) {
    if (!provider) {
      if (/amex|american/i.test(filename)) {
        provider = 'AMEX';
      } else if (/isracard/i.test(filename)) {
        provider = 'ISRACARD';
      }
    }
    if (!lastFour) {
      const fileCardMatch = /(?:card|כרטיס|[_-])(\d{4})(?:[_.-]|$)/iu.exec(
        filename,
      );
      if (fileCardMatch?.[1]) {
        lastFour = fileCardMatch[1];
      }
    }
    if (!billingMonth) {
      const fileMonthMatch = /(20\d{2})[-_](0[1-9]|1[0-2])/.exec(filename);
      if (fileMonthMatch?.[1] && fileMonthMatch[2]) {
        billingMonth = `${Number(fileMonthMatch[1])}-${fileMonthMatch[2]}`;
      }
    }
  }

  return {
    lastFour,
    provider: provider ?? 'ISRACARD',
    billingMonth,
  };
}

function extractBillingMonthFromText(text: string): BillingMonth | null {
  const labeledDateMatch =
    /(?:תאריך\s+חיוב|מועד\s+חיוב|פירוט\s+חיובים\s+למועד|חיוב\s+בתאריך|לתאריך\s+חיוב)[^0-9]{0,15}(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})/u.exec(
      text,
    );
  if (labeledDateMatch) {
    const month = Number.parseInt(labeledDateMatch[2] ?? '', 10);
    let year = Number.parseInt(labeledDateMatch[3] ?? '', 10);
    if (year < 100) year += 2000;
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  const labeledMonthYearMatch =
    /(?:חודש\s+חיוב|לחודש|מועד\s+חיוב|תאריך\s+חיוב)[^0-9]{0,15}(0?[1-9]|1[0-2])[/. -](20\d{2})/u.exec(
      text,
    );
  if (labeledMonthYearMatch) {
    const month = Number.parseInt(labeledMonthYearMatch[1] ?? '', 10);
    const year = Number.parseInt(labeledMonthYearMatch[2] ?? '', 10);
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  const labeledIsoMonthMatch =
    /(?:חודש\s+חיוב|לחודש|מועד\s+חיוב|תאריך\s+חיוב)[^0-9]{0,15}(20\d{2})-(0[1-9]|1[0-2])/u.exec(
      text,
    );
  if (labeledIsoMonthMatch?.[1] && labeledIsoMonthMatch[2]) {
    return `${Number(labeledIsoMonthMatch[1])}-${labeledIsoMonthMatch[2]}`;
  }

  return null;
}

function extractBillingMonthFromDateOrMonthString(
  rawValue: string,
): BillingMonth | null {
  const trimmed = rawValue.trim();
  const isoMonth = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (isoMonth?.[1] && isoMonth[2]) {
    return `${Number(isoMonth[1])}-${isoMonth[2]}`;
  }

  const monthYear = /^(0?[1-9]|1[0-2])[/. -](20\d{2})$/.exec(trimmed);
  if (monthYear?.[1] && monthYear[2]) {
    const m = Number.parseInt(monthYear[1], 10);
    return `${Number(monthYear[2])}-${String(m).padStart(2, '0')}`;
  }

  const parsedDate = parsePurchaseDateCell(trimmed);
  if (parsedDate) {
    const parts = parsedDate.split('-');
    if (parts[0] && parts[1]) {
      return `${Number(parts[0])}-${parts[1]}`;
    }
  }

  return null;
}

function detectHeaderColumnMapping(
  row: readonly string[],
): ColumnMappingOverride | null {
  let purchaseDateIndex = -1;
  let rawMerchantNameIndex = -1;
  let billedAmountIlsIndex = -1;
  let originalAmountIndex = -1;
  let originalCurrencyIndex = -1;
  let remarksIndex = -1;

  for (let i = 0; i < row.length; i += 1) {
    const cell = normalizeQuoteChars(row[i] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cell) continue;

    if (
      purchaseDateIndex === -1 &&
      /^(?:תאריך\s+עסקה|תאריך\s+רכישה|תאריך)$/u.test(cell)
    ) {
      purchaseDateIndex = i;
      continue;
    }

    if (
      rawMerchantNameIndex === -1 &&
      /(?:שם\s+בית\s+ה?עסק|בית\s+עסק|תיאור\s+עסקה|שם\s+המוטב)/u.test(cell)
    ) {
      rawMerchantNameIndex = i;
      continue;
    }

    if (
      billedAmountIlsIndex === -1 &&
      /(?:סכום\s+חיוב|סכום\s+לחיוב|חיוב\s+בש"ח|סכום\s+בש"ח)/u.test(cell)
    ) {
      billedAmountIlsIndex = i;
      continue;
    }

    if (
      originalAmountIndex === -1 &&
      /(?:סכום\s+ה?עסקה|סכום\s+מקורי|סכום\s+במטבע\s+מקור)/u.test(cell)
    ) {
      originalAmountIndex = i;
      continue;
    }

    if (
      originalCurrencyIndex === -1 &&
      /(?:מטבע\s+חיוב|מטבע\s+עסקה|מטבע\s+מקור|^מטבע$)/u.test(cell)
    ) {
      originalCurrencyIndex = i;
      continue;
    }

    if (
      remarksIndex === -1 &&
      /(?:פירוט\s+נוסף|הערות|פרטים\s+נוספים|אופן\s+ביצוע|סוג\s+עסקה)/u.test(
        cell,
      )
    ) {
      remarksIndex = i;
      continue;
    }
  }

  if (billedAmountIlsIndex === -1 && originalAmountIndex !== -1) {
    billedAmountIlsIndex = originalAmountIndex;
  }

  if (
    purchaseDateIndex !== -1 &&
    rawMerchantNameIndex !== -1 &&
    billedAmountIlsIndex !== -1
  ) {
    return {
      purchaseDateIndex,
      rawMerchantNameIndex,
      billedAmountIlsIndex,
      originalAmountIndex:
        originalAmountIndex !== -1 ? originalAmountIndex : null,
      originalCurrencyIndex:
        originalCurrencyIndex !== -1 ? originalCurrencyIndex : null,
      remarksIndex: remarksIndex !== -1 ? remarksIndex : null,
    };
  }

  return null;
}

export function parseStatementRows(
  rows: readonly (readonly string[])[],
  options?: ParseStatementOptions,
): ParsedStatementResult {
  const metadata = detectMetadataFromRows(rows, options?.filename);
  const detectedLastFour = options?.cardLastFourOverride ?? metadata.lastFour;
  const detectedProvider = options?.providerOverride ?? metadata.provider;
  const detectedBillingMonth =
    options?.billingMonthOverride ?? metadata.billingMonth;

  let activeMapping: ColumnMappingOverride | null =
    options?.columnMapping ?? null;
  let foundAnyHeaderMapping = activeMapping !== null;

  const rawExtractedRows: Array<{
    purchaseDate: string;
    rawMerchantName: string;
    normalizedMerchantName: string;
    billedAmountIls: number;
    originalAmount: number;
    originalCurrency: string;
    installmentCurrent: number | null;
    installmentTotal: number | null;
    installmentTotalAmountIls: number | null;
  }> = [];

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    if (!options?.columnMapping) {
      const detectedHeader = detectHeaderColumnMapping(row);
      if (detectedHeader) {
        activeMapping = detectedHeader;
        foundAnyHeaderMapping = true;
        continue;
      }
    }

    if (!activeMapping || isSummaryOrIgnoredRow(row)) {
      continue;
    }

    const rawDateCell = row[activeMapping.purchaseDateIndex] ?? '';
    const purchaseDate = parsePurchaseDateCell(rawDateCell);
    if (!purchaseDate) {
      continue;
    }

    const rawMerchantName = (row[activeMapping.rawMerchantNameIndex] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      !rawMerchantName ||
      /^סה"כ|^סך הכל/u.test(normalizeQuoteChars(rawMerchantName))
    ) {
      continue;
    }

    const billedCell = row[activeMapping.billedAmountIlsIndex] ?? '';
    const parsedBilled = parseAmountCell(billedCell);
    if (!parsedBilled) {
      continue;
    }

    const origIdx = activeMapping.originalAmountIndex;
    const rawOriginalCell =
      origIdx !== undefined && origIdx !== null ? (row[origIdx] ?? '') : '';
    const parsedOriginal = parseAmountCell(rawOriginalCell) ?? parsedBilled;

    const currIdx = activeMapping.originalCurrencyIndex;
    const rawCurrencyCell =
      currIdx !== undefined && currIdx !== null ? (row[currIdx] ?? '') : '';

    const originalCurrency = rawCurrencyCell.trim()
      ? normalizeCurrencyCode(rawCurrencyCell)
      : (parsedOriginal.currency ?? parsedBilled.currency ?? 'ILS');

    const remarksIdx = activeMapping.remarksIndex;
    const remarksCell =
      remarksIdx !== undefined && remarksIdx !== null
        ? (row[remarksIdx] ?? '')
        : '';

    const installmentInfo = parseInstallmentRemarks(
      remarksCell,
      parsedBilled.amount,
      parsedOriginal.amount,
      originalCurrency,
    );

    rawExtractedRows.push({
      purchaseDate,
      rawMerchantName,
      normalizedMerchantName: normalizeMerchantName(rawMerchantName),
      billedAmountIls: parsedBilled.amount,
      originalAmount: parsedOriginal.amount,
      originalCurrency,
      installmentCurrent: installmentInfo?.installmentCurrent ?? null,
      installmentTotal: installmentInfo?.installmentTotal ?? null,
      installmentTotalAmountIls:
        installmentInfo?.installmentTotalAmountIls ?? null,
    });
  }

  let effectiveBillingMonth = detectedBillingMonth;
  if (!effectiveBillingMonth && rawExtractedRows.length > 0) {
    const firstDate = rawExtractedRows[0]?.purchaseDate;
    if (firstDate) {
      const [yearStr, monthStr] = firstDate.split('-');
      if (yearStr && monthStr) {
        effectiveBillingMonth = `${Number(yearStr)}-${monthStr}`;
      }
    }
  }

  const cardKeyForDedup = detectedLastFour ?? '0000';
  const monthKeyForDedup: BillingMonth = effectiveBillingMonth ?? '1970-01';

  const transactions = assignStatementFingerprints(
    cardKeyForDedup,
    monthKeyForDedup,
    rawExtractedRows,
  );

  const totalBilledIls = roundCurrency(
    transactions.reduce((sum, tx) => sum + tx.billedAmountIls, 0),
  );

  const requiresColumnMapping = !foundAnyHeaderMapping;
  const nonEmptyMultiColRows = rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.filter((c) => c.length > 0).length >= 3);

  const availableHeaders =
    requiresColumnMapping && nonEmptyMultiColRows[0]
      ? nonEmptyMultiColRows[0]
      : [];
  const sampleRows = requiresColumnMapping
    ? nonEmptyMultiColRows.slice(1, 6)
    : [];

  return {
    detectedLastFour,
    detectedProvider,
    detectedBillingMonth: effectiveBillingMonth,
    requiresColumnMapping,
    availableHeaders,
    sampleRows,
    transactions,
    totalBilledIls,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(htmlFragment: string): string {
  return decodeHtmlEntities(htmlFragment.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTableCells(
  content: string,
  rowTagPattern: string,
  cellTagPattern: string,
): string[][] {
  const rows: string[][] = [];
  const rowRegex = new RegExp(
    `<${rowTagPattern}[^>]*>([\\s\\S]*?)<\\/${rowTagPattern}>`,
    'gi',
  );
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(content)) !== null) {
    const rowBody = rowMatch[1] ?? '';
    const cellRegex = new RegExp(
      `<${cellTagPattern}[^>]*>([\\s\\S]*?)<\\/${cellTagPattern}>`,
      'gi',
    );
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      cells.push(stripTags(cellMatch[1] ?? ''));
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

export function extractRowsFromHtmlOrXml(content: string): string[][] {
  if (/<Row[\s>]/i.test(content) && /<Cell[\s>]/i.test(content)) {
    const xmlRows = extractTableCells(content, 'Row', 'Cell');
    if (xmlRows.length > 0) {
      return xmlRows;
    }
  }
  return extractTableCells(content, 'tr', '(?:td|th)');
}

export function extractRowsFromCsv(content: string): string[][] {
  const cleaned = content.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const delimiter =
      line.includes('\t') && !line.includes(',') ? '\t' : ',';
    const cells = parseDelimitedLine(line, delimiter);
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] ?? '';
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseStatementText(
  content: string,
  options?: ParseStatementOptions,
): ParsedStatementResult {
  const trimmed = content.replace(/^\uFEFF/, '').trim();
  const isMarkup =
    /^<(?:!DOCTYPE|html|table|\?xml|Workbook)/i.test(trimmed) ||
    /<table[\s>]/i.test(trimmed) ||
    /<Row[\s>]/i.test(trimmed);

  const rows = isMarkup
    ? extractRowsFromHtmlOrXml(trimmed)
    : extractRowsFromCsv(trimmed);

  return parseStatementRows(rows, options);
}

function isBinarySpreadsheetBuffer(bytes: Uint8Array): boolean {
  if (bytes.length < 4) {
    return false;
  }
  const isZipXlsx =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;
  const isOle2Xls =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;

  return isZipXlsx || isOle2Xls;
}

function extractRowsFromBinaryWorkbook(bytes: Uint8Array): string[][] {
  const workbook = XLSX.read(bytes, {
    type: 'array',
    raw: false,
  });
  const allRows: string[][] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const sheetRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(
      sheet,
      {
        header: 1,
        raw: false,
        defval: '',
      },
    );
    for (const row of sheetRows) {
      allRows.push(
        row.map((cell) =>
          cell === null || cell === undefined ? '' : String(cell),
        ),
      );
    }
  }

  return allRows;
}

export function parseStatementBuffer(
  buffer: Uint8Array,
  options?: ParseStatementOptions,
): ParsedStatementResult {
  if (isBinarySpreadsheetBuffer(buffer)) {
    const rows = extractRowsFromBinaryWorkbook(buffer);
    return parseStatementRows(rows, options);
  }
  const text = new TextDecoder('utf-8').decode(buffer);
  return parseStatementText(text, options);
}
