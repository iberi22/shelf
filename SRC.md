# Shelf - Inventory Management PWA

> Every item in its place.

## Overview

**Shelf.** es una Progressive Web App (PWA) de gestión de inventario diseñada para pequeños negocios, vendedores de e-commerce y artesanos. Enfoque offline-first con datos siempre accesibles.

## Tech Stack

- **Framework:** Next.js (PWA)
- **Styling:** Tailwind CSS
- **Database:** LocalStorage / IndexedDB (offline-first)
- **Testing:** Cypress
- **Deployment:** Vercel

## Features

| Feature | Description |
|---------|-------------|
| Dashboard | Métricas clave: revenue, profit, stock levels |
| Inventory Management | CRUD productos con imágenes, quantity, price, cost |
| Sales Tracking | Auto-update stock en cada venta |
| Contact Management | Clientes y proveedores |
| Purchase Orders | Órdenes a proveedores con auto-update de inventory |
| Reports | Filtros dinámicos, charts de ventas, top products |
| Multi-language | English, Spanish, Portuguese |
| PWA & Offline | Instalable, funciona sin internet |

## Project Structure

```
shelf/
├── assets/          # Static assets
├── components/     # React components
├── context/         # React context providers
├── cypress/         # E2E tests
├── docs/            # Documentation
├── dist/            # Production build
└── src/              # Main source (in assets)
```

## Status

🟢 Active - Mantenimiento y mejoras ocasionales

## Links

- CLAUDE.md para desarrollo
- README.md para usuarios
