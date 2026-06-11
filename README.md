# Shelf Ecosystem

Shelf es una aplicación descentralizada de gestión de inventario y punto de venta con arquitectura Offline-First. 
Este repositorio utiliza **pnpm workspace** y **Turborepo** para gestionar sus paquetes y aplicaciones.

## Estructura del Monorepo

- `apps/shelf-inventory`: La aplicación principal construida en React (Vite).
- `apps/docs`: Portal de documentación técnica (VitePress).
- `packages/p2p-mesh-core`: Motor de sincronización P2P descentralizado, incluyendo criptografía post-cuántica y la lógica de CRDT (Yjs).

## Pre-requisitos

- [Node.js](https://nodejs.org/en/) 20 o superior.
- [pnpm](https://pnpm.io/) v9 o superior.

## Instalación y Desarrollo

1. Instala las dependencias en la raíz:
   ```bash
   pnpm install
   ```

2. Ejecutar entornos de desarrollo (Aplicación y Documentación):
   ```bash
   pnpm run dev
   ```
   *Nota: Debes asegurarte de tener un script `dev` en la raíz mapeado a `turbo run dev`.*

3. Compilar para producción:
   ```bash
   pnpm run build
   ```

## Documentación Técnica

Toda la documentación relacionada a la Arquitectura P2P WebRTC, seguridad Post-Cuántica (ML-KEM) y la gobernanza de datos offline-first está en el módulo de `apps/docs`. 

Se compila y despliega de manera automática en GitHub Pages.

Para previsualizar localmente:
```bash
pnpm run --filter shelf-docs dev
```
