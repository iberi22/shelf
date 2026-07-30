# Shelf — Nodo SWAL y planes (SRC-FUN-009)

> **Canónico ecosistema:** [`docs/SWAL/README.md`](../../docs/SWAL/README.md)  
> **Detalle nodo/instancias:** [`docs/SWAL/NODE_PRO_AND_INSTANCES.md`](../../docs/SWAL/NODE_PRO_AND_INSTANCES.md)  
> **Fecha:** 2026-07-17  
> **Stripe para Pro: ELIMINADO / DEPRECADO**

## Modelo actual (canónico)

| Tier efectivo | Condición | Capacidades |
|---------------|-----------|-------------|
| **Free** | Sin nodo SWAL activo | Uso core de inventario, una instance local |
| **Pro** | `swalNode.status === "active"` | Agent AI, sync avanzado, multi-instance **vinculable**, analytics Pro |

```text
Pro  ⇔  nodo SWAL activo
NO   ⇔  Stripe Checkout / webhooks / Customer Portal
```

### Runtime (objetivo)

- Source of truth Pro: **estado del nodo** (heartbeat mesh + identidad + Xavier reachable).  
- Legacy: `user.subscriptionTier` / `SubscriptionContext` → migrar a `SwalNodeContext`.  
- `instance_id` por negocio/tienda; mesh `swal/shelf/{instance_id}/…`.  
- Dos tiendas Shelf en el mismo dispositivo = **datos desacoplados** hasta vínculo opt-in.

## Stripe (legacy)

El documento anterior `STRIPE_AND_PLANS.md` y el código de checkout quedan como **legacy**:

- No implementar webhooks live para desbloquear Pro SWAL.  
- No documentar Stripe como camino de upgrade.  
- PRs nuevos que reintroduzcan Stripe→Pro deben rechazarse.

Si existe cobro a terceros por **otro** motivo (no aplica al core Shelf actual), no se usa como gate Pro.

## Free vs Pro (Shelf)

| Feature | Free | Pro (nodo) |
|---------|------|------------|
| Inventario local | ✅ | ✅ |
| P2P básico | limitado | ✅ edge-mesh full |
| AI agent / WebLLM workflows avanzados | demo/off | ✅ + Xavier memory |
| Multi-sucursal vinculada | ❌ | ✅ opt-in |
| Data rewards red | 0/micro | ✅ |

## Open work

1. Implementar `SwalNodeProvider` + gate en UI Pro.  
2. Migrar `SubscriptionContext` → node status.  
3. Persistir `instance_id` y namespaces mesh.  
4. Integrar `xavier-client` en AIChat.  
5. Retirar/aislar rutas Stripe del build de producto.  
