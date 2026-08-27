import { describe, expect, it } from 'vitest';
import { buildPeerInviteLink, buildPeerInviteMessage, buildPwaInstallLink } from './share-links';

describe('buildPwaInstallLink', () => {
  it('builds an installable URL rooted at origin', () => {
    expect(buildPwaInstallLink('https://shelf.example.com')).toBe('https://shelf.example.com/');
  });

  it('normalizes a trailing-slash origin', () => {
    expect(buildPwaInstallLink('https://shelf.example.com/')).toBe('https://shelf.example.com/');
  });
});

describe('buildPeerInviteLink', () => {
  it('adds invite=true and peerId search params', () => {
    const link = buildPeerInviteLink('https://shelf.example.com', 'peer-abc-123');
    const url = new URL(link);
    expect(url.origin).toBe('https://shelf.example.com');
    expect(url.searchParams.get('invite')).toBe('true');
    expect(url.searchParams.get('peerId')).toBe('peer-abc-123');
  });

  it('keeps the pathname as root', () => {
    const url = new URL(buildPeerInviteLink('https://shelf.example.com', 'p1'));
    expect(url.pathname).toBe('/');
  });
});

describe('buildPeerInviteMessage', () => {
  it('includes the install link and the invite link', () => {
    const message = buildPeerInviteMessage('https://shelf.example.com', 'peer-xyz');
    expect(message).toContain(buildPwaInstallLink('https://shelf.example.com'));
    expect(message).toContain(buildPeerInviteLink('https://shelf.example.com', 'peer-xyz'));
  });

  it('contains the 3-step joining instructions with the peer id ask', () => {
    const message = buildPeerInviteMessage('https://shelf.example.com', 'peer-xyz');
    expect(message).toContain('1. Abre o instala la PWA aquí:');
    expect(message).toContain('2. Entra al nodo anfitrión con este enlace:');
    expect(message).toContain('3. Envíame tu "Peer ID" para enlazarte de forma segura.');
  });

  it('is multi-line (newline separated steps)', () => {
    const message = buildPeerInviteMessage('https://shelf.example.com', 'peer-xyz');
    expect(message.split('\n').length).toBeGreaterThanOrEqual(5);
  });
});
