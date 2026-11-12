import { createTestDb } from '@/core/db/test-db';

async function setup() {
  const db = createTestDb();
  await db.exec('CREATE TABLE t (v TEXT)');
  return db;
}
const values = async (db: Awaited<ReturnType<typeof setup>>) =>
  (await db.all<{ v: string }>('SELECT v FROM t ORDER BY v')).map((r) => r.v);

describe('createSerializedDb', () => {
  it('a write outside a failing transaction is not rolled back', async () => {
    const db = await setup();
    const txn = db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', ['A']);
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('boom');
    });
    const outside = db.run('INSERT INTO t (v) VALUES (?)', ['B']);
    await expect(txn).rejects.toThrow('boom');
    await outside;
    expect(await values(db)).toEqual(['B']);
  });

  it('nested tx.transaction joins the outer transaction', async () => {
    const db = await setup();
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run('INSERT INTO t (v) VALUES (?)', ['inner']);
        });
        throw new Error('outer fails');
      }),
    ).rejects.toThrow('outer fails');
    expect(await values(db)).toEqual([]);
  });

  it('commits on success', async () => {
    const db = await setup();
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', ['ok']);
    });
    expect(await values(db)).toEqual(['ok']);
  });

  it('a failed COMMIT is rolled back and does not wedge later work', async () => {
    const db = createTestDb();
    await db.exec('PRAGMA foreign_keys = ON');
    await db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    await db.exec(
      'CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED)',
    );
    await db.exec('CREATE TABLE t (v TEXT)');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO child (pid) VALUES (999)');
      }),
    ).rejects.toThrow(/FOREIGN KEY/i);
    await db.run('INSERT INTO t (v) VALUES (?)', ['after']);
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', ['tx']);
    });
    expect((await db.all<{ v: string }>('SELECT v FROM t ORDER BY v')).map((r) => r.v)).toEqual(['after', 'tx']);
    expect(await db.all('SELECT * FROM child')).toEqual([]);
  });
});
