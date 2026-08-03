# SRC-FUN-009: Monetization — Colaborador SWAL

- **ID:** SRC-FUN-009
- **Nombre:** Monetization — Colaborador SWAL
- **Prioridad:** P0 (Core)
- **Estado:** Implemented
- **Implementation:** 90%
- **Categoría:** FUN (Funcionalidades Core)
- **SDLC:** Hardening
- **SSOT:** `.gitcore/features.json` and `.gitcore/features-details.json`

> **Audit 2026-07-18:** 90% · implemented · maturity `integrated`. SSOT: `.gitcore/features.json`.

## Descripción
La monetización de Shelf sigue el **Modelo Colaborador SWAL**: todas las funcionalidades del core de la aplicación son gratuitas y locales. Se eliminan los anuncios tradicionales y las suscripciones SaaS para desbloquear funciones. Las características Pro se habilitan mediante un **nodo SWAL activo**. El procesamiento con Stripe queda relegado de forma exclusiva a flujos de soporte opcionales: reparto de ingresos de colaboradores (profit-share 25/15/10%), soporte voluntario a la infraestructura cloud o pasarela fiat para la adquisición de tokens $SWAL para staking.

## Actor Principal
Todos los usuarios (Free, Pro con nodo, Colaboradores)

## Dependencias
- **SRC-FUN-008** (Auth (Local) & Device Security) — detección de la identidad local

## User Story
> Como usuario, quiero usar todas las características locales del inventario de forma gratuita y sin anuncios intrusivos, participando activamente del ecosistema SWAL mediante un nodo si requiero capacidades multi-instancia avanzadas.

## Acceptance Criteria
1. **Acceso Sin Restricciones Locales:** Todas las características principales se pueden utilizar localmente sin limitaciones de planes de suscripción.
2. **Sin Anuncios Intrusivos:** No se muestran unidades de AdSense o bloques publicitarios en la interfaz del usuario.
3. **Estado Pro mediante Nodo SWAL:** Las funciones avanzadas (como IA, sincronización avanzada multidevice y analíticas pro) se activan únicamente cuando se detecta un **nodo SWAL activo** (sin depender de un pago por Stripe).
4. **Stripe Opcional / Auxiliar:** Integración con Stripe (checkout y webhooks) configurada únicamente para pagos voluntarios de persistencia en la nube, payouts de colaboradores bajo el modelo profit-share, o staking.
5. **Seguridad y Webhooks de Stripe (Legacy/Auxiliar):** Verificación segura de firmas para webhooks configurada en el backend para procesar las transacciones opcionales.

## Stack Tecnológico
| Tecnología | Uso |
|------------|-----|
| React 19 / Context | UI simplificada sin barreras de pago locales |
| Stripe SDK | (Opcional) Procesamiento de pagos auxiliares, donaciones o profit-sharing |
| Firebase | Webhooks y validación segura para la sincronización opcional con la nube |
| PeerJS / Yjs | Sincronización descentralizada p2p de datos |

## Planes de Monetización
| Nivel (Tier) | Requisito | Capacidades |
|--------------|-----------|-------------|
| **Free** | Sin nodo activo | Core de inventario, punto de venta local, 1 instancia local |
| **Pro (SWAL)** | `swalNode.status === "active"` | IA de negocio (Xavier), sincronización multi-sucursal vinculada, analíticas Pro |

## Detalles Técnicos
- **Gating de Funciones:** Controlado por el estado de activación del nodo SWAL en lugar de un indicador booleano de suscripción Stripe.
- **Webhooks:** Gestión robusta de eventos de Stripe en el backend para sincronizar el estado de persistencia opcional en la nube de forma segura.
- **Cero Anuncios:** Se han retirado los componentes heredados de `Ads.tsx` o `AdSenseUnit.tsx` de la pantalla principal para priorizar la experiencia offline limpia.

## Commits Relacionados
```
feat(monetization): implement SRC-FUN-009 - ads & subscriptions
feat(monetization): align monetization to Colaborador SWAL model & node active status
```
