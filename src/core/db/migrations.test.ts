import { createTestDb } from '@/core/db/test-db';
import { runMigrations, type Migration } from '@/core/db/migrations';
import { CORE_MIGRATIONS } from '@/core/db/core-migrations';

const a: Migration = { id: 't:001', up: 'CREATE TABLE ta(x INT);' };
const b: Migration = { id: 't:002', up: 'CREATE TABLE tb(x INT);' };

const tables = async (db: ReturnType<typeof createTestDb>) =>
  (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);

describe('runMigrations', () => {
  it('applies pending migrations in order and records them', async () => {
    const db = createTestDb();
    expect(await runMigrations(db, [a, b])).toEqual(['t:001', 't:002']);
    const names = await tables(db);
    expect(names).toEqual(expect.arrayContaining(['ta', 'tb']));
    const rows = await db.all<{ id: string }>('SELECT id FROM _migrations ORDER BY rowid');
    expect(rows.map((r) => r.id)).toEqual(['t:001', 't:002']);
  });

  it('is idempotent', async () => {
    const db = createTestDb();
    await runMigrations(db, [a, b]);
    expect(await runMigrations(db, [a, b])).toEqual([]);
  });

  it('rolls back a failing migration without recording it', async () => {
    const db = createTestDb();
    const bad: Migration = {
      id: 't:002',
      up: 'CREATE TABLE half(x INT); INSERT INTO nope VALUES (1);',
    };
    await expect(runMigrations(db, [a, bad])).rejects.toThrow();
    const rows = await db.all<{ id: string }>('SELECT id FROM _migrations');
    expect(rows.map((r) => r.id)).toEqual(['t:001']);
    expect(await tables(db)).not.toContain('half');
  });

  it('CORE_MIGRATIONS create app_settings, plugin_state and media', async () => {
    const db = createTestDb();
    expect(await runMigrations(db, CORE_MIGRATIONS)).toEqual(['core:001', 'core:002']);
    const names = await tables(db);
    expect(names).toEqual(expect.arrayContaining(['app_settings', 'plugin_state', 'media']));
  });
});
