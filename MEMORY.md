# MEMORY.md — Memoria Persistente del Proyecto Shelf

**Última actualización:** 2026-07-18

---

## 🧠 Contexto Histórico

### Origen
- **2024**: BELA inicia `hosteleria` como proyecto Python para gestión de inventario de hostelería
- **2025**: Migración a Node.js/TypeScript con React + Vite
- **2026-06**: Refactor completo a monorepo pnpm + Turborepo con paquetes `@shelf/*`
- **2026-06**: Adopción del protocolo GitCore v3.6.0 para gobierno arquitectónico

### Decisiones Clave (Registradas)

| Decisión | Fecha | Razón | Impacto |
|----------|-------|-------|---------|
| Pasar de Python a Node.js/TS | 2025 | Ecosistema web unificado, tipado estático, mejor DX | Migración completa del código base |
| Monorepo con pnpm + Turborepo | 2026-06 | Builds paralelos, caché, dependencias compartidas entre packages | Separación en 4 packages reutilizables |
| Edge Mesh sobre p2p-mesh-core legacy | 2026-06 | Runtime P2P reutilizable con namespaces, authz y deltas | Nueva capa de sincronización más robusta |
| Yjs CRDT para consistencia | 2026-06 | Resolución automática de conflictos sin servidor central | Sincronización offline-first real |
| Post-quantum crypto (@noble/post-quantum) | 2026-06 | Preparación para futuro cuántico (NIST 2024) | Protección de datos a largo plazo |
| Firebase Auth + Stripe | 2025 | Zero-infrastructure, monetización integrada | Sin servidores para auth/pagos |
| Vercel deploy | 2025 | Preview deployments automáticos, edge functions | CI/CD simplificado |

### Moonshots Futuros
- E-commerce integrations (Shopify, WooCommerce, Mercado Libre)
- WebGPU agent para procesamiento local de imágenes
- WebLLM local para predicciones de inventario

---

## 🏗️ Estado Actual de la Arquitectura

### Capas
```
┌─────────────────────────────────────┐
│   Application (React 19 + Context)   │
├─────────────────────────────────────┤
│   Edge Mesh (@shelf/edge-mesh)      │  ← Activo, en refinamiento
├─────────────────────────────────────┤
│   Legacy P2P (p2p-mesh-core)        │  ← Legacy, se migrará a edge-mesh
├─────────────────────────────────────┤
│   PQC Security (ML-KEM-768, DSA-65) │  ← Activo, estable
└─────────────────────────────────────┘
```

### Paquetes
- **@shelf/p2p-mesh-core**: Legacy P2P engine (mantenimiento, no desarrollo activo)
- **@shelf/edge-mesh**: Runtime P2P moderno (desarrollo activo)
- **@shelf/edge-mesh-react**: Bindings React (desarrollo activo)
- **@shelf/gpu-agent**: WebGPU (exploración)

---

## 📊 Métricas Conocidas

| Métrica | Valor |
|---------|-------|
| Features (promedio AC) | ~91% (21 implemented / 0 partial / 0 skeleton) |
| Paquetes publicables | 4 (`@shelf/*`) |
| Apps | 2 (shelf-inventory, docs) |
| Cobertura tests | En crecimiento |
| Idiomas UI | 20+ |

---

## 🔗 Enlaces Útiles

- **GitHub**: https://github.com/iberi22/shelf
- **Vercel Production**: https://shelf-inventory.vercel.app
- **Docs**: https://shelf-docs.vercel.app

---

## 📝 Notas Adicionales

- El archivo `admin_election_diff.txt` en la raíz es un artifact técnico sobre elección de admin node
- `verify_admin_ui.js` y `manage-features.js` son scripts utilitarios
- `issue_N.md` son drafts de issues de GitHub para features existentes
- `implementation_plan.md` y `PLAN-SHELF-REDESIGN.md` son documentos de planificación histórica
- Hay PeerServer en puerto 9000 para desarrollo local P2P
