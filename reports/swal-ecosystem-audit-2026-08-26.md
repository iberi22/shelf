# Shelf + SWAL Ecosystem — Auditoria Completa 2026-08-26

## 1. Estado de Features por App

| App | Features | Implemented | Status |
|-----|----------|-------------|--------|
| shelf | 31 | 93% | ✅ Release v0.0.1 |
| nido | 25 | 100% | ✅ Complete |
| tiktboost | 14 | 98% | ✅ Near complete |
| gara-g | 26 | 65% | ⚠️ Needs work |
| worldexams | 14 | 7% | ❌ Critical gap |
| OrionHealth | 26 | 0% | ❌ Not started |
| hosteler-ia | ? | ? | ⚠️ Unknown |
| veedur-IA.co | ? | ? | ⚠️ Unknown |

## 2. Maloca Module Status

### Features (12 total)
- 11 stable
- 1 implemented (IVN UI)

### Integration with SWAL Apps
- ✅ swal-backoffice: Support page, Xavier connection, router
- ✅ maloca-node: Pro features, service worker
- ✅ Xavier integration: HTTP :8006, memory namespace
- ⚠️ Blog: No dedicated blog module found
- ⚠️ Memory tuning: Not implemented in Maloca

### Support Features
- ✅ SupportPage.svelte exists in swal-backoffice
- ✅ Support ticket CRUD via Xavier
- ✅ Router includes /support route
- ❌ No per-app support isolation
- ❌ No support dashboard/metrics

## 3. Support Features Across Apps

| App | Support | Blog | Memory Tuning |
|-----|---------|------|---------------|
| shelf | ✅ | ❌ | ❌ |
| worldexams | ✅ | ❌ | ❌ |
| hosteler-ia | ✅ | ❌ | ❌ |
| gara-g | ✅ | ❌ | ❌ |
| tiktboost | ✅ | ❌ | ❌ |
| veedur-IA.co | ❌ | ❌ | ❌ |
| OrionHealth | ❌ | ❌ | ❌ |
| nido | ❌ | ❌ | ❌ |

## 4. Agent Access to Tables

### Xavier Integration Status
- ✅ HTTP API :8006 operational
- ✅ Memory namespace: app/{appId}/instance/{instanceId}
- ✅ Code graph indexed (413 files, 9717 symbols)
- ✅ Embeddings healthy (qwen3-embedding-8b)
- ⚠️ Maloca ops domain: /maloca/* endpoints exist
- ❌ Per-app support tables: Not isolated
- ❌ Blog tables: Not implemented
- ❌ Memory tuning tables: Not implemented

## 5. Documentation Status

| App | README | AGENTS | Features |
|-----|--------|--------|----------|
| shelf | ✅ | ✅ | ✅ |
| worldexams | ✅ | ✅ | ✅ |
| hosteler-ia | ✅ | ✅ | ✅ |
| gara-g | ✅ | ✅ | ✅ |
| tiktboost | ✅ | ✅ | ✅ |
| veedur-IA.co | ✅ | ✅ | ✅ |
| OrionHealth | ✅ | ✅ | ✅ |
| nido | ✅ | ✅ | ✅ |

## 6. Critical Gaps Identified

### P0 — Must Fix Before Launch
1. **Support isolation**: Each app needs its own support tickets, not shared
2. **Blog participation**: No app has blog functionality
3. **Memory tuning**: No app has memory tuning exercises
4. **Features at 100%**: worldexams (7%), OrionHealth (0%), gara-g (65%)

### P1 — Important for Quality
5. **Support dashboard**: No metrics/monitoring for support tickets
6. **Per-app Xavier namespace**: Each app needs isolated memory
7. **Documentation gaps**: Some features.json have unknown progress

### P2 — Nice to Have
8. **Blog content**: Need actual blog posts/entries
9. **Memory tuning exercises**: Need to implement
10. **Cross-app support aggregation**: Maloca should aggregate all app support

## 7. Recommendations

### Immediate Actions (This Week)
1. Fix features.json for worldexams, OrionHealth, gara-g
2. Add support isolation per app in Maloca
3. Create blog module in Maloca
4. Add memory tuning exercises to shelf

### Short-term (Next Sprint)
5. Implement support dashboard with metrics
6. Add per-app Xavier namespace isolation
7. Complete documentation for all apps
8. Add blog participation to all apps

### Long-term (Roadmap)
9. Cross-app support aggregation
10. Memory tuning engine
11. Blog content generation
12. Features at 100% for all apps

---
*Auditoria completada: 2026-08-26 | Hermes Agent*
