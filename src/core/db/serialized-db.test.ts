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
});
