import { describe, expect, it } from 'vitest';
import { resolvePeerOptions } from '../src/peer-options';

const SIG = { host: 'sig.example.com', port: 443, path: '/peerjs', secure: true };

describe('resolvePeerOptions', () => {
  it('production without config is disabled and never the public broker', () => {
    const r = resolvePeerOptions({ isDev: false });
    expect(r).toEqual({ enabled: false, reason: 'unconfigured' });
    expect(JSON.stringify(r)).not.toContain('peerjs.com');
    expect(JSON.stringify(r)).not.toContain('host');
  });
  it('with config passes host/port/path/secure', () => {
    const r = resolvePeerOptions({ isDev: false, signaling: SIG });
    expect(r.enabled).toBe(true);
    if (r.enabled) expect(r.options).toMatchObject(SIG);
    expect(JSON.stringify(r)).not.toContain('0.peerjs.com');
  });
  it('dev uses local server', () => {
    const r = resolvePeerOptions({ isDev: true });
    expect(r.enabled && r.options.host).toBe('127.0.0.1');
  });
});
