// Test-only: wraps better-sqlite3 behind the async Db interface.
import BetterSqlite3 from 'better-sqlite3';
import { createSerializedDb } from '@/core/db/serialized-db';
import type { Db, SqlParam } from '@/core/db/types';

export function createTestDb(): Db {
  const sqlite = new BetterSqlite3(':memory:');
  return createSerializedDb({
    async exec(sql) {
      sqlite.exec(sql);
    },
    async run(sql, params: SqlParam[] = []) {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlParam[] = []) {
      return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
    },
  });
}
