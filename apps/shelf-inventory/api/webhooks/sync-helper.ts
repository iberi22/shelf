import * as Y from 'yjs';
import type { Product, Sale } from '../../../../packages/p2p-mesh-core/src/types';

export const SHELF_EDGE_NAMESPACE = 'shelf';

export interface WebhookUpdate {
  collection: 'products' | 'sales';
  data: Product | Sale;
}

/**
 * Applies a webhook update to a Yjs document.
 * In a real-world scenario, this document would be loaded from a persistent store
 * (like Vercel KV, Redis, or a database) before applying the update.
 */
export async function applyWebhookUpdate(doc: Y.Doc, update: WebhookUpdate, origin = 'webhook-sync') {
  const yMap = doc.getMap(update.collection);

  doc.transact(() => {
    yMap.set(update.data.id, update.data);
  }, origin);

  return Y.encodeStateAsUpdate(doc);
}

/**
 * For Edge functions, we might want to "push" this update to other peers
 * if there's a relay/signaling server, or just persist it.
 */
export async function processWebhookEntity(entity: Product | Sale, collection: 'products' | 'sales') {
  const doc = new Y.Doc();
  // Here we would ideally load the existing state
  // const existingState = await loadStateFromKV();
  // if (existingState) Y.applyUpdate(doc, existingState);

  const updateBlob = await applyWebhookUpdate(doc, { collection, data: entity });

  // Persist the new state
  // await saveStateToKV(Y.encodeStateAsUpdate(doc));

  return updateBlob;
}
