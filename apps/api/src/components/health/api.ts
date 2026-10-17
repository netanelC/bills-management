import type { FastifyInstance } from 'fastify';
import type { SqliteDatabase } from '@bills/db';
import { HealthService } from './service.js';

export interface HealthRoutesOptions {
  sqlite: SqliteDatabase;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRoutesOptions,
): Promise<void> {
  const healthService = new HealthService(options.sqlite);

  app.get('/api/health', async (_request, reply) => {
    const status = healthService.checkHealth();
    return reply.status(200).send(status);
  });
}
