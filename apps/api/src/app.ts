import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { AppDatabase, SqliteDatabase } from '@bills/db';
import { registerErrorHandlers } from './errors/app-error.js';
import { registerHealthRoutes } from './components/health/api.js';
import { registerHouseholdRoutes } from './components/household/api.js';
import { registerStatementsRoutes } from './components/statements/api.js';

export interface BuildServerOptions {
  db: AppDatabase;
  sqlite: SqliteDatabase;
  logger?: boolean;
  corsOrigin?: string;
}

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: options.corsOrigin ?? true,
  });

  registerErrorHandlers(app);

  await app.register(registerHealthRoutes, {
    sqlite: options.sqlite,
  });

  await app.register(registerHouseholdRoutes, {
    db: options.db,
  });

  await app.register(registerStatementsRoutes, {
    db: options.db,
    sqlite: options.sqlite,
  });

  return app;
}

