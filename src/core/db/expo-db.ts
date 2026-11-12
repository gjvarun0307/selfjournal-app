import { openDatabaseAsync } from 'expo-sqlite';
import type { Db, SqlParam } from '@/core/db/types';
import { DB_NAME, DbKeyError } from '@/core/security/db-key';

export async function openEncryptedDb(hexKey: string): Promise<Db> {
  // Validate before interpolating: PRAGMA key cannot be parameterised.
  if (!/^[0-9a-f]{64}$/.test(hexKey)) {
    throw new DbKeyError('Stored database key is malformed.');
  }
  const db = await openDatabaseAsync(DB_NAME);
  try {
    // Must be the first statement on the connection.
    await db.execAsync(`PRAGMA key = "x'${hexKey}'"`);
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch {
    await db.closeAsync().catch(() => undefined);
    throw new DbKeyError();
  }
  await db.execAsync('PRAGMA foreign_keys = ON');

  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlParam[] = []) => db.getFirstAsync<T>(sql, params),
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}
