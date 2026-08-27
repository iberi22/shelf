import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeHandshake,
  discoveryManager,
  encodeHandshake,
  type HandshakePayload,
} from './discovery';

const SAMPLE_PAYLOAD: HandshakePayload = {
  peerId: 'peer-42',
  kemPubKey: { alg: 'ML-KEM-768', bytes: 'aGVsbG8=' },
  dsaPubKey: { alg: 'ML-DSA-65', bytes: 'd29ybGQ=' },
  timestamp: '2026-08-26T10:00:00.000Z',
  deviceName: 'Test Device',
};

describe('encodeHandshake / decodeHandshake', () => {
  it('roundtrips a handshake payload', () => {
    const encoded = encodeHandshake(SAMPLE_PAYLOAD);
    expect(decodeHandshake(encoded)).toEqual(SAMPLE_PAYLOAD);
  });

  it('produces a base64 string', () => {
    const encoded = encodeHandshake(SAMPLE_PAYLOAD);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    expect(() => atob(encoded)).not.toThrow();
  });

  it('roundtrips with a minimal payload', () => {
    const minimal: HandshakePayload = {
      peerId: 'p1',
      kemPubKey: null,
      dsaPubKey: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      deviceName: '',
    };
    expect(decodeHandshake(encodeHandshake(minimal))).toEqual(minimal);
  });
});

describe('discoveryManager', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('startDiscovery logs the room and does not throw', () => {
    discoveryManager.startDiscovery('local-peer', 'kitchen-room');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('kitchen-room'));
  });

  it('scan resolves to an empty peer list (simulated discovery)', async () => {
    await expect(discoveryManager.scan()).resolves.toEqual([]);
  });

  it('onDiscovered registers callbacks without throwing', () => {
    const callback = vi.fn();
    expect(() => {
      discoveryManager.onDiscovered(callback);
      discoveryManager.onDiscovered(callback);
    }).not.toThrow();
  });
});