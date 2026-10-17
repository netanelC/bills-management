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
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])$/,
    'Billing Month must be in YYYY-MM format',
  ) as unknown as z.ZodType<`${number}-${string}`, z.ZodTypeDef, string>;
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

export const ColumnMappingOverrideSchema = z
  .object({
    purchaseDateIndex: z.number().int().nonnegative(),
    rawMerchantNameIndex: z.number().int().nonnegative(),
    billedAmountIlsIndex: z.number().int().nonnegative(),
    originalAmountIndex: z.number().int().nonnegative().nullable().optional(),
    originalCurrencyIndex: z.number().int().nonnegative().nullable().optional(),
    remarksIndex: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();
export type ColumnMappingOverrideDto = z.infer<
  typeof ColumnMappingOverrideSchema
>;

export const ParsedTransactionPreviewSchema = z.object({
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rawMerchantName: z.string().min(1),
  normalizedMerchantName: z.string().min(1),
  billedAmountIls: z.number(),
  originalAmount: z.number(),
  originalCurrency: z.string().min(1),
  installmentCurrent: z.number().int().positive().nullable(),
  installmentTotal: z.number().int().positive().nullable(),
  installmentTotalAmountIls: z.number().nullable(),
  occurrenceIndexWithinStatement: z.number().int().nonnegative(),
  dedupFingerprint: z.string().min(1),
  isDuplicate: z.boolean(),
});
export type ParsedTransactionPreviewDto = z.infer<
  typeof ParsedTransactionPreviewSchema
>;

export const StatementPreviewFileItemSchema = z.object({
  filename: z.string().min(1),
  detectedLastFour: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  detectedProvider: CardProviderSchema,
  existingCard: CardSchema.nullable(),
  detectedBillingMonth: BillingMonthSchema.nullable(),
  requiresColumnMapping: z.boolean(),
  availableHeaders: z.array(z.string()),
  sampleRows: z.array(z.array(z.string())),
  newTransactionsCount: z.number().int().nonnegative(),
  duplicateTransactionsCount: z.number().int().nonnegative(),
  totalBilledIls: z.number(),
  transactions: z.array(ParsedTransactionPreviewSchema),
});
export type StatementPreviewFileItemDto = z.infer<
  typeof StatementPreviewFileItemSchema
>;

export const StatementPreviewResponseSchema = z.object({
  files: z.array(StatementPreviewFileItemSchema),
});
export type StatementPreviewResponseDto = z.infer<
  typeof StatementPreviewResponseSchema
>;

export const StatementPreviewJsonFileSchema = z
  .object({
    filename: z.string().trim().min(1),
    contentBase64: z.string().optional(),
    contentText: z.string().optional(),
    columnMapping: ColumnMappingOverrideSchema.optional(),
    cardLastFourOverride: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    billingMonthOverride: BillingMonthSchema.optional(),
    providerOverride: CardProviderSchema.optional(),
  })
  .strict();
export type StatementPreviewJsonFileInput = z.infer<
  typeof StatementPreviewJsonFileSchema
>;

export const StatementPreviewJsonRequestSchema = z
  .object({
    files: z.array(StatementPreviewJsonFileSchema).min(1),
  })
  .strict();
export type StatementPreviewJsonRequestInput = z.infer<
  typeof StatementPreviewJsonRequestSchema
>;

export const NewCardOnboardingSchema = z
  .object({
    cardholderId: z.string().trim().min(1, 'cardholderId is required'),
    nickname: z.string().trim().min(1, 'Card nickname is required'),
    provider: CardProviderSchema.optional(),
  })
  .strict();
export type NewCardOnboardingInput = z.infer<typeof NewCardOnboardingSchema>;

export const StatementCommitTransactionInputSchema = z
  .object({
    purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rawMerchantName: z.string().min(1),
    normalizedMerchantName: z.string().optional(),
    billedAmountIls: z.number(),
    originalAmount: z.number(),
    originalCurrency: z.string().min(1),
    installmentCurrent: z.number().int().positive().nullable(),
    installmentTotal: z.number().int().positive().nullable(),
    installmentTotalAmountIls: z.number().nullable(),
    occurrenceIndexWithinStatement: z.number().int().nonnegative().optional(),
    dedupFingerprint: z.string().min(1),
    isDuplicate: z.boolean().optional(),
  })
  .strict();
export type StatementCommitTransactionInput = z.infer<
  typeof StatementCommitTransactionInputSchema
>;

export const StatementCommitFileInputSchema = z
  .object({
    filename: z.string().trim().min(1),
    cardLastFour: z
      .string()
      .regex(/^\d{4}$/, 'Last four digits must be 4 numeric digits'),
    billingMonth: BillingMonthSchema,
    provider: CardProviderSchema,
    newCardOnboarding: NewCardOnboardingSchema.optional(),
    transactions: z.array(StatementCommitTransactionInputSchema),
  })
  .strict();
export type StatementCommitFileInput = z.infer<
  typeof StatementCommitFileInputSchema
>;

export const StatementCommitRequestSchema = z
  .object({
    files: z.array(StatementCommitFileInputSchema).min(1),
  })
  .strict();
export type StatementCommitRequestInput = z.infer<
  typeof StatementCommitRequestSchema
>;

export const StatementCommitResponseSchema = z.object({
  importedStatementsCount: z.number().int().nonnegative(),
  newCardsCount: z.number().int().nonnegative(),
  newTransactionsCount: z.number().int().nonnegative(),
  skippedDuplicatesCount: z.number().int().nonnegative(),
  cards: z.array(CardSchema),
});
export type StatementCommitResponseDto = z.infer<
  typeof StatementCommitResponseSchema
>;

export const CoverageCellSchema = z.object({
  hasStatement: z.boolean(),
  statementId: z.string().nullable(),
  totalBilledIls: z.number(),
  transactionsCount: z.number().int().nonnegative(),
});
export type CoverageCellDto = z.infer<typeof CoverageCellSchema>;

export const CardCoverageRowSchema = z.object({
  card: CardSchema,
  cardholderName: z.string(),
  cells: z.record(z.string(), CoverageCellSchema),
});
export type CardCoverageRowDto = z.infer<typeof CardCoverageRowSchema>;

export const CoverageMatrixResponseSchema = z.object({
  billingMonths: z.array(BillingMonthSchema),
  cards: z.array(CardCoverageRowSchema),
});
export type CoverageMatrixResponseDto = z.infer<
  typeof CoverageMatrixResponseSchema
>;

export const TransactionListItemSchema = z.object({
  id: z.string(),
  statementId: z.string(),
  cardId: z.string(),
  cardLastFourDigits: z.string(),
  cardNickname: z.string(),
  cardProvider: CardProviderSchema,
  cardholderId: z.string(),
  cardholderName: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  billingMonth: BillingMonthSchema,
  purchaseDate: z.string(),
  rawMerchantName: z.string(),
  billedAmountIls: z.number(),
  originalAmount: z.number(),
  originalCurrency: z.string(),
  installmentCurrent: z.number().int().positive().nullable(),
  installmentTotal: z.number().int().positive().nullable(),
  installmentTotalAmountIls: z.number().nullable(),
  categoryOverrideId: z.string().nullable(),
  effectiveCategoryId: z.string().nullable(),
  effectiveCategoryName: z.string().nullable(),
  notes: z.string().nullable(),
  isExcluded: z.boolean(),
});
export type TransactionListItemDto = z.infer<typeof TransactionListItemSchema>;

export const TransactionsListResponseSchema = z.object({
  transactions: z.array(TransactionListItemSchema),
});
export type TransactionsListResponseDto = z.infer<
  typeof TransactionsListResponseSchema
>;

