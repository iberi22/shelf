# Stripe & Local Plans (SRC-FUN-009)

**Updated:** 2026-07-17  
**SSOT:** `.gitcore/features.json`

## Product model (offline-first)

| Tier | Ads | Pro features (AI, advanced gates) | How to set |
|------|-----|-----------------------------------|------------|
| `free` | Yes | No | Settings → Plan, or new local account default |
| `pro` | No | Yes | Settings → Plan / Stripe checkout (optional) |
| `pyme` | No | Yes (+ multi-user P2P) | Settings → Plan / Stripe checkout (optional) |

Runtime source of truth: `user.subscriptionTier` via `AuthContext` → `SubscriptionContext`.

### Demo / E2E override

- `localStorage.shelf_demo_full_access = "true"` forces **pyme** effective tier (Playwright helpers).
- Setting plan to **free** in Settings clears this flag.

## Stripe (optional remote)

- UI: `SubscriptionModal` → `POST /api/createCheckoutSession` with `Bearer` token.
- Local auth tokens are **not** cloud JWTs (`local-token-not-needed` / `guest-token`).
- Production requires a backend that validates identity and creates Stripe Checkout Sessions + webhooks.
- Without backend, **local plan buttons** remain the supported path.

## Ads

- `DesktopAdColumn` / `MobileAdBars` render only when `isFree`.
- AdSense client/slot: `VITE_ADSENSE_CLIENT_ID`, `VITE_ADSENSE_DESKTOP_SLOT_ID`, `VITE_ADSENSE_MOBILE_SLOT_ID`.

## Honest status

Stripe **live** webhooks are **not** fully implemented in this monorepo. Feature % for FUN-009 reflects local gating + UI, not SaaS billing ops.
