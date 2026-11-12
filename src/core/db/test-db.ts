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

/**
 * Wraps a Db so that, inside a transaction, any write whose first parameter is `key` fails, as if the
 * app were killed mid-write. Writes outside transactions are unaffected.
 */
export function failWritesTo(db: Db, key: string): Db {
  return {
    ...db,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, params) => (params?.[0] === key ? Promise.reject(new Error('killed')) : tx.run(sql, params)),
        }),
      ),
  };
}
