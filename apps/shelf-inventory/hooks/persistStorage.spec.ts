import { describe, expect, it } from 'vitest';
import {
  createMemoryPersistStorage,
  migratePersistedState,
  unwrapPersistedState,
  wrapPersistedState,
} from './persistStorage';

describe('persistStorage', () => {
  describe('createMemoryPersistStorage', () => {
    it('memory round trip', async () => {
      const storage = createMemoryPersistStorage();
      await storage.save('testKey', 'testValue');
      const loaded = await storage.load('testKey');
      expect(loaded).toBe('testValue');
    });

    it('overwrite existing key', async () => {
      const storage = createMemoryPersistStorage();
      await storage.save('testKey', 'initialValue');
      await storage.save('testKey', 'newValue');
      const loaded = await storage.load('testKey');
      expect(loaded).toBe('newValue');
    });

    it('load of missing key returns null', async () => {
      const storage = createMemoryPersistStorage();
      const loaded = await storage.load('missingKey');
      expect(loaded).toBeNull();
    });

    it('independence between two memory instances', async () => {
      const storage1 = createMemoryPersistStorage();
      const storage2 = createMemoryPersistStorage();

      await storage1.save('key', 'value1');
      await storage2.save('key', 'value2');

      expect(await storage1.load('key')).toBe('value1');
      expect(await storage2.load('key')).toBe('value2');
    });
  });

  describe('pure wrappers', () => {
    it('persisted wrapper shape', () => {
      const state = { a: 1, b: 'test' };
      const wrapped = wrapPersistedState(state);

      expect(wrapped).toHaveProperty('__shelfStorageVersion');
      expect(wrapped.__shelfStorageVersion).toBe(2);
      expect(wrapped).toHaveProperty('appVersion');
      expect(wrapped).toHaveProperty('persistedAt');
      expect(wrapped).toHaveProperty('state');
      expect(wrapped.state).toEqual(state);

      const unwrapped = unwrapPersistedState(wrapped);
      expect(unwrapped).toEqual(state);
    });

    it('normalization of an older snapshot', () => {
      const initialState = { a: 1, b: 'test', c: [1, 2], d: { nested: true } };

      // Simulating a state saved when 'c' and 'd' didn't exist in the schema
      const oldSnapshot = { a: 2, b: 'old' };
      const wrapped = wrapPersistedState(oldSnapshot);

      // Simulate version mismatch or just direct unwrapping + migrating
      const migrated = migratePersistedState(wrapped, initialState);

      expect(migrated).toEqual({
        a: 2,
        b: 'old',
        c: [1, 2],
        d: { nested: true },
      });
    });
  });
});
