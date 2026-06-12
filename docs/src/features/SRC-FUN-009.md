# SRC-FUN-009: Monetization (Ads + Subscriptions)

- **ID:** SRC-FUN-009
- **Nombre:** Monetization (Ads + Subscriptions)
- **Prioridad:** P0 (Core)
- **Estado:** ✅ Implementado
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Production

## Descripción
Sistema de monetización con anuncios (DesktopAdColumn, MobileAdBars) para usuarios free y planes de suscripción (Basic, Pro, Pyme) procesados vía Stripe.

## Actor Principal
Usuario Free / Usuario Pro

## Dependencias
- **SRC-FUN-008** (Auth & Cloud Sync) — detectar plan del usuario

## User Story
> Como negocio, quiero que la app genere ingresos vía anuncios y suscripciones Pro.

## Acceptance Criteria
1. Anuncios para usuarios free (DesktopAdColumn, MobileAdBars)
2. Modal de suscripción con planes Basic/Pro/Pyme
3. Stripe integrado con webhooks en producción
4. Anuncios ocultos automáticamente para usuarios con suscripción activa
5. AdSense IDs configurados vía environment variables

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| Stripe | Procesamiento de pagos |
| Firebase | Webhooks + validación |
| AdSense | Anuncios para free users |
| React 19 | UI de anuncios/suscripciones |

## Planes
| Plan | Precio | Features |
|------|--------|----------|
| Free | $0 | Core features, ads |
| Basic | TBD | No ads, cloud sync |
| Pro | TBD | AI assistant, reports avanzados |
| Pyme | TBD | Multi-user, roles |

## Detalles Técnicos
- **Anuncios:** Responsive (DesktopAdColumn lateral, MobileAdBars inferior)
- **Webhooks:** Stripe eventos verificados con firma en producción
- **Gating:** Feature flags por plan de suscripción
- **Environment:** AdSense IDs y Stripe keys via .env

## Commits Relacionados
```
feat(monetization): implement SRC-FUN-009 - ads & subscriptions
```
