// Runtime paths, shared by the app (bundled by Astro) and scripts/start.mjs (plain Node).
// Plain JavaScript on purpose: the start script runs without a build step.
import path from 'node:path';

/**
 * All runtime data lives in one directory: the SQLite file and the receipt images.
 * In the container this is /data (set in the Dockerfile); elsewhere ./data.
 * @returns {string}
 */
export function dataDir() {
  return path.resolve(process.env.DATA_DIR ?? 'data');
}

/** @returns {string} */
export function databaseFile() {
  return path.join(dataDir(), 'splitti.db');
}

/** @returns {string} */
export function migrationsDir() {
  return path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');
}
