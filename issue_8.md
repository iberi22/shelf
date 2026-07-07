## Problem
Inventory does not sync with external stores.

## Solution
Create Edge functions (Vercel) to listen for Shopify/WooCommerce webhooks and update the CRDT state accordingly.

## Testing
- Unit test the webhook payload parsers.
- E2E test simulating a Shopify order webhook.