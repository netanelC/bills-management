import { describe, expect, it } from 'vitest';
import { parseStatementText } from '../src/statement-parser.js';

describe('statement-parser metadata detection', () => {
  it('detects lastFour and provider for Isracard Mastercard with RTL control chars', () => {
    // Arrange
    const rawContent = `
פירוט עסקאות אוגוסט 2026
\u202bגולד - מסטרקארד\u202c - 2113
על שם נתנאל כהן לחיוב ב-10.08
תאריך רכישה,שם בית עסק,סכום חיוב
07.08.26,רמי לוי,819.90
`;

    // Act
    const result = parseStatementText(rawContent, {
      filename: '2113_08_2026.xlsx',
    });

    // Assert
    expect(result.detectedLastFour).toBe('2113');
    expect(result.detectedProvider).toBe('ISRACARD');
    expect(result.detectedBillingMonth).toBe('2026-08');
  });

  it('detects lastFour for Platinum Mastercard without explicit "מאסטרקארד"', () => {
    // Arrange
    const rawContent = `
פירוט עסקאות אוגוסט 2026
\u202bפלטינה מסטרקארד\u202c - 3052
על שם הילה כהן לחיוב ב-10.08
תאריך רכישה,שם בית עסק,סכום חיוב
07.08.26,מאפיית השומרון,66.00
`;

    // Act
    const result = parseStatementText(rawContent, {
      filename: '3052-08.2026.xlsx',
    });

    // Assert
    expect(result.detectedLastFour).toBe('3052');
    expect(result.detectedProvider).toBe('ISRACARD');
    expect(result.detectedBillingMonth).toBe('2026-08');
  });

  it('prioritizes card number over billing year in filename parsing', () => {
    // Arrange
    const rawContent = `
תאריך רכישה,שם בית עסק,סכום חיוב
01.08.26,חנות,50.00
`;

    // Act
    const result = parseStatementText(rawContent, {
      filename: '2113_08_2026.xlsx',
    });

    // Assert
    expect(result.detectedLastFour).toBe('2113');
  });
});
