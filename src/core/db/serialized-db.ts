import type { Db, SqlParam } from '@/core/db/types';

/** Primitive operations on a single connection. */
export interface RawDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

/**
 * Wraps a single connection so every outer call is serialized (FIFO), and a transaction holds
 * the lock for its whole duration. Inside `transaction`, work must go through the `tx` handle,
 * which bypasses the lock. Unrelated writes therefore can never join (or be rolled back by)
 * someone else's transaction.
 */
export function createSerializedDb(raw: RawDb): Db {
  let tail: Promise<unknown> = Promise.resolve();
  const locked = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  };

  const tx: Db = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params) => raw.run(sql, params),
    all: <T>(sql: string, params?: SqlParam[]) => raw.all<T>(sql, params),
    first: <T>(sql: string, params?: SqlParam[]) => raw.first<T>(sql, params),
    transaction: (fn) => fn(tx), // nested: joins the outer transaction
  };

  return {
    exec: (sql) => locked(() => raw.exec(sql)),
    run: (sql, params) => locked(() => raw.run(sql, params)),
    all: <T>(sql: string, params?: SqlParam[]) => locked(() => raw.all<T>(sql, params)),
    first: <T>(sql: string, params?: SqlParam[]) => locked(() => raw.first<T>(sql, params)),
    transaction: (fn) =>
      locked(async () => {
        await raw.exec('BEGIN');
        try {
          await fn(tx);
        } catch (e) {
          await raw.exec('ROLLBACK').catch(() => undefined);
          throw e;
        }
        await raw.exec('COMMIT');
      }),
  };
}
