import type { SyncMessage } from './sync-types';
import { type MessageHandlerContext, sealSessionPayload } from './message-handler';

/**
 * Send-side framing for ENCRYPTED_PAYLOAD. Once a v2 session cipher exists for
 * the peer the payload is sealed with it (counter nonce + AAD), otherwise the
 * legacy v1 encryptor is used. Pure: no dependency on the p2p barrel.
 */
export async function frameOutgoingPayload(
  ctx: MessageHandlerContext,
  peerId: string,
  message: SyncMessage,
  legacyEncrypt: (plaintext: string) => Promise<string>,
): Promise<{ type: 'ENCRYPTED_PAYLOAD'; payload: { ciphertext: string } }> {
  const plaintext = JSON.stringify(message);
  const ciphertext = (await sealSessionPayload(ctx, peerId, plaintext)) ?? (await legacyEncrypt(plaintext));
  return { type: 'ENCRYPTED_PAYLOAD', payload: { ciphertext } };
}
