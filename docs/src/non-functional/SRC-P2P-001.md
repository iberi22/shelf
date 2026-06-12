# SRC-P2P-001: P2P Mesh Network

- **ID:** SRC-P2P-001
- **Nombre:** P2P Mesh Network
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implementado
- **Categoría:** P2P (P2P Mesh Sync)
- **SDLC:** Production

## Descripción
Red mesh P2P descentralizada vía WebRTC (PeerJS) para sincronización offline-first sin servidor central. Utiliza un Admin Node designado para coordinación y reconexión automática.

## Actor Principal
Usuario de Bodega

## Dependencias
- **SRC-PQC-001** (Post-Quantum Cryptography) — handshake seguro entre peers

## User Story
> Como usuario, quiero que los datos se sincronicen entre mis dispositivos sin servidor central.

## Acceptance Criteria
1. Descubrimiento de peers vía WebRTC
2. Topología mesh descentralizada (cada nodo se conecta a múltiples peers)
3. Admin Node designado para coordinación
4. Reconexión automática ante caídas de conexión
5. Empaquetado como p2p-mesh-core (package reutilizable)

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| PeerJS | WebRTC peer-to-peer |
| WebRTC | Transporte de datos en tiempo real |
| p2p-mesh-core | Package interno (packages/) |

## Arquitectura Mesh
```
    ┌─────┐
    │ N1  │◄──► N2
    └──┬──┘     │
       │        │
    ┌──▼──┐  ┌──▼──┐
    │ N3  │◄─┤ N4  │
    └─────┘  └─────┘
```

## Detalles Técnicos
- **Peer ID:** Generado por PeerJS, con naming basado en device fingerprint
- **Admin Node:** Primer peer en conectarse, coordina mesh
- **Heartbeat:** Ping/pong cada 5s para detectar peers caídos
- **Reconexión:** Exponential backoff hasta 30s entre reintentos
- **Mesh completa:** Cada peer se conecta a todos los peers disponibles (fully connected)

## Commits Relacionados
```
feat(p2p): implement SRC-P2P-001 - p2p mesh network
```
