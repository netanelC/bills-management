import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import {
  BillingMonthSchema,
  StatementCommitRequestSchema,
  StatementPreviewJsonRequestSchema,
  UpdateTransactionSchema,
} from '@bills/shared';
import type { AppDatabase, SqliteDatabase } from '@bills/db';
import { AppError } from '../../errors/app-error.js';
import { StatementsRepository } from './repository.js';
import { StatementsService, type PreviewFilePayload } from './service.js';

const TransactionsQuerySchema = z.object({
  billingMonth: BillingMonthSchema.optional(),
  cardholderId: z.string().trim().min(1).optional(),
  cardId: z.string().trim().min(1).optional(),
});

const TransactionIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export interface StatementsRoutesOptions {
  db: AppDatabase;
  sqlite: SqliteDatabase;
}

export async function registerStatementsRoutes(
  app: FastifyInstance,
  options: StatementsRoutesOptions,
): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 25,
    },
  });

  const repository = new StatementsRepository(options.db, options.sqlite);
  const service = new StatementsService(repository);

  app.post('/api/statements/preview', async (request, reply) => {
    const payloads: PreviewFilePayload[] = [];

    if (request.isMultipart()) {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await part.toBuffer();
          payloads.push({
            filename: part.filename || 'statement.xls',
            buffer,
          });
        }
      }

      if (payloads.length === 0) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          httpCode: 400,
          description: 'At least one statement file must be uploaded',
        });
      }
    } else {
      const parsedBody = StatementPreviewJsonRequestSchema.parse(request.body);
      for (const file of parsedBody.files) {
        payloads.push({
          filename: file.filename,
          buffer: file.contentBase64
            ? Buffer.from(file.contentBase64, 'base64')
            : undefined,
          contentText: file.contentText,
          columnMapping: file.columnMapping,
          cardLastFourOverride: file.cardLastFourOverride,
          billingMonthOverride: file.billingMonthOverride,
          providerOverride: file.providerOverride,
        });
      }
    }

    const result = service.previewStatements(payloads);
    return reply.status(200).send(result);
  });

  app.post('/api/statements/commit', async (request, reply) => {
    const input = StatementCommitRequestSchema.parse(request.body);
    const result = service.commitStatements(input);
    return reply.status(201).send(result);
  });

  app.get('/api/coverage', async (_request, reply) => {
    const matrix = service.getCoverageMatrix();
    return reply.status(200).send(matrix);
  });

  app.get('/api/transactions', async (request, reply) => {
    const query = TransactionsQuerySchema.parse(request.query);
    const transactions = service.listTransactions(query);
    return reply.status(200).send({ transactions });
  });

  app.patch('/api/transactions/:id', async (request, reply) => {
    const params = TransactionIdParamsSchema.parse(request.params);
    const input = UpdateTransactionSchema.parse(request.body);
    const updated = service.updateTransaction(params.id, input);
    return reply.status(200).send(updated);
  });
}
