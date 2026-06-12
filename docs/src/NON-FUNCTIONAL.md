# Shelf — Non-Functional Requirements

---

## SRC-PQC-001: Post-Quantum Cryptography
**Priority:** P0 | **Status:** ✅ Implemented

**User Story:** Como usuario, quiero que mis datos estén protegidos incluso contra computación cuántica.

**Technical Stack:** `@noble/post-quantum` (ML-KEM-768, ML-DSA-65)

**Acceptance Criteria:**
1. Intercambio de llaves con ML-KEM-768 (NIST estandarizado)
2. Firmas digitales ML-DSA-65
3. Cifrado en reposo: AES-GCM con derivación de llave PQC
4. Cifrado en tránsito: AES-GCM sobre WebRTC
5. Integración con p2p-mesh-core para handshake seguro

---

## SRC-P2P-001: P2P Mesh Network
**Priority:** P0 | **Status:** ✅ Implemented

**Technical Stack:** PeerJS (WebRTC), `p2p-mesh-core` package

**Acceptance Criteria:**
1. Descubrimiento de peers vía WebRTC
2. Topología mesh descentralizada (cada nodo se conecta a múltiples peers)
3. Admin Node designado para coordinación
4. Reconexión automática ante caídas de conexión
5. Empaquetado como `p2p-mesh-core` (package reutilizable)

---

## SRC-CRDT-001: CRDT Sync (Yjs)
**Priority:** P0 | **Status:** ✅ Implemented

**Technical Stack:** Yjs, y-protocols

**Acceptance Criteria:**
1. Integración con Yjs para tipos de datos compartidos
2. Resolución automática de conflictos (CRDT)
3. Consistencia eventual sin servidor central
4. Sincronización eficiente (solo cambios, no datos completos)
5. Funciona 100% offline → sync cuando hay conexión

---

## SRC-PWA-001: PWA & Offline Support
**Priority:** P0 | **Status:** ✅ Implemented

**Technical Stack:** `vite-plugin-pwa`, `workbox-window`

**Acceptance Criteria:**
1. Instalable como Progressive Web App
2. Funciona 100% sin conexión a internet
3. Service worker configurado para caching offline
4. Persistencia en localStorage + IndexedDB
5. Actualización automática cuando hay nueva versión

---

## SRC-QA-001: Testing Infrastructure
**Priority:** P1 | **Status:** ✅ Implemented

**Technical Stack:** Cypress, Biome

**Acceptance Criteria:**
1. `data-testid` en todos los elementos interactivos
2. Tests E2E con Cypress completos (flujos críticos)
3. Linting con Biome configurado
4. Husky + lint-staged para pre-commit hooks
5. CI/CD con GitHub Actions (`.github/workflows/ci.yml`)

---

## SRC-SEC-001: Firebase Security Rules
**Priority:** P0 | **Status:** ✅ Implemented

**Acceptance Criteria:**
1. Firestore rules publicadas y configuradas
2. Segregación de datos por usuario (cada usuario ve solo sus datos)
3. Cloud Functions con secrets configurados (API keys, Stripe keys)

---

## SRC-SEC-002: Environment Security
**Priority:** P1 | **Status:** ✅ Implemented

**Acceptance Criteria:**
1. AdSense IDs en environment variables (no hardcodeados)
2. `.env.example` con variables documentadas
3. Secrets de producción separados de desarrollo
4. Stripe webhook secret verificado en producción
