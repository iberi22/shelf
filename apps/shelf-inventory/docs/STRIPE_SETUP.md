# Shelf — Stripe Integration & SWAL Collaborator Guide

> **Ecosystem Rule:** **Pro = active SWAL node only — no Stripe as Pro unlock.**
> For local plans, all core features are free and offline-first. Advanced multi-instance P2P syncing or AI capabilities are gated by running an **active SWAL node** (via identity verification, heartbeat mesh, and staking/holding $SWAL).

Stripe is **NOT** used to purchase or unlock premium/Pro features directly. Instead, Stripe is optionally configured for specific token/revenue-sharing actions in the **SWAL Network**:
1. **Collaborator Profit-Sharing (Colaborador SWAL):** Processing and settling peer/collaborator transaction fee splits (25/15/10% profit-sharing model) under the decentralized consensus.
2. **Auxiliary Cloud Persistence Backend:** Optional payments for managing cloud synchronization backends if store operators require off-grid backup hosting (completely decoupled from the local-first mesh core).
3. **Fiat Token Staking Gateways:** Facilitating fiat-to-$SWAL token purchase/staking pipelines for node backing.

---

## Overview

When a collaborator payment, revenue share settlement, or optional cloud persistence subscription is initiated:
1. The app requests a checkout session from the configured backend (`createCheckoutSession`).
2. The function generates a Stripe Checkout session and returns a redirection URL.
3. The collaborator or operator is securely redirected to Stripe to complete the transaction.
4. After payment completion, Stripe sends a webhook event to another backend endpoint (`stripeWebhook`).
5. This webhook verifies the event signature and updates the collaborator's transaction status or backing record.

---

## Step 1: Configure Products & Payout Plans in Stripe

To support collaborator payments or profit-share backing:
1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/).
2. Go to the **Products** tab and click **+ Add product**.
3. Create the **Collaborator/Backup Billing** product:
   - **Name:** `SWAL Collaborator Hub` or `Store Backup Persistence`
   - Set the desired transaction pricing models (either flat or recurring).
4. After saving, copy the **Price ID** (e.g., `price_1P...`) from the product details. This ID can be passed to client-side configurations or cloud functions.

---

## Step 2: Retrieve Your Stripe API Keys

1. From the Stripe Dashboard, navigate to the **Developers** tab.
2. Under **API keys**, locate the **Secret key** (e.g., `sk_test_...` or `sk_live_...`).
3. **Copy this key.** This key is highly sensitive and should never be committed to git.

---

## Step 3: Set Up the Webhook Endpoint

Stripe relies on webhooks to report events such as `checkout.session.completed` for billing and settlements.

1. Deploy your serverless functions (such as the Cloud Functions / Firebase backend):
   ```bash
   firebase deploy --only functions
   ```
2. Retrieve the **Trigger URL** of your `stripeWebhook` function from the backend console (e.g., `https://us-central1-your-project-id.cloudfunctions.net/stripeWebhook`).
3. In the Stripe Dashboard, go to **Developers > Webhooks** and click **+ Add an endpoint**.
   - **Endpoint URL:** Paste your deployed function's Trigger URL.
   - **Listen to:** Select events like `checkout.session.completed` (or customer/payout events if handling collaborator payouts).
   - Click **Add endpoint**.
4. Reveal and copy the **Signing secret** (`whsec_...`).

---

## Step 4: Configure Environments & Secrets

To ensure your backend functions can process Stripe calls securely, define the secrets in your production environment:

1. **Set the secrets:**
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase functions:secrets:set STRIPE_PRO_PRICE_ID
   firebase functions:secrets:set STRIPE_PYME_PRICE_ID
   ```
2. **Redeploy backend functions:**
   ```bash
   firebase deploy --only functions
   ```

---

## Legacy/Offline Fallback Note

If Stripe is disabled or unconfigured (such as during offline operation or when `VITE_STRIPE_CHECKOUT_ENABLED` is not set), the application operates seamlessly under the local-only fallback. In this mode, collaborators can be added or authorized directly through post-quantum signed peer invitations, bypassing any external gateway payments.
