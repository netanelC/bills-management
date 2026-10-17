import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MergeMerchantsSchema, UpdateMerchantSchema } from '@bills/shared';
import type { AppDatabase, SqliteDatabase } from '@bills/db';
import { MerchantsRepository } from './repository.js';
import { MerchantsService } from './service.js';

const IdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export interface MerchantsRoutesOptions {
  db: AppDatabase;
  sqlite: SqliteDatabase;
}

export async function registerMerchantsRoutes(
  app: FastifyInstance,
  options: MerchantsRoutesOptions,
): Promise<void> {
  const repository = new MerchantsRepository(options.db, options.sqlite);
  const service = new MerchantsService(repository);

  app.get('/api/inbox', async (_request, reply) => {
    const inbox = service.getInbox();
    return reply.status(200).send(inbox);
  });

  app.get('/api/merchants', async (_request, reply) => {
    const merchants = service.listMerchants();
    return reply.status(200).send({ merchants });
  });

  app.patch('/api/merchants/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    const input = UpdateMerchantSchema.parse(request.body);
    const updated = service.updateMerchant(id, input);
    return reply.status(200).send(updated);
  });

  app.post('/api/merchants/merge', async (request, reply) => {
    const input = MergeMerchantsSchema.parse(request.body);
    const merged = service.mergeMerchants(input);
    return reply.status(200).send(merged);
  });
}
