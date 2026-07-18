/**
 * Phase C: bind EdgeMesh to the single PeerJS instance owned by p2pManager.
 * Never opens a second Peer — EDGE_MESH_ENVELOPE rides the same data channel as YJS_UPDATE.
 */
import { useEdgeMesh } from 'edge-mesh-react';
import { createP2PManagerTransport, p2pManager } from 'p2p-mesh-core';
import { useEffect, useRef, useState, type FC } from 'react';

const TRANSPORT_STATUS_EVENT = 'shelf-edge-mesh-transport';

export interface EdgeMeshTransportStatus {
  bound: boolean;
  peerId: string | null;
  connectedPeers: number;
  transportType: string | null;
}

const defaultTransportStatus: EdgeMeshTransportStatus = {
  bound: false,
  peerId: null,
  connectedPeers: 0,
  transportType: null,
};

export function useEdgeMeshTransportStatus() {
  const [status, setStatus] = useState<EdgeMeshTransportStatus>(() => {
    if (typeof window === 'undefined') return defaultTransportStatus;
    return (
      (window as unknown as { __shelfEdgeMeshTransport?: EdgeMeshTransportStatus })
        .__shelfEdgeMeshTransport || defaultTransportStatus
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
  (window as unknown as { __shelfEdgeMeshTransport?: EdgeMeshTransportStatus }).__shelfEdgeMeshTransport =
    status;
  window.dispatchEvent(new CustomEvent(TRANSPORT_STATUS_EVENT, { detail: status }));
}

/**
 * Mount inside EdgeMeshProvider. Binds once per mesh instance; updates status when peers change.
 */
const EdgeMeshTransportBinder: FC = () => {
  const mesh = useEdgeMesh();
  const boundForMeshRef = useRef<unknown>(null);

  // Bind transport once when mesh instance appears
  useEffect(() => {
    if (!mesh) {
      boundForMeshRef.current = null;
      emitTransportStatus(defaultTransportStatus);
      return;
    }

    if (boundForMeshRef.current !== mesh || mesh.obtenerTransport() === null) {
      // Replace any previous adapter
      if (mesh.obtenerTransport()) {
        mesh.detachTransport();
      }
      const transport = createP2PManagerTransport(p2pManager, mesh.config.nodoId);
      mesh.usarTransport(transport);
      boundForMeshRef.current = mesh;
    }

    emitTransportStatus({
      bound: true,
      peerId: p2pManager.localPeerId,
      connectedPeers: p2pManager.getConnectedPeerIds().length,
      transportType: mesh.obtenerTransport()?.tipo ?? null,
    });

    return () => {
      // Only detach when this mesh instance is going away
      if (boundForMeshRef.current === mesh) {
        mesh.detachTransport();
        boundForMeshRef.current = null;
        emitTransportStatus(defaultTransportStatus);
      }
    };
  }, [mesh]);

  // Refresh peer counts without rebinding transport
  useEffect(() => {
    if (!mesh) return;

    const refresh = () => {
      emitTransportStatus({
        bound: mesh.obtenerTransport() !== null,
        peerId: p2pManager.localPeerId,
        connectedPeers: p2pManager.getConnectedPeerIds().length,
        transportType: mesh.obtenerTransport()?.tipo ?? null,
      });
    };

    p2pManager.onConnectionChange(refresh);
    const interval = window.setInterval(refresh, 3000);
    refresh();
    return () => window.clearInterval(interval);
  }, [mesh]);

  return null;
};

export default EdgeMeshTransportBinder;
