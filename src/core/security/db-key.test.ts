import { getOrCreateDbKey, MissingDbKeyError, type KeyStore } from '@/core/security/db-key';

const KEY = 'a'.repeat(64);

function fakeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const set = jest.fn(async (name: string, value: string) => {
    data.set(name, value);
  });
  const store: KeyStore = { get: async (name) => data.get(name) ?? null, set };
  return { store, set, data };
}

const randomHex = () => 'b'.repeat(64);

describe('getOrCreateDbKey', () => {
  it('returns the stored key when present', async () => {
    const { store, set } = fakeStore({ 'selfjournal.db-key': KEY });
    await expect(getOrCreateDbKey({ store, dbFileExists: true, randomHex })).resolves.toBe(KEY);
    expect(set).not.toHaveBeenCalled();
  });

  it('creates and stores a new key when none exists and there is no DB file', async () => {
    const { store, set, data } = fakeStore();
    const key = await getOrCreateDbKey({ store, dbFileExists: false, randomHex });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(set).toHaveBeenCalledWith('selfjournal.db-key', key);
    expect(data.get('selfjournal.db-key')).toBe(key);
  });

  it('throws MissingDbKeyError when the DB file exists but the key is gone', async () => {
    const { store, set } = fakeStore();
    await expect(getOrCreateDbKey({ store, dbFileExists: true, randomHex })).rejects.toBeInstanceOf(
      MissingDbKeyError,
    );
    expect(set).not.toHaveBeenCalled();
  });
});
