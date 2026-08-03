import { describe, expect, it } from 'vitest';
import { generateSeed, getWordList, seedToString, stringToSeed, validateSeed } from './seedGenerator';

// ─── generateSeed ─────────────────────────────────────────────

describe('generateSeed', () => {
  it('generates a 12-word seed by default', () => {
    const seed = generateSeed();
    expect(seed).toHaveLength(12);
  });

  it('generates a 24-word seed when requested', () => {
    const seed = generateSeed(24);
    expect(seed).toHaveLength(24);
  });

  it('generates words from the valid word list', () => {
    const wordList = getWordList();
    const seed = generateSeed();
    for (const word of seed) {
      expect(wordList).toContain(word);
    }
  });

  it('produces different seeds on successive calls (randomness)', () => {
    const seed1 = generateSeed();
    const seed2 = generateSeed();
    // Extremely unlikely to be equal
    expect(seed1.join(' ')).not.toBe(seed2.join(' '));
  });
});

// ─── validateSeed ─────────────────────────────────────────────

describe('validateSeed', () => {
  it('returns true for a valid 12-word seed', () => {
    const seed = generateSeed(12);
    expect(validateSeed(seed)).toBe(true);
  });

  it('returns true for a valid 24-word seed', () => {
    const seed = generateSeed(24);
    expect(validateSeed(seed)).toBe(true);
  });

  it('returns false for an invalid word count (10)', () => {
    const words = generateSeed(12).slice(0, 10);
    expect(validateSeed(words)).toBe(false);
  });

  it('returns false for an invalid word count (13)', () => {
    const words = [...generateSeed(12), 'extra'];
    expect(validateSeed(words)).toBe(false);
  });

  it('returns false if any word is not in the word list', () => {
    const seed = generateSeed(12);
    seed[0] = 'notawordinthelist';
    expect(validateSeed(seed)).toBe(false);
  });

  it('is case-insensitive for word validation', () => {
    const seed = generateSeed(12);
    seed[0] = seed[0].toUpperCase();
    expect(validateSeed(seed)).toBe(true);
  });

  it('returns false for an empty array', () => {
    expect(validateSeed([])).toBe(false);
  });
});

// ─── seedToString / stringToSeed ──────────────────────────────

describe('seedToString', () => {
  it('joins words with spaces', () => {
    expect(seedToString(['hello', 'world'])).toBe('hello world');
  });
});

describe('stringToSeed', () => {
  it('splits a space-separated string into words', () => {
    expect(stringToSeed('hello world')).toEqual(['hello', 'world']);
  });

  it('normalizes to lowercase', () => {
    expect(stringToSeed('Hello WORLD')).toEqual(['hello', 'world']);
  });

  it('handles extra whitespace', () => {
    expect(stringToSeed('  hello   world  ')).toEqual(['hello', 'world']);
  });

  it('filters out empty strings from double spaces', () => {
    expect(stringToSeed('hello  world')).toEqual(['hello', 'world']);
  });
});

// ─── round-trip ───────────────────────────────────────────────

describe('seed round-trip', () => {
  it('generateSeed → seedToString → stringToSeed preserves all words', () => {
    const original = generateSeed(12);
    const str = seedToString(original);
    const restored = stringToSeed(str);

    expect(restored).toEqual(original);
  });

  it('round-trip works for 24-word seeds', () => {
    const original = generateSeed(24);
    const str = seedToString(original);
    const restored = stringToSeed(str);

    expect(restored).toEqual(original);
  });
});

// ─── getWordList ──────────────────────────────────────────────

describe('getWordList', () => {
  it('returns a non-empty array of strings', () => {
    const list = getWordList();
    expect(list.length).toBeGreaterThan(0);
    expect(typeof list[0]).toBe('string');
  });

  it('returns a copy (not the original array)', () => {
    const list1 = getWordList();
    const list2 = getWordList();
    expect(list1).not.toBe(list2);
    expect(list1).toEqual(list2);
  });
});
