import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CARDHOLDERS, DEFAULT_CATEGORIES } from '@bills/domain';

export function resetDatabase(databasePath = './data/bills.sqlite'): void {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('DELETE FROM transactions;');
  db.exec('DELETE FROM statements;');
  db.exec('DELETE FROM merchant_aliases;');
  db.exec('DELETE FROM merchants;');
  db.exec('DELETE FROM cards;');
  db.exec('DELETE FROM categories;');
  db.exec('DELETE FROM cardholders;');

  const now = new Date().toISOString();
  const insertCardholder = db.prepare(
    'INSERT INTO cardholders (id, name, created_at) VALUES (?, ?, ?)',
  );
  for (const ch of DEFAULT_CARDHOLDERS) {
    insertCardholder.run(ch.id, ch.name, now);
  }

  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, spending_nature, color, budget_target_ils, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const cat of DEFAULT_CATEGORIES) {
    insertCategory.run(
      cat.id,
      cat.name,
      cat.spendingNature,
      cat.color,
      null,
      cat.sortOrder,
    );
  }

  db.exec('PRAGMA foreign_keys = ON;');
  db.close();
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const dbPath = process.env.DATABASE_PATH ?? './data/bills.sqlite';
  resetDatabase(dbPath);
  // eslint-disable-next-line no-console
  console.log(`Database at ${dbPath} has been successfully reset to empty initial state.`);
}
