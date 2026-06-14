import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../src/sync/engine';
import { IdentityManager } from '../src/identity';
import { AuthzManager } from '../src/authz';
import * as Y from 'yjs';

describe('Edge Mesh Integrated Sync', () => {
  it('should simulate two nodes syncing with identity and authz', () => {
    // Node A setup
    const nodeA_sync = new SyncEngine();
    const nodeA_id = new IdentityManager();
    const nodeA_authz = new AuthzManager();

    // Node B setup
    const nodeB_sync = new SyncEngine();
    const nodeB_id = new IdentityManager();
    const nodeB_authz = new AuthzManager();

    // Simulate connection: Node A sends update to Node B
    const mapA = nodeA_sync.doc.getMap('data');
    mapA.set('foo', 'bar');

    const updateA = nodeA_sync.getUpdate();

    // Node A signs the update
    const signatureA = nodeA_id.sign(updateA);

    // Node B receives and verifies
    const pubKeyA = nodeA_id.getPublicKeys().dsa;
    const isValid = nodeB_id.verify(signatureA, updateA, pubKeyA);
    expect(isValid).toBe(true);

    if (isValid) {
      nodeB_sync.applyUpdate(updateA);
    }

    const mapB = nodeB_sync.doc.getMap('data');
    expect(mapB.get('foo')).toBe('bar');

    // Capability check
    nodeB_authz.addCapability({
      capability: 'inventory:edit',
      issuer: 'admin',
      subject: 'nodeB',
      signature: new Uint8Array(),
    });

    expect(nodeB_authz.hasCapability('nodeB', 'inventory:edit')).toBe(true);
    expect(nodeB_authz.hasCapability('nodeB', 'inventory:delete')).toBe(false);
  });
});
