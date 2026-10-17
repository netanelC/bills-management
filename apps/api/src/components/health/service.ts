import type { HealthResponse } from '@bills/shared';
import { countInitializedTables, type SqliteDatabase } from '@bills/db';
import { AppError } from '../../errors/app-error.js';

export class HealthService {
  constructor(private readonly sqlite: SqliteDatabase) {}

  public checkHealth(): HealthResponse {
    try {
      const tablesInitialized = countInitializedTables(this.sqlite);
      const memoryUsageMb =
        Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;

      return {
        status: 'ok',
        database: 'connected',
        tablesInitialized,
        memoryUsageMb,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new AppError({
        code: 'DATABASE_UNAVAILABLE',
        httpCode: 503,
        description: 'Database health check failed',
      });
    }
  }
}
