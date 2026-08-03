import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetXavierSyncScheduler, localFallbackStorage, xavierAdd, xavierSearch } from '../xavier';

describe('Xavier local fallback (InMemoryStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    localFallbackStorage.clear();
    __resetXavierSyncScheduler();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localFallbackStorage.clear();
    __resetXavierSyncScheduler();
  });

  it('stores and retrieves memories in InMemoryStorage when Xavier server is down', async () => {
    // Mock fetch to simulate Xavier server being unreachable (returns null in xavierFetch)
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    // Suppress expected console.warn outputs during unreachable state
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Try adding memory
    const addResult = await xavierAdd('test/path', '{"key": "value"}');

    // Should return unreachable but save locally
    expect(addResult.ok).toBe(false);
    if (addResult.ok) throw new Error('expected unreachable failure');
    expect(addResult.reason).toBe('unreachable');

    // Search for the memory
    const searchResult = await xavierSearch('value');

    // Should return the local fallback results despite server being down
    expect(searchResult.ok).toBe(false);
    if (searchResult.ok) throw new Error('expected unreachable failure');
    expect(searchResult.reason).toBe('unreachable');
    expect(searchResult.results).toHaveLength(1);

    const firstResult = searchResult.results[0] as { path: string; content: string };
    expect(firstResult.path).toContain('test/path');
    expect(firstResult.content).toBe('{"key": "value"}');

    expect(warnMock).toHaveBeenCalled();
  });

  it('can clear the localFallbackStorage', async () => {
    localFallbackStorage.add('another/path', 'secret info');
    expect(localFallbackStorage.search('secret')).toHaveLength(1);

    localFallbackStorage.clear();
    expect(localFallbackStorage.search('secret')).toHaveLength(0);
  });
});
