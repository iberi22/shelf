# ROADMAP.md — Visión a Largo Plazo de Shelf

**Última actualización:** 2026-07-09

---

## 🎯 Visión

> **Shelf será la plataforma POS offline-first más confiable para pequeños y medianos negocios en Latinoamérica, donde internet no siempre es estable pero los negocios siempre abren.**

---

## 🚩 Hitos Estratégicos

### 2026 Q3 — Consolidación
- ✅ 21 features en producción
- ✅ Edge Mesh Runtime v1 estable
- ✅ Post-quantum cryptography integrada
- 🔄 Refinamiento de edge-mesh (deltas, authz, self-healing)
- ⬜ Sentry error monitoring
- ⬜ 80%+ cobertura de tests E2E

### 2026 Q4 — Escalabilidad
- ⬜ Migración completa de p2p-mesh-core → edge-mesh
- ⬜ Multi-user Pyme plan (backend lógica)
- ⬜ Full Cloud Sync para usuarios Pro
- ⬜ GPU Agent WebGPU - caso de uso real (procesamiento de imágenes)
- ⬜ WebLLM local para predicciones de inventario

### 2027 Q1 — Crecimiento
- ⬜ Google Analytics 4
- ⬜ Advanced Reporting Suite (PDF, exportación)
- ⬜ E-commerce integrations (Shopify, WooCommerce, Mercado Libre)
- ⬜ Mobile app (React Native o PWA avanzada)
- ⬜ 100+ usuarios activos

### 2027 Q2+ — Madurez
- ⬜ API pública para integraciones third-party
- ⬜ Marketplace de plugins
- ⬜ AI inventory forecasting (Gemini + WebLLM)
- ⬜ Expansión a más países latinoamericanos
- ⬜ POS físico integrado (impresoras térmicas, cajones)

---

## 🧱 Roadmap Técnico

### Fase 1: Edge Mesh Runtime (Completado ✅)
- Namespaces por entidad
- Delta sync (CRDT broadcast)
- Security Guard (autorización de mutaciones remotas)
- Self-healing (reversión de cambios no autorizados)
- React bindings

### Fase 2: Estabilización (En Progreso 🔄)
- Tests E2E robustos para edge-mesh
- Playwright harness para tests deterministas
- Documentación de API pública
- Benchmark de rendimiento P2P

### Fase 3: Cloud + Multi-user (Siguiente ⬜)
- Firestore sync robusto con conflict resolution
- Team management con roles
- Invitación por email
- Separación de datos por organización

### Fase 4: Edge Intelligence (Futuro ⬜)
- GPU Agent para procesamiento de imágenes
- WebLLM para análisis local de inventario
- Predicciones de demanda offline
- OCR para facturas y recibos

---

## 📊 KPIs de Éxito

| KPI | Actual | Target 2026 | Target 2027 |
|-----|--------|-------------|-------------|
| Features implementados | 21 | 25 | 35 |
| Tests E2E | ~10 | 50+ | 100+ |
| Paquetes @shelf/* | 4 | 5 | 8 |
| Usuarios activos | ~10 | 100 | 1000+ |
| Tiempo offline máximo | ∞ (diseñado) | ∞ | ∞ |
| Latencia P2P sync | <1s (LAN) | <500ms | <200ms |
