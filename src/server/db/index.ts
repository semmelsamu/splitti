import fs from 'node:fs';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databaseFile, dataDir, migrationsDir } from '../config.mjs';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

let instance: Db | undefined;

/** Opens the database and applies pending migrations. Used once per process. */
export function openDb(file: string, migrationsFolder: string): Db {
  const sqlite = new Database(file);
  // Default rollback journal instead of WAL: at rest the database is a single file,
  // so a copy of the data folder is a complete backup.
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

export function getDb(): Db {
  if (!instance) {
    fs.mkdirSync(dataDir(), { recursive: true });
    instance = openDb(databaseFile(), migrationsDir());
  }
  return instance;
}

export { schema };
