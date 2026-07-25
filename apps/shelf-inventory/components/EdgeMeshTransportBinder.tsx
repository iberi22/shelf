/**
 * Phase C/E: bind EdgeMesh to the single PeerJS instance owned by p2pManager.
 * Never opens a second Peer — EDGE_MESH_ENVELOPE rides the same data channel as YJS_UPDATE.
 *
 * Phase E: when all peers are dual-ready, local CRDT patches prefer EDGE_MESH SYNC
 * envelopes (via p2pManager.setEdgeYjsRelay) instead of legacy YJS_UPDATE.
 */
import { CAPACIDAD_ESTANDAR, type EdgeMesh, type NodoId } from 'edge-mesh';
import { useEdgeMesh } from 'edge-mesh-react';
import { createP2PManagerTransport, p2pManager } from 'p2p-mesh-core';
import { useEffect, useRef, useState, type FC } from 'react';

const TRANSPORT_STATUS_EVENT = 'shelf-edge-mesh-transport';
const SYNC_NS = 'global';
const GRANT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface EdgeMeshTransportStatus {
  bound: boolean;
  peerId: string | null;
  connectedPeers: number;
  transportType: string | null;
  /** Phase E: legacy-yjs | edge-envelope | idle */
  yjsWirePath: 'legacy-yjs' | 'edge-envelope' | 'idle';
  dualReadyPeers: number;
}

const defaultTransportStatus: EdgeMeshTransportStatus = {
  bound: false,
  peerId: null,
  connectedPeers: 0,
  transportType: null,
  yjsWirePath: 'idle',
  dualReadyPeers: 0,
};

export function useEdgeMeshTransportStatus() {
  const [status, setStatus] = useState<EdgeMeshTransportStatus>(() => {
    if (typeof window === 'undefined') return defaultTransportStatus;
    return (
      (window as unknown as { __shelfEdgeMeshTransport?: EdgeMeshTransportStatus }).__shelfEdgeMeshTransport ||
      defaultTransportStatus
    );
  });

  useEffect(() => {
    const handler = (event: Event) => {
      setStatus((event as CustomEvent<EdgeMeshTransportStatus>).detail);
    };
    window.addEventListener(TRANSPORT_STATUS_EVENT, handler);
    return () => window.removeEventListener(TRANSPORT_STATUS_EVENT, handler);
  }, []);

  return status;
}

function emitTransportStatus(status: EdgeMeshTransportStatus) {
  if (typeof window === 'undefined') return;
  (window as unknown as { __shelfEdgeMeshTransport?: EdgeMeshTransportStatus }).__shelfEdgeMeshTransport = status;
  window.dispatchEvent(new CustomEvent(TRANSPORT_STATUS_EVENT, { detail: status }));
}

function grantPeerInventorySync(mesh: EdgeMesh, peerId: string) {
  const sujeto = peerId as NodoId;
  for (const cap of [CAPACIDAD_ESTANDAR.SINC, CAPACIDAD_ESTANDAR.ESCRIBIR, CAPACIDAD_ESTANDAR.LEER]) {
    mesh.authorizer.concederCapacidad(SYNC_NS, sujeto, cap, GRANT_TTL_MS);
  }
}

/**
 * Mount inside EdgeMeshProvider. Binds once per mesh instance; updates status when peers change.
 */
const EdgeMeshTransportBinder: FC = () => {
  const mesh = useEdgeMesh();
  const boundForMeshRef = useRef<unknown>(null);

  // Bind transport once when mesh instance appears + register Phase E YJS envelope relay
  useEffect(() => {
    if (!mesh) {
      boundForMeshRef.current = null;
      p2pManager.setEdgeYjsRelay(null);
      emitTransportStatus(defaultTransportStatus);
      return;
    }

    if (boundForMeshRef.current !== mesh || mesh.obtenerTransport() === null) {
      if (mesh.obtenerTransport()) {
        mesh.detachTransport();
      }
      const transport = createP2PManagerTransport(p2pManager, mesh.config.nodoId);
      mesh.usarTransport(transport);
      boundForMeshRef.current = mesh;

      // Phase E: CRDT local patches → EDGE_MESH_ENVELOPE when mesh is fully dual-ready
      p2pManager.setEdgeYjsRelay(async (update, _branchId) => {
        await mesh.broadcastYjsUpdate(update, 'default');
      });

      // Self can always sync
      grantPeerInventorySync(mesh, mesh.config.nodoId);
    }

    emitTransportStatus({
      bound: true,
      peerId: p2pManager.localPeerId,
      connectedPeers: p2pManager.getConnectedPeerIds().length,
      transportType: mesh.obtenerTransport()?.tipo ?? null,
      yjsWirePath: p2pManager.getActiveYjsWirePath(),
      dualReadyPeers: p2pManager.getConnectedPeerIds().filter((id) => p2pManager.isYjsAppEncryptedForPeer(id)).length,
    });

    return () => {
      if (boundForMeshRef.current === mesh) {
        p2pManager.setEdgeYjsRelay(null);
        mesh.detachTransport();
        boundForMeshRef.current = null;
        emitTransportStatus(defaultTransportStatus);
      }
    };
  }, [mesh]);

  // Refresh peer counts + grant SYNC/WRITE to connected peers (envelope authz)
  useEffect(() => {
    if (!mesh) return;

    const refresh = () => {
      const peers = p2pManager.getConnectedPeerIds();
      for (const peerId of peers) {
        // Only grant after PQC verification / dual-ready path is meaningful
        if (p2pManager.isYjsAppEncryptedForPeer(peerId) || peers.length > 0) {
          grantPeerInventorySync(mesh, peerId);
        }
      }
      emitTransportStatus({
        bound: mesh.obtenerTransport() !== null,
        peerId: p2pManager.localPeerId,
        connectedPeers: peers.length,
        transportType: mesh.obtenerTransport()?.tipo ?? null,
        yjsWirePath: p2pManager.getActiveYjsWirePath(),
        dualReadyPeers: peers.filter((id) => p2pManager.isYjsAppEncryptedForPeer(id)).length,
      });
    };

    p2pManager.onConnectionChange(refresh);
    const interval = window.setInterval(refresh, 2000);
    refresh();
    return () => window.clearInterval(interval);
  }, [mesh]);

  return null;
};

export default EdgeMeshTransportBinder;
