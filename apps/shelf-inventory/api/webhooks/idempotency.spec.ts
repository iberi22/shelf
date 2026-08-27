import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEventId,
  claimEvent,
  IDEMPOTENCY_MAX_ENTRIES,
  IDEMPOTENCY_TTL_MS,
  resetIdempotencyCache,
} from './idempotency';

describe('buildEventId', () => {
  afterEach(() => resetIdempotencyCache());

  it('is deterministic for the same provider, topic and body', async () => {
    const body = JSON.stringify({ id: 1, title: 'P' });
    const a = await buildEventId('shopify', 'products/update', body);
    const b = await buildEventId('shopify', 'products/update', body);
    expect(a).toBe(b);
  });

  it('differs when the body changes (new update to the same entity)', async () => {
    const v1 = await buildEventId('shopify', 'products/update', '{"title":"V1"}');
    const v2 = await buildEventId('shopify', 'products/update', '{"title":"V2"}');
    expect(v1).not.toBe(v2);
  });

  it('differs across providers and topics', async () => {
    const body = '{"id":1}';
    const shopify = await buildEventId('shopify', 'products/update', body);
    const woo = await buildEventId('woocommerce', 'products/update', body);
    const otherTopic = await buildEventId('shopify', 'orders/create', body);
    expect(shopify).not.toBe(woo);
    expect(shopify).not.toBe(otherTopic);
  });

  it('handles a missing topic', async () => {
    const eventId = await buildEventId('shopify', null, '{}');
    expect(eventId).toMatch(/^wh_[0-9a-f]{64}$/);
  });
});

describe('claimEvent', () => {
  afterEach(() => resetIdempotencyCache());

  it('claims a new event once and rejects duplicates', async () => {
    const eventId = await buildEventId('shopify', 'products/update', '{"id":7}');
    expect(claimEvent(eventId)).toBe(true);
    expect(claimEvent(eventId)).toBe(false);
  });

  it('accepts distinct events', () => {
    expect(claimEvent('wh_a')).toBe(true);
    expect(claimEvent('wh_b')).toBe(true);
  });

  it('expires entries after the TTL window', () => {
    vi.useFakeTimers();
    try {
      const eventId = 'wh-expiring';
      expect(claimEvent(eventId)).toBe(true);
      expect(claimEvent(eventId)).toBe(false);
      vi.advanceTimersByTime(IDEMPOTENCY_TTL_MS + 1);
      expect(claimEvent(eventId)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps the cache at IDEMPOTENCY_MAX_ENTRIES (FIFO eviction)', () => {
    for (let i = 0; i < IDEMPOTENCY_MAX_ENTRIES + 50; i += 1) {
      expect(claimEvent(`wh-fifo-${i}`)).toBe(true);
    }
    // Oldest entries were evicted → claimable again
    expect(claimEvent('wh-fifo-0')).toBe(true);
    expect(claimEvent(`wh-fifo-${IDEMPOTENCY_MAX_ENTRIES + 49}`)).toBe(false);
  });
});
