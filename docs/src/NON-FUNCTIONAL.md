# Shelf - Non-Functional Requirements

## SRC-PQC-001: Post-Quantum Cryptography

**Priority:** P0 | **Status:** Implemented

**User Story:** Como usuario, quiero que mis datos esten protegidos incluso contra computacion cuantica.

**Technical Stack:** `@noble/post-quantum` (ML-KEM-768, ML-DSA-65)

**Acceptance Criteria:**

1. Intercambio de llaves con ML-KEM-768.
2. Firmas digitales ML-DSA-65.
3. Cifrado en reposo con AES-GCM y derivacion de llave segura.
4. Cifrado en transito sobre WebRTC.
5. Integracion con `p2p-mesh-core` y futura firma de capacidades Edge Mesh.

## SRC-P2P-001: P2P Mesh Network

**Priority:** P0 | **Status:** Implemented

**Technical Stack:** PeerJS, WebRTC, `p2p-mesh-core`, `@shelf/edge-mesh`

**Acceptance Criteria:**

1. Descubrimiento de peers via WebRTC.
2. Topologia mesh descentralizada.
3. Admin/master node para coordinacion y permisos.
4. Reconexion automatica ante caidas de conexion.
5. PeerJS local en `localhost`, `127.0.0.1`, y `::1` para desarrollo y E2E.
6. Integracion con Edge Mesh para propagar actualizaciones CRDT entre navegadores.

## SRC-CRDT-001: CRDT Sync (Yjs)

**Priority:** P0 | **Status:** Implemented

**Technical Stack:** Yjs, `@shelf/edge-mesh`, Playwright

**Acceptance Criteria:**

1. Integracion con Yjs para tipos de datos compartidos.
2. Resolucion automatica de conflictos y consistencia eventual.
3. Sincronizacion eficiente por updates delta.
4. Namespaces independientes por workflow.
5. Remote origins con `peerId` para autorizar mutaciones antes de aplicarlas a app state.

## SRC-EDGE-001: Edge Mesh Runtime

**Priority:** P0 | **Status:** Implemented

**Technical Stack:** `@shelf/edge-mesh`, `edge-mesh-react`, Yjs, PeerJS/WebRTC, WebGPU extension point

**Acceptance Criteria:**

1. Package reutilizable para nodos, transporte, storage, protocolo, presencia, autorizacion y CRDT namespaces.
2. `EdgeMesh#getNamespace(name)` para documentos Yjs por workflow.
3. Remote origin `{ type: 'remote', peerId }` en updates entrantes.
4. Prevencion de loops al no re-broadcast de updates remotos.
5. Puente Shelf que sincroniza `products`, `sales`, `clients`, `suppliers`, `purchaseOrders`, `arqueoSessions`, `ocrResults`, `auditLogs`, y `teamMembers`.
6. Reversion de mutaciones remotas no autorizadas con origen `shelf-edge-security-revert`.
7. Harness E2E solo en localhost para pruebas deterministicas de sync y seguridad.
8. Extension WebGPU para futuros agentes locales sobre contexto CRDT.

## SRC-PWA-001: PWA & Offline Support

**Priority:** P0 | **Status:** Implemented

**Technical Stack:** `vite-plugin-pwa`, `workbox-window`, local storage, IndexedDB roadmap

**Acceptance Criteria:**

1. Instalable como Progressive Web App.
2. Funciona sin conexion a internet.
3. Service worker configurado para caching offline.
4. Persistencia local de estado operacional.
5. Sincronizacion cuando vuelve la conectividad P2P.

## SRC-QA-001: Testing Infrastructure

**Priority:** P1 | **Status:** Implemented

**Technical Stack:** Playwright, Vitest, Biome, GitHub Actions, Vercel

**Acceptance Criteria:**

1. Tests unitarios del paquete `@shelf/edge-mesh`.
2. Tests E2E de sincronizacion Edge Mesh entre navegadores.
3. Tests E2E de bloqueo/reversion de mutaciones remotas no autorizadas.
4. Tests E2E de seguridad local y compatibilidad P2P existente.
5. Biome configurado para lint/format.
6. CI/CD con GitHub Actions y despliegue Vercel.

## SRC-SEC-001: Firebase Security Rules

**Priority:** P0 | **Status:** Implemented

**Acceptance Criteria:**

1. Firestore rules publicadas y configuradas.
2. Segregacion de datos por usuario.
3. Cloud Functions con secrets configurados.

## SRC-SEC-002: Environment Security

**Priority:** P1 | **Status:** Implemented

**Acceptance Criteria:**

1. IDs y secrets en environment variables.
2. `.env.example` con variables documentadas.
3. Secrets de produccion separados de desarrollo.
4. Stripe webhook secret verificado en produccion.
