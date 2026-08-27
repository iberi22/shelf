import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVAILABLE_EXERCISES,
  loadTuningHistoryFromXavier,
  runCompressionExercise,
  runFullTuningSession,
  runIndexingExercise,
  runPruningExercise,
  saveTuningResultToXavier,
  type TuningSession,
} from './memoryTuning';
import { localFallbackStorage } from './xavier';

describe('memoryTuning module', () => {
  beforeEach(() => {
    localFallbackStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defines available exercises', () => {
    expect(AVAILABLE_EXERCISES.length).toBe(3);
    expect(AVAILABLE_EXERCISES.map((e) => e.type)).toEqual(['compression', 'indexing', 'pruning']);
  });

  describe('runCompressionExercise', () => {
    it('compresses duplicate text lines and calculates metrics correctly', async () => {
      const result = await runCompressionExercise(['line 1', 'line 1', 'line 2', 'line 2']);
      expect(result.exerciseId).toBe('ex-compression-01');
      expect(result.type).toBe('compression');
      expect(result.originalSize).toBeGreaterThan(result.optimizedSize);
      expect(result.efficiencyGainPct).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('handles empty input gracefully', async () => {
      const result = await runCompressionExercise([]);
      expect(result.originalSize).toBe(0);
      expect(result.optimizedSize).toBe(0);
      expect(result.efficiencyGainPct).toBe(0);
    });
  });

  describe('runIndexingExercise', () => {
    it('creates a unique key count map from tokens and computes efficiency', async () => {
      const result = await runIndexingExercise(['apple', 'banana', 'apple', 'cherry']);
      expect(result.exerciseId).toBe('ex-indexing-02');
      expect(result.type).toBe('indexing');
      expect(result.efficiencyGainPct).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('runPruningExercise', () => {
    it('prunes stale items according to age and accessCount', async () => {
      const memories = [
        { id: '1', ageDays: 5, accessCount: 10 },
        { id: '2', ageDays: 60, accessCount: 0 },
      ];
      const result = await runPruningExercise(memories);
      expect(result.exerciseId).toBe('ex-pruning-03');
      expect(result.originalSize).toBe(2);
      expect(result.optimizedSize).toBe(1);
      expect(result.efficiencyGainPct).toBe(50);
    });
  });

  describe('runFullTuningSession & Xavier Storage Integration', () => {
    it('executes all exercises, computes session totals, and persists to Xavier memory', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'mem-123' }) });
      vi.stubGlobal('fetch', fetchMock);

      const session = await runFullTuningSession();

      expect(session.id).toBeDefined();
      expect(session.results.length).toBe(3);
      expect(session.totalScore).toBeGreaterThanOrEqual(0);
      expect(session.averageEfficiencyGain).toBeGreaterThanOrEqual(0);

      // Verify Xavier storage invocation
      expect(fetchMock).toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/memory/add');
      const payload = JSON.parse(String(init.body));
      expect(payload.path).toContain('tuning/sessions/');
      const content = JSON.parse(payload.content);
      expect(content.kind).toBe('tuning-session');
      expect(content.id).toBe(session.id);
    });

    it('loads tuning history from Xavier fallback storage when offline', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal('fetch', fetchMock);

      const testSession: TuningSession = {
        id: 'session-offline-1',
        timestamp: new Date().toISOString(),
        totalScore: 85,
        averageEfficiencyGain: 32.5,
        results: [],
      };

      await saveTuningResultToXavier(testSession);

      const history = await loadTuningHistoryFromXavier();
      expect(history.length).toBe(1);
      expect(history[0]?.id).toBe('session-offline-1');
      expect(history[0]?.totalScore).toBe(85);
    });
  });
});
