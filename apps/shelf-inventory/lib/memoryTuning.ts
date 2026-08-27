import { generateId } from '../utils/id';
import { xavierAdd, xavierSearch } from './xavier';

export type TuningExerciseType = 'compression' | 'indexing' | 'pruning';

export interface TuningExercise {
  id: string;
  title: string;
  description: string;
  type: TuningExerciseType;
  targetEfficiency: number;
}

export interface ExerciseResult {
  exerciseId: string;
  exerciseTitle: string;
  type: TuningExerciseType;
  score: number;
  efficiencyGainPct: number;
  originalSize: number;
  optimizedSize: number;
  executionTimeMs: number;
  details: string;
}

export interface TuningSession {
  id: string;
  timestamp: string;
  totalScore: number;
  averageEfficiencyGain: number;
  results: ExerciseResult[];
}

export const AVAILABLE_EXERCISES: TuningExercise[] = [
  {
    id: 'ex-compression-01',
    title: 'Memory Compression Optimization',
    description: 'Deduplicate redundant records and condense verbose memory payloads to minimize token overhead.',
    type: 'compression',
    targetEfficiency: 35.0,
  },
  {
    id: 'ex-indexing-02',
    title: 'Search Indexing Calibration',
    description: 'Optimize token indexing parameters to balance retrieval precision against RAM footprint.',
    type: 'indexing',
    targetEfficiency: 25.0,
  },
  {
    id: 'ex-pruning-03',
    title: 'Retention & Pruning Policy',
    description: 'Prune low-relevance and decayed memory entries based on access frequency and recency.',
    type: 'pruning',
    targetEfficiency: 40.0,
  },
];

/**
 * Executes a Compression Exercise.
 * Compresses raw text entries by removing duplicate lines, stripping whitespace, and token condensation.
 */
export async function runCompressionExercise(
  rawInputs: string[] = [
    'User updated preference lowStockThreshold to 10',
    'User updated preference lowStockThreshold to 10',
    'Inventory item item-001 stock changed to 45 units in warehouse-a',
    'Inventory item item-001 stock changed to 45 units in warehouse-a',
    'System log: periodic sync event completed at 2026-03-31',
    'System log: periodic sync event completed at 2026-03-31',
  ],
): Promise<ExerciseResult> {
  const startTime = performance.now();
  const originalSize = rawInputs.join('\n').length;

  const uniqueLines = Array.from(new Set(rawInputs.map((line) => line.trim()))).filter(Boolean);
  const compressedText = uniqueLines.join('\n');
  const optimizedSize = compressedText.length;

  const executionTimeMs = Math.round(performance.now() - startTime);
  const efficiencyGainPct =
    originalSize > 0 ? Number((((originalSize - optimizedSize) / originalSize) * 100).toFixed(1)) : 0;

  // Score based on achieving compression target (35%)
  const score = Math.min(100, Math.round((efficiencyGainPct / 35.0) * 100));

  return {
    exerciseId: 'ex-compression-01',
    exerciseTitle: 'Memory Compression Optimization',
    type: 'compression',
    score,
    efficiencyGainPct,
    originalSize,
    optimizedSize,
    executionTimeMs,
    details: `Compressed ${rawInputs.length} entries into ${uniqueLines.length} deduplicated records.`,
  };
}

/**
 * Executes an Indexing Exercise.
 * Simulates index tokenization and n-gram optimization to reduce index overhead.
 */
export async function runIndexingExercise(
  tokens: string[] = [
    'product',
    'inventory',
    'sales',
    'reports',
    'settings',
    'supplier',
    'product',
    'inventory',
    'sales',
  ],
): Promise<ExerciseResult> {
  const startTime = performance.now();
  const originalSize = tokens.join(',').length * 2; // Simulated initial index size with full token duplication

  const indexMap = new Map<string, number>();
  for (const token of tokens) {
    const cleaned = token.toLowerCase().trim();
    indexMap.set(cleaned, (indexMap.get(cleaned) || 0) + 1);
  }

  const optimizedSize = JSON.stringify(Object.fromEntries(indexMap)).length;
  const executionTimeMs = Math.round(performance.now() - startTime);
  const efficiencyGainPct =
    originalSize > 0 ? Number((((originalSize - optimizedSize) / originalSize) * 100).toFixed(1)) : 0;

  const score = Math.min(100, Math.round((efficiencyGainPct / 25.0) * 100));

  return {
    exerciseId: 'ex-indexing-02',
    exerciseTitle: 'Search Indexing Calibration',
    type: 'indexing',
    score,
    efficiencyGainPct,
    originalSize,
    optimizedSize,
    executionTimeMs,
    details: `Indexed ${tokens.length} tokens into ${indexMap.size} unique term entries.`,
  };
}

