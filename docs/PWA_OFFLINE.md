# PWA & Offline Support Specification (SRC-PWA-001)

## Overview

Shelf Inventory is designed as a **local-first & offline-first Progressive Web App (PWA)**.
Users can fully open, navigate, read, create, update, and delete inventory data even when disconnected from the internet or local mesh network.

## Core Capabilities

1. **Service Worker Caching (`vite-plugin-pwa` + Workbox)**:
   - Caches static assets, application shell, fonts, icons, and bundles.
   - Enables instantaneous cold-start offline loading.

2. **Local Data Persistence**:
   - Primary state persistence uses IndexedDB (via `usePersistedReducer`) with synchronous `localStorage` fallback.
   - All inventory, sales, clients, suppliers, and audit log mutations write immediately to local storage prior to network broadcast.

3. **Offline Intent Queue (`offlineQueue.ts`)**:
   - Captures P2P connection intents and sync requests initiated while offline.
   - Automatically processes and retries queued intents when `navigator.onLine` fires or when signaling status recovers.

4. **Offline Banner UX (`OfflineBanner.tsx`)**:
   - Notifies users when operating offline or when P2P signaling is unavailable.
   - Explains the first-connect signaling behavior and displays queued P2P background tasks.

---

## WebRTC P2P First-Connect Signaling (By-Design Requirement)

### Why does initial P2P connection require online signaling?

In WebRTC P2P architectures (PeerJS / Libp2p / EdgeMesh):
1. **Signal Exchange**: Before two peers can establish direct P2P data channels (via WebRTC DataChannels or local LAN mesh), they **must exchange SDP offers/answers and ICE candidates** through a signaling mechanism.
2. **Initial Lookup**: Initial discovery and handshake require reachability to a signaling server or bootstrap peer.
3. **By-Design Offline Resilience**: Once the P2P connection and CRDT sync protocol (`Yjs` + `p2p-mesh-core`) are established, the local nodes continue syncing directly over local network / WebRTC without needing central cloud backend servers. If network connection drops completely, local edits remain saved in IndexedDB and are queued for automatic synchronization upon reconnect.

---

## Offline Intent Workflow

```
[User Action / Connection Request]
              │
      Is Device Online?
       ├── YES ──> Attempt direct P2P / PeerJS signal exchange
       └── NO  ──> Enqueue action into `offlineQueue` (IndexedDB/localStorage)
                      │
                      └── Display status in `OfflineBanner.tsx`
                      │
           [Online Event Restored]
                      │
                      └── `offlineQueue.processQueue()` retries pending intents
```

---

## Acceptance Matrix

| Requirement | Implementation | Status |
|---|---|---|
| PWA Installation | Service Worker + VitePWA manifest | ✅ 100% |
| Full Offline Operation | IndexedDB + local storage fallback | ✅ 100% |
| Service Worker Caching | Workbox cache-first / stale-while-revalidate | ✅ 100% |
| First-Connect UX Explanation | `OfflineBanner.tsx` + `docs/PWA_OFFLINE.md` | ✅ 100% (By-design) |
| Offline Intent Queue & Retry | `apps/shelf-inventory/lib/offlineQueue.ts` | ✅ 100% |
