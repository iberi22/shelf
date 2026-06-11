---
layout: home

hero:
  name: "Shelf Docs"
  text: "El Inventario Distribuido P2P"
  tagline: Sistema descentralizado, offline-first y post-cuántico.
  actions:
    - theme: brand
      text: Leer Arquitectura
      link: /arquitectura
    - theme: alt
      text: Ver Código
      link: https://github.com/tu-usuario/shelf
---

## Características Principales

*   **100% Descentralizado**: Sin servidores centrales. Cada peer es un nodo en la malla WebRTC.
*   **Offline-First**: Usa IndexedDB y Yjs para sincronización CRDT asíncrona.
*   **Post-Cuántico**: Intercambio de llaves (ML-KEM-768) y firmas digitales (ML-DSA-65) resistentes a computación cuántica.
*   **Gobernanza Local**: Permisos granulares segmentados por tipo de rol, sin depender de un Auth Server global.