/**
 * Executes a Pruning Exercise.
 * Filters out low-relevance memories based on age and access count.
 */
export async function runPruningExercise(
  memories: Array<{ id: string; ageDays: number; accessCount: number }> = [
    { id: 'mem-1', ageDays: 2, accessCount: 15 },
    { id: 'mem-2', ageDays: 45, accessCount: 0 },
    { id: 'mem-3', ageDays: 90, accessCount: 1 },
    { id: 'mem-4', ageDays: 5, accessCount: 8 },
    { id: 'mem-5', ageDays: 120, accessCount: 0 },
  ],
): Promise<ExerciseResult> {
  const startTime = performance.now();
  const originalSize = memories.length;

  // Keep memories if accessCount >= 2 or ageDays <= 30
  const retained = memories.filter((mem) => mem.accessCount >= 2 || mem.ageDays <= 30);
  const optimizedSize = retained.length;

  const executionTimeMs = Math.round(performance.now() - startTime);
  const prunedCount = originalSize - optimizedSize;
  const efficiencyGainPct = originalSize > 0 ? Number(((prunedCount / originalSize) * 100).toFixed(1)) : 0;

  const score = Math.min(100, Math.round((efficiencyGainPct / 40.0) * 100));

  return {
    exerciseId: 'ex-pruning-03',
    exerciseTitle: 'Retention & Pruning Policy',
    type: 'pruning',
    score,
    efficiencyGainPct,
    originalSize,
    optimizedSize,
    executionTimeMs,
    details: `Pruned ${prunedCount} stale memory items (${retained.length} retained).`,
  };
}

/**
 * Runs a complete memory tuning session executing all available exercises.
 */
export async function runFullTuningSession(): Promise<TuningSession> {
  const compResult = await runCompressionExercise();
  const idxResult = await runIndexingExercise();
  const pruneResult = await runPruningExercise();

  const results = [compResult, idxResult, pruneResult];
  const totalScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length);
  const averageEfficiencyGain = Number(
    (results.reduce((sum, r) => sum + r.efficiencyGainPct, 0) / results.length).toFixed(1),
  );

  const session: TuningSession = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    totalScore,
    averageEfficiencyGain,
    results,
  };

  await saveTuningResultToXavier(session);
  return session;
}

/**
 * Saves a tuning session record into Xavier memory.
 */
export async function saveTuningResultToXavier(session: TuningSession) {
  const path = `tuning/sessions/${session.id}`;
  const payload = JSON.stringify({
    kind: 'tuning-session',
    ...session,
  });
  return xavierAdd(path, payload);
}

/**
 * Fetches tuning history sessions stored in Xavier memory.
 */
export async function loadTuningHistoryFromXavier(): Promise<TuningSession[]> {
  const searchRes = await xavierSearch('tuning-session');
  if (!searchRes.ok && (!searchRes.results || searchRes.results.length === 0)) {
    return [];
  }

  const sessions: TuningSession[] = [];
  for (const item of searchRes.results) {
    try {
      let data: any = item;
      if (typeof item === 'object' && item !== null && 'content' in item) {
        data = JSON.parse((item as any).content);
      } else if (typeof item === 'string') {
        data = JSON.parse(item);
      }
      if (data && data.kind === 'tuning-session' && data.results) {
        sessions.push({
          id: data.id,
          timestamp: data.timestamp,
          totalScore: data.totalScore,
          averageEfficiencyGain: data.averageEfficiencyGain,
          results: data.results,
        });
      }
    } catch {
      // ignore parse errors for non-matching memories
    }
  }

  // Sort newest first
  return sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
