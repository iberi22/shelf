/**
 * Best-effort idempotency for webhook Edge Functions.
 *
 * Webhook platforms can deliver the same event more than once (retries,
 * duplicate deliveries). Each delivery is identified by a stable event id
 * derived from provider + topic + a SHA-256 hash of the raw body:
 *
 *  - Retries carry an identical body, so they produce the same event id and
 *    are answered with a duplicate-safe 200 without re-processing.
 *  - Distinct updates to the same entity produce different bodies, hence
 *    different event ids, and are always processed.
 *
 * The cache is intentionally in-memory: Vercel Edge Functions are stateless
 * isolates, so this dedupes within an isolate window (10 min TTL) and lays
 * the seam for a persistent store. To move to Vercel KV / Redis later, keep
 * this contract and swap the `claimEvent` internals for a KV-backed
 * `get`/`put` on the same event id.
 *
 * Data-level idempotency is provided by the CRDT layer: `processWebhookEntity`
 * keys entities by id, so applying the same entity twice converges.
 */

export const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
export const IDEMPOTENCY_MAX_ENTRIES = 500;

const seen = new Map<string, number>();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Stable, per-delivery event id: identical bodies (retries) hash identically. */
export async function buildEventId(provider: string, topic: string | null, bodyText: string): Promise<string> {
  const payload = [provider, topic ?? 'unknown', bodyText].join('|');
  return `wh_${await sha256Hex(payload)}`;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [eventId, timestamp] of seen) {
    if (now - timestamp > IDEMPOTENCY_TTL_MS) {
      seen.delete(eventId);
    }
  }
  while (seen.size > IDEMPOTENCY_MAX_ENTRIES) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

/**
 * Claims an event for processing. Returns `true` the first time an event id
 * is seen, `false` for duplicates within the TTL window (and records the id
 * for future duplicates).
 */
export function claimEvent(eventId: string): boolean {
  pruneExpired();
  const timestamp = seen.get(eventId);
  if (timestamp !== undefined && Date.now() - timestamp <= IDEMPOTENCY_TTL_MS) {
    return false;
  }
  seen.set(eventId, Date.now());
  return true;
}

/** Test helper: drop all cached event ids. */
export function resetIdempotencyCache(): void {
  seen.clear();
}
