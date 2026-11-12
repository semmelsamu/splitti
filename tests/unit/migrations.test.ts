import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../../src/server/db';

const tmpDirs: string[] = [];

function tmpDbFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitti-test-'));
  tmpDirs.push(dir);
  return path.join(dir, 'splitti.db');
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('database migrations', () => {
  it('create the seven tables of the plan on an empty database', () => {
    const db = openDb(tmpDbFile(), path.resolve('drizzle'));
    const tables = db
      .all<{ name: string }>(sql`select name from sqlite_master where type = 'table' order by name`)
      .map((row) => row.name)
      // SQLite's own tables and Drizzle's migration journal are not part of the data model.
      .filter((name) => !name.startsWith('sqlite_') && !name.startsWith('__'));
    expect(tables).toEqual([
      'changes',
      'groups',
      'items',
      'members',
      'payments',
      'receipts',
      'shares',
    ]);
  });

  it('can run again on an existing database without losing data', () => {
    const file = tmpDbFile();
    const first = openDb(file, path.resolve('drizzle'));
    first.run(sql`insert into groups (name, token, created_at) values ('WG', 'abc', '2026-11-12')`);

    const second = openDb(file, path.resolve('drizzle'));
    const rows = second.all<{ name: string }>(sql`select name from groups`);
    expect(rows).toEqual([{ name: 'WG' }]);
  });
});
