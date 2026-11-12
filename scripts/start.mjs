// Production entry point: apply pending database migrations, then start the server.
// A failed migration stops the process before it accepts any request.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databaseFile, dataDir, migrationsDir } from '../src/server/config.mjs';

fs.mkdirSync(dataDir(), { recursive: true });

const sqlite = new Database(databaseFile());
try {
  migrate(drizzle(sqlite), { migrationsFolder: migrationsDir() });
} finally {
  sqlite.close();
}
console.log(`[splitti] Datenbank bereit: ${databaseFile()}`);

// Node runs as PID 1 in the container and would otherwise ignore the stop signal,
// so `docker compose down` would wait for its timeout.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => process.exit(0));
}

await import('../dist/server/entry.mjs');
