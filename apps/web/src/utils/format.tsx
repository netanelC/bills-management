import React from 'react';

/**
 * Formats a monetary amount into Israeli Shekels with consistent LTR directionality.
 * Example: 14307.8 -> "14,307.80 ₪", -1414.16 -> "-1,414.16 ₪"
 */
export function formatIls(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formattedNumber = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}${formattedNumber} ₪`;
}

export interface MoneyProps {
  amount: number;
  className?: string;
  colored?: boolean;
}

export function Money({
  amount,
  className = '',
  colored = false,
}: MoneyProps): React.ReactElement {
  const isNegative = amount < 0;
  const colorClass = colored
    ? isNegative
      ? 'text-emerald-700 font-semibold'
      : 'text-slate-900 font-semibold'
    : '';

  return (
    <span
      dir="ltr"
      className={`inline-block tabular-nums ${colorClass} ${className}`.trim()}
    >
      {formatIls(amount)}
    </span>
  );
}
