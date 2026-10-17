import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CreateCardholderSchema,
  CreateCardSchema,
  CreateCategorySchema,
  UpdateCardholderSchema,
  UpdateCardSchema,
  UpdateCategorySchema,
} from '@bills/shared';
import type { AppDatabase } from '@bills/db';
import { HouseholdRepository } from './repository.js';
import { HouseholdService } from './service.js';

const IdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export interface HouseholdRoutesOptions {
  db: AppDatabase;
}

export async function registerHouseholdRoutes(
  app: FastifyInstance,
  options: HouseholdRoutesOptions,
): Promise<void> {
  const repository = new HouseholdRepository(options.db);
  const service = new HouseholdService(repository);

  app.get('/api/cardholders', async (_request, reply) => {
    const cardholders = service.listCardholders();
    return reply.status(200).send({ cardholders });
  });

  app.post('/api/cardholders', async (request, reply) => {
    const input = CreateCardholderSchema.parse(request.body);
    const created = service.createCardholder(input);
    return reply.status(201).send(created);
  });

  app.patch('/api/cardholders/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    const input = UpdateCardholderSchema.parse(request.body);
    const updated = service.updateCardholder(id, input);
    return reply.status(200).send(updated);
  });

  app.delete('/api/cardholders/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    service.deleteCardholder(id);
    return reply.status(204).send();
  });

  app.get('/api/cards', async (_request, reply) => {
    const cards = service.listCards();
    return reply.status(200).send({ cards });
  });

  app.post('/api/cards', async (request, reply) => {
    const input = CreateCardSchema.parse(request.body);
    const created = service.createCard(input);
    return reply.status(201).send(created);
  });

  app.patch('/api/cards/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    const input = UpdateCardSchema.parse(request.body);
    const updated = service.updateCard(id, input);
    return reply.status(200).send(updated);
  });

  app.delete('/api/cards/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    service.deleteCard(id);
    return reply.status(204).send();
  });

  app.get('/api/categories', async (_request, reply) => {
    const categories = service.listCategories();
    return reply.status(200).send({ categories });
  });

  app.post('/api/categories', async (request, reply) => {
    const input = CreateCategorySchema.parse(request.body);
    const created = service.createCategory(input);
    return reply.status(201).send(created);
  });

  app.patch('/api/categories/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    const input = UpdateCategorySchema.parse(request.body);
    const updated = service.updateCategory(id, input);
    return reply.status(200).send(updated);
  });

  app.delete('/api/categories/:id', async (request, reply) => {
    const { id } = IdParamSchema.parse(request.params);
    service.deleteCategory(id);
    return reply.status(204).send();
  });
}
