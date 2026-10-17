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

export const CardholderSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  createdAt: z.string(),
});
export type CardholderDto = z.infer<typeof CardholderSchema>;

export const CreateCardholderSchema = z
  .object({
    name: z.string().trim().min(1, 'Cardholder name cannot be empty'),
  })
  .strict();
export type CreateCardholderInput = z.infer<typeof CreateCardholderSchema>;

export const UpdateCardholderSchema = CreateCardholderSchema;
export type UpdateCardholderInput = z.infer<typeof UpdateCardholderSchema>;

export const CardSchema = z.object({
  id: z.string().min(1),
  cardholderId: z.string().min(1),
  lastFourDigits: z
    .string()
    .regex(/^\d{4}$/, 'Last four digits must be exactly 4 numeric digits'),
  provider: CardProviderSchema,
  nickname: z.string().trim().min(1),
  createdAt: z.string(),
});
export type CardDto = z.infer<typeof CardSchema>;

export const CreateCardSchema = z
  .object({
    cardholderId: z.string().trim().min(1, 'cardholderId is required'),
    lastFourDigits: z
      .string()
      .regex(/^\d{4}$/, 'Last four digits must be exactly 4 numeric digits'),
    provider: CardProviderSchema,
    nickname: z.string().trim().min(1, 'Card nickname is required'),
  })
  .strict();
export type CreateCardInput = z.infer<typeof CreateCardSchema>;

export const UpdateCardSchema = CreateCardSchema.partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  spendingNature: SpendingNatureSchema,
  color: z.string().trim().min(1),
  budgetTargetIls: z.number().positive().nullable(),
  sortOrder: z.number().int(),
});
export type CategoryDto = z.infer<typeof CategorySchema>;

export const CreateCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required'),
    spendingNature: SpendingNatureSchema,
    color: z.string().trim().min(1, 'Category color is required'),
    budgetTargetIls: z.number().positive().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const UpdateCategorySchema = CreateCategorySchema.partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
