import { createDatabase } from '@bills/db';
import { buildServer } from './app.js';
import { loadEnv } from './config/env.js';

async function start(): Promise<void> {
  const env = loadEnv();
  const dbConnection = createDatabase(env.DATABASE_PATH);

  const app = await buildServer({
    db: dbConnection.db,
    sqlite: dbConnection.sqlite,
    logger: env.NODE_ENV !== 'test',
    corsOrigin: env.CORS_ORIGIN,
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string, exitCode: number = 0): Promise<void> => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    app.log.info({ signal }, 'Shutting down server gracefully');
    try {
      await app.close();
      dbConnection.close();
    } catch (error) {
      app.log.error({ err: error }, 'Error during graceful shutdown');
    } finally {
      process.exit(exitCode);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });

  await app.listen({ host: env.HOST, port: env.PORT });
}

void start();
