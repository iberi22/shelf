# Sincronización CRDT con Yjs

Shelf es una aplicación "Offline-First". Al no depender de un servidor central de base de datos (como PostgreSQL o Firebase), las bases de datos deben estar en el dispositivo del usuario.

## Conflict-free Replicated Data Types (CRDTs)

Utilizamos **Yjs** para gestionar el estado de los datos (Inventario, Ventas, Clientes). Yjs es una implementación CRDT que permite:
1. Aceptar escrituras concurrentes (dos usuarios editando inventario al mismo tiempo).
2. Mergear automáticamente los estados sin conflictos de red.
3. Sincronizar diferencias a través de cualquier transporte (en este caso, nuestra malla WebRTC cifrada).

## `database-sync.ts`

El módulo de CRDT funciona en el core `p2p-mesh-core`. Convierte los arrays y mapas en estructuras `Y.Map` o `Y.Array`. Cuando se detectan cambios locales (`dbSync.onChange`), el motor extrae un vector de estado (`update`) y lo transmite por WebRTC (`YJS_UPDATE`). Al recibirlo, los otros clientes aplican el parche binario directamente.
