import { z } from 'zod';

export const SpendingNatureSchema = z.enum([
  'FIXED',
  'VARIABLE',
  'DISCRETIONARY',
]);
export type SpendingNature = z.infer<typeof SpendingNatureSchema>;

export const CardProviderSchema = z.enum(['ISRACARD', 'AMEX', 'OTHER']);
export type CardProvider = z.infer<typeof CardProviderSchema>;

export const MerchantAliasMatchTypeSchema = z.enum(['EXACT', 'CONTAINS']);
export type MerchantAliasMatchType = z.infer<
  typeof MerchantAliasMatchTypeSchema
>;

export const BillingMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Billing Month must be in YYYY-MM format');
export type BillingMonth = z.infer<typeof BillingMonthSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('connected'),
  tablesInitialized: z.number().int().nonnegative(),
  memoryUsageMb: z.number().nonnegative(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
