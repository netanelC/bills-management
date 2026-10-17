import { afterEach, describe, expect, it } from 'vitest';
import { faker } from '@faker-js/faker';
import { ErrorResponseSchema, HealthResponseSchema } from '@bills/shared';
import {
  createDatabase,
  DOMAIN_TABLES,
  type DatabaseConnection,
} from '@bills/db';
import { buildServer } from '../src/app.js';

describe('API Server & SQLite Foundation Integration', () => {
  let dbConnection: DatabaseConnection | null = null;

  afterEach(() => {
    if (dbConnection) {
      dbConnection.close();
      dbConnection = null;
    }
  });

  it('boots the server, applies SQLite schema migrations cleanly, and returns 200 OK on GET /api/health', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });

    // Act
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    // Assert
    expect(response.statusCode).toBe(200);
    const parsedBody = HealthResponseSchema.parse(response.json());
    expect(parsedBody.status).toBe('ok');
    expect(parsedBody.database).toBe('connected');
    expect(parsedBody.tablesInitialized).toBe(DOMAIN_TABLES.length);
    expect(parsedBody.memoryUsageMb).toBeGreaterThan(0);
  });

  it('returns a standardized 404 JSON error response for unknown routes', async () => {
    // Arrange
    dbConnection = createDatabase(':memory:');
    const app = await buildServer({
      db: dbConnection.db,
      sqlite: dbConnection.sqlite,
      logger: false,
    });
    const unknownPath = `/api/${faker.string.alphanumeric(10)}`;

    // Act
    const response = await app.inject({
      method: 'GET',
      url: unknownPath,
    });

    // Assert
    expect(response.statusCode).toBe(404);
    const parsedError = ErrorResponseSchema.parse(response.json());
    expect(parsedError.error.code).toBe('NOT_FOUND');
  });
});
