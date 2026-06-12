# SRC-PWA-001: PWA & Offline Support

- **ID:** SRC-PWA-001
- **Nombre:** PWA & Offline Support
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implementado
- **Categoría:** PWA (PWA & Offline)
- **SDLC:** Production

## Descripción
Progressive Web App con soporte offline completo. Instalable, funciona 100% sin conexión a internet, con Service Worker configurado para caching offline y persistencia en localStorage + IndexedDB.

## Actor Principal
Usuario Free

## Dependencias
Ninguna

## User Story
> Como usuario, quiero instalar la app y usarla sin internet.

## Acceptance Criteria
1. Instalable como Progressive Web App (manifest + service worker)
2. Funciona 100% sin conexión a internet
3. Service worker configurado para caching offline (vite-plugin-pwa)
4. Persistencia en localStorage + IndexedDB
5. Actualización automática cuando hay nueva versión

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| vite-plugin-pwa | Generación de service worker + manifest |
| workbox-window | Estrategias de caching |
| Service Worker | Interceptación de fetch, caching offline |
| IndexedDB | Almacenamiento estructurado offline |
| localStorage | Almacenamiento simple de estado |

## Detalles Técnicos
- **Caching strategy:** Cache-first para assets estáticos, network-first para datos API
- **Manifest:** name, short_name, icons, theme_color configurados
- **Update flow:** Nuevo SW detectado → notificación al usuario → actualización
- **Offline fallback:** Página offline personalizada si recurso no está cacheado

## Commits Relacionados
```
feat(pwa): implement SRC-PWA-001 - PWA & offline support
```
