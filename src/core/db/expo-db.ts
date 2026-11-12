import { openDatabaseAsync } from 'expo-sqlite';
import { createSerializedDb } from '@/core/db/serialized-db';
import type { Db, SqlParam } from '@/core/db/types';
import { DB_NAME, DbKeyError, EncryptionUnavailableError } from '@/core/security/db-key';

export async function openEncryptedDb(hexKey: string): Promise<Db> {
  // Validate before interpolating: PRAGMA key cannot be parameterised.
  if (!/^[0-9a-f]{64}$/.test(hexKey)) {
    throw new DbKeyError('Stored database key is malformed.');
  }
  const db = await openDatabaseAsync(DB_NAME);
  try {
    // Must be the first statement on the connection.
    await db.execAsync(`PRAGMA key = "x'${hexKey}'"`);
    // Without SQLCipher, PRAGMA key is a silent no-op and data would be plaintext.
    const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
    if (!cipher?.cipher_version) {
      await db.closeAsync().catch(() => undefined);
      throw new EncryptionUnavailableError();
    }
    await db.getFirstAsync('SELECT count(*) FROM sqlite_master');
  } catch (e) {
    if (e instanceof EncryptionUnavailableError) throw e;
    await db.closeAsync().catch(() => undefined);
    throw new DbKeyError();
  }
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Single keyed connection; plain BEGIN/COMMIT (not withExclusiveTransactionAsync, which
  // opens a second, un-keyed connection). Serialization is done by createSerializedDb.
  return createSerializedDb({
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
    first: <T>(sql: string, params: SqlParam[] = []) => db.getFirstAsync<T>(sql, params),
  });
}
