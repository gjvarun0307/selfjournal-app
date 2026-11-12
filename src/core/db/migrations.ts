import type { Db } from '@/core/db/types';

export interface Migration {
  /** Format "<owner>:<NNN>", e.g. "core:001". */
  id: string;
  up: string;
}

export async function runMigrations(db: Db, migrations: Migration[]): Promise<string[]> {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const done = new Set(
    (await db.all<{ id: string }>('SELECT id FROM _migrations')).map((r) => r.id),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.transaction(async () => {
      await db.exec(m.up);
      await db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [
        m.id,
        new Date().toISOString(),
      ]);
    });
    applied.push(m.id);
  }
  return applied;
}
