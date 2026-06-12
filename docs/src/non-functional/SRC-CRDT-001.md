# SRC-CRDT-001: CRDT Sync (Yjs)

- **ID:** SRC-CRDT-001
- **Nombre:** CRDT Sync (Yjs)
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implementado
- **Categoría:** CRDT (CRDT Conflict Resolution)
- **SDLC:** Production

## Descripción
Sincronización CRDT usando Yjs para consistencia eventual sin servidor central. Resuelve conflictos automáticamente cuando múltiples peers modifican el mismo dato simultáneamente.

## Actor Principal
Usuario de Bodega

## Dependencias
- **SRC-P2P-001** (P2P Mesh Network) — transporte de datos entre peers
- **SRC-PQC-001** (Post-Quantum Cryptography) — cifrado de datos en tránsito

## User Story
> Como usuario, quiero que los cambios se sincronicen sin conflictos entre dispositivos.

## Acceptance Criteria
1. Integración Yjs para tipos de datos compartidos
2. Resolución automática de conflictos (CRDT)
3. Consistencia eventual sin servidor central
4. Sincronización eficiente (solo cambios delta, no datos completos)
5. Funciona 100% offline → sync cuando hay conexión

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| Yjs | CRDT implementation (battle-tested) |
| y-protocols | Protocolos de sincronización Yjs |
| p2p-mesh-core | Transporte P2P para updates Yjs |

## Detalles Técnicos
- **Data types:** Y.Map para inventario, Y.Array para ventas/historial
- **Sync step 1:** Estado completo al conectar nuevo peer
- **Sync step 2:** Updates incrementales (solo cambios)
- **Conflict resolution:** Last-Writer-Wins (LWW) para campos simples, merge para arrays
- **Offline:** Cambios se acumulan localmente → sync al reconectar

## Commits Relacionados
```
feat(crdt): implement SRC-CRDT-001 - Yjs CRDT sync
```
