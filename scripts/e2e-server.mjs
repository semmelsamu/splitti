// Server for the Playwright tests: the production build on its own port with a fresh, empty data folder.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.tmp/e2e-data');
fs.rmSync(dir, { recursive: true, force: true });

process.env.DATA_DIR = dir;
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.E2E_PORT ?? '4317';

await import('./start.mjs');
