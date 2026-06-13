export const buildPwaInstallLink = (origin: string): string => {
  return new URL('/', origin).toString();
};

export const buildPeerInviteLink = (origin: string, peerId: string): string => {
  const url = new URL('/', origin);
  url.searchParams.set('invite', 'true');
  url.searchParams.set('peerId', peerId);
  return url.toString();
};

export const buildPeerInviteMessage = (origin: string, peerId: string): string => {
  const installLink = buildPwaInstallLink(origin);
  const inviteLink = buildPeerInviteLink(origin, peerId);

  return [
    '¡Hola! Únete a mi red de Shelf Inventory.',
    '',
    `1. Abre o instala la PWA aquí: ${installLink}`,
    `2. Entra al nodo anfitrión con este enlace: ${inviteLink}`,
    '3. Envíame tu "Peer ID" para enlazarte de forma segura.',
  ].join('\n');
};
