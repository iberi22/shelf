# SRC-PQC-001: Post-Quantum Cryptography

- **ID:** SRC-PQC-001
- **Nombre:** Post-Quantum Cryptography
- **Prioridad:** P0 (Core)
- **Estado:** ⚠️ Partial
- **Implementation:** 78%
- **Categoría:** PQC (Post-Quantum Cryptography)
- **SDLC:** Hardening
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-17:** `YJS_UPDATE` / `YJS_SYNC_REQUEST` NO cifrados a nivel app (solo DTLS); at-rest usa PBKDF2+PIN/device entropy, no llave derivada PQC; edge-mesh: ML-DSA only (sin ML-KEM en core).

## Descripción
Criptografía post-cuántica usando @noble/post-quantum (ML-KEM-768 para intercambio de llaves, ML-DSA-65 para firmas digitales, AES-GCM para cifrado en reposo y tránsito).

## Actor Principal
Usuario Pro

## Dependencias
Ninguna

## User Story
> Como usuario, quiero que mis datos estén protegidos incluso contra computación cuántica.

## Acceptance Criteria
1. Intercambio de llaves ML-KEM-768 (NIST estandarizado, marzo 2024)
2. Firmas digitales ML-DSA-65
3. Cifrado en reposo: AES-GCM con derivación de llave PQC
4. Cifrado en tránsito: AES-GCM sobre WebRTC
5. Integración con p2p-mesh-core para handshake seguro entre peers

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| @noble/post-quantum | Implementación PQC |
| ML-KEM-768 | Key encapsulation (NIST FIPS 203) |
| ML-DSA-65 | Digital signatures (NIST FIPS 204) |
| AES-GCM | Cifrado simétrico |
| Web Crypto API | Operaciones criptográficas |

## Detalles Técnicos
- **ML-KEM-768:** Mecanismo de encapsulación de llaves, resistencia cuántica nivel 3
- **ML-DSA-65:** Esquema de firmas basado en lattice, resistencia cuántica nivel 3
- **Handshake:** Intercambio PQC entre peers antes de establecer canal WebRTC
- **Derivación:** HKDF para derivar key AES-GCM desde shared secret ML-KEM
- **Performance:** Operaciones PQC asíncronas para no bloquear UI

## Commits Relacionados
```
feat(pqc): implement SRC-PQC-001 - post-quantum crypto (ML-KEM-768, ML-DSA-65)
```
