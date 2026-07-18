# [Ola H · 04] Monetization offline fallback + honest Stripe path (SRC-FUN-009)

> Wave: **Ola H — Close Partial Features**.  
> SSOT gap: SRC-FUN-009 ~78% — local tiers + ads gating work; `SubscriptionModal` always POSTs `/api/createCheckoutSession` which **does not exist** in monorepo → failed payments. Settings plan card can self-upgrade freely (offline-first by design) but UX is inconsistent.  
> Prefer PR base: **`develop`**.  
> **Do NOT implement a full live Stripe backend.** Offline-first product: graceful fallback.

## Web Research Required

1. Search: `"Stripe Checkout Session create serverless Vercel"` only to document env vars — do not add heavy Stripe SDK unless already present.
2. Prefer **zero new dependencies**. Use `fetch` + env flags.

## Exact Technical Context

### SubscriptionModal (`apps/shelf-inventory/components/SubscriptionModal.tsx` ~115 lines)

```ts
// ~lines 21–58 handleSelectPlan
const response = await fetch('/api/createCheckoutSession', { ... });
// always fails in local/dev → paymentError toast only
```

### Working local tier path

- `AuthContext.setSubscriptionTier(tier)` persists via `localAuth`
- `NetworkConfig` settings plan card (~line 364): `setSubscriptionTier(plan)` with `data-testid` set-tier-* (see `tests/subscription-gates.spec.ts`)
- `MainApp`: `showAds = isFree`

### Env already referenced in app

- AdSense: `VITE_ADSENSE_*`
- Possibly document `VITE_STRIPE_CHECKOUT_URL` or detect 404 on `/api/createCheckoutSession`

## Problem

Users clicking **Select Plan** in SubscriptionModal always hit a dead API. Settings already allows free local upgrade. Product feels broken rather than intentionally offline-first.

## Design (minimal)

### A. Detect Stripe availability

```ts
const stripeEnabled =
  import.meta.env.VITE_STRIPE_CHECKOUT_ENABLED === 'true' ||
  import.meta.env.VITE_ENABLE_STRIPE === 'true';
```

### B. `handleSelectPlan` behavior

1. If `stripeEnabled`: keep current `fetch('/api/createCheckoutSession')` path; on failure show clear error.
2. If **not** stripeEnabled **OR** fetch returns 404/network error:
   - Offer offline activation path:
     - Call `setSubscriptionTier(planId)` from `useAuth()`
     - `showNotification` success: e.g. "Plan local activado (modo offline). Stripe no configurado."
     - `closeSubscriptionModal()`
   - Do **not** leave user stuck on spinner (`hideLoading()` in all paths)

### C. Settings plan card honesty

In `NetworkConfig.tsx` plan buttons area (~settings-plan-card):
- Add short helper text under plan buttons: local plans are offline-first; payment when Stripe env enabled.
- Optional: confirm dialog when upgrading free→pro/pyme (`window.confirm` or existing modal pattern) — keep simple.

### D. Tests

Extend `apps/shelf-inventory/tests/subscription-gates.spec.ts`:
- Opening subscription modal and selecting plan **without** Stripe env still ends in Pro/Pyme tier (or settings path remains green).
- Do not require real Stripe.

## Acceptance Criteria

- [ ] SubscriptionModal never infinite-spins when `/api/createCheckoutSession` missing
- [ ] Offline fallback activates local tier via `setSubscriptionTier`
- [ ] When `VITE_STRIPE_CHECKOUT_ENABLED=true`, still attempts checkout fetch first
- [ ] Clear user-facing message distinguishing offline plan vs payment error
- [ ] Settings plan card still works; optional confirm not breaking `subscription-gates` tests
- [ ] No new npm dependencies
- [ ] Typecheck clean for touched files

## Files to Modify

| File | Change |
|------|--------|
| `apps/shelf-inventory/components/SubscriptionModal.tsx` | Stripe-or-offline branch |
| `apps/shelf-inventory/components/NetworkConfig.tsx` | Helper copy / optional confirm |
| `apps/shelf-inventory/tests/subscription-gates.spec.ts` | Assert offline path |
| locales en/es (optional) | strings for offline plan notice |

**DO NOT touch:** Stripe server implementation, Firebase functions, p2p crypto, CSV, invite roles.

**NEVER create `.patch` / root files.**

## Verification

```bash
pnpm --dir apps/shelf-inventory exec tsc --noEmit
# optional:
# pnpm --dir apps/shelf-inventory exec playwright test tests/subscription-gates.spec.ts
```

## Dependencies and Merge Order

- **Depends on:** nothing
- **Can run in parallel with:** 01, 02, 03
- **SRC-ID:** SRC-FUN-009 / ROADMAP-011 residual
