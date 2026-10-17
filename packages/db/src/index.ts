import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { seedDefaultHouseholdData } from './seed.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export const DOMAIN_TABLES = [
  'cardholders',
  'cards',
  'categories',
  'merchants',
  'merchant_aliases',
  'statements',
  'transactions',
] as const;

export interface PreparedStatement<TRow = unknown> {
  run: (...params: SQLInputValue[]) => {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  all: (...params: SQLInputValue[]) => TRow[];
  get: (...params: SQLInputValue[]) => TRow | undefined;
  raw: () => {
    all: (...params: SQLInputValue[]) => unknown[][];
    get: (...params: SQLInputValue[]) => unknown[] | undefined;
  };
}

export interface SqliteDatabase {
  prepare: <TRow = unknown>(sql: string) => PreparedStatement<TRow>;
  exec: (sql: string) => void;
  pragma: (pragmaStatement: string) => void;
  transaction: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
  ) => ((...args: TArgs) => TResult) & {
    deferred: (...args: TArgs) => TResult;
    immediate: (...args: TArgs) => TResult;
    exclusive: (...args: TArgs) => TResult;
  };
  close: () => void;
  readonly open: boolean;
}

export interface DatabaseConnection {
  db: AppDatabase;
  sqlite: SqliteDatabase;
  close: () => void;
}

function createSqliteAdapter(rawDb: DatabaseSync): SqliteDatabase {
  let isOpen = true;

  return {
    get open(): boolean {
      return isOpen;
    },
    prepare<TRow = unknown>(sql: string): PreparedStatement<TRow> {
      const stmt = rawDb.prepare(sql);
      return {
        run: (...params: SQLInputValue[]) => stmt.run(...params),
        all: (...params: SQLInputValue[]) => {
          stmt.setReturnArrays(false);
          return stmt.all(...params) as TRow[];
        },
        get: (...params: SQLInputValue[]) => {
          stmt.setReturnArrays(false);
          return stmt.get(...params) as TRow | undefined;
        },
        raw: () => ({
          all: (...params: SQLInputValue[]) => {
            stmt.setReturnArrays(true);
            return stmt.all(...params) as unknown as unknown[][];
          },
          get: (...params: SQLInputValue[]) => {
            stmt.setReturnArrays(true);
            return stmt.get(...params) as unknown as unknown[] | undefined;
          },
        }),
      };
    },
    exec(sql: string): void {
      rawDb.exec(sql);
    },
    pragma(pragmaStatement: string): void {
      rawDb.exec(`PRAGMA ${pragmaStatement}`);
    },
    transaction<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ) {
      const runWithMode =
        (mode: 'DEFERRED' | 'IMMEDIATE' | 'EXCLUSIVE') =>
        (...args: TArgs): TResult => {
          rawDb.exec(`BEGIN ${mode}`);
          try {
            const result = fn(...args);
            rawDb.exec('COMMIT');
            return result;
          } catch (error) {
            rawDb.exec('ROLLBACK');
            throw error;
          }
        };

      const txFn = Object.assign(runWithMode('DEFERRED'), {
        deferred: runWithMode('DEFERRED'),
        immediate: runWithMode('IMMEDIATE'),
        exclusive: runWithMode('EXCLUSIVE'),
      });

      return txFn;
    },
    close(): void {
      if (isOpen) {
        isOpen = false;
        rawDb.close();
      }
    },
  };
}

function applyMigrations(sqlite: SqliteDatabase): void {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(currentDir, '../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    sqlite.exec(sqlContent);
  }
}

export function countInitializedTables(sqlite: SqliteDatabase): number {
  const placeholders = DOMAIN_TABLES.map(() => '?').join(', ');
  const stmt = sqlite.prepare<{ count: number }>(
    `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
  );
  const row = stmt.get(...DOMAIN_TABLES);
  return row?.count ?? 0;
}

export function createDatabase(
  databasePath: string = ':memory:',
): DatabaseConnection {
  if (databasePath !== ':memory:') {
    const dir = path.dirname(databasePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const rawDb = new DatabaseSync(databasePath);
  const sqlite = createSqliteAdapter(rawDb);
  sqlite.pragma('foreign_keys = ON');
  if (databasePath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  applyMigrations(sqlite);

  const db = drizzle(sqlite as never, {
    schema,
  });

  seedDefaultHouseholdData(db);

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}

export * from './schema.js';
export { seedDefaultHouseholdData } from './seed.js';
export { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

