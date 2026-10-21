/** Pure lookup of the DSA public key (hex) pinned for a peer in the CRDT linkedNodes records. */
export function pinnedDsaKeyFor(
  linkedNodes: ReadonlyArray<{ id: string; dsaPublicKey?: string }>,
  peerId: string,
): string | undefined {
  return linkedNodes.find((n) => n.id === peerId)?.dsaPublicKey || undefined;
}
