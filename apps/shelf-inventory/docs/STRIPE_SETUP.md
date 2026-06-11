# Shelf. Stripe Integration Setup Guide

This guide details the steps required to configure Stripe for handling Pro and PYME plan subscriptions in the Shelf. application.

## Overview

The application uses Stripe Checkout for a secure, hosted payment page. When a user subscribes:
1.  The app sends a request to a Firebase Cloud Function (`createCheckoutSession`).
2.  The function creates a Stripe Checkout session and returns a URL.
3.  The user is redirected to Stripe to complete the payment.
4.  After a successful payment, Stripe sends a webhook event to another Cloud Function (`stripeWebhook`).
5.  This webhook function securely verifies the event and updates the user's subscription tier in Firestore.

To make this work, you need to provide three secret values to your Firebase environment.

## Step 1: Create Products and Prices in Stripe

First, you need to create the "Pro" and "PYME" subscription products in your Stripe Dashboard.

1.  Log in to your [Stripe Dashboard](https://dashboard.stripe.com/).
2.  Go to the **Products** tab and click **+ Add product**.
3.  Create the **Pro** plan:
    -   **Name:** `Pro`
    -   Under **Pricing**, set the price (e.g., $5.00), select **Recurring**, and choose a billing period (e.g., Monthly).
    -   Click **Save product**.
4.  After saving, you'll be on the product details page. In the **Pricing** section, you will see a **Price ID**. It will look like `price_1P...`. **Copy this ID.**
5.  Repeat the process to create the **PYME** plan (e.g., with a price of $15.00/month) and **copy its Price ID**.

You will now have two Price IDs. These are not secret and will be placed in the function's code.

## Step 2: Get Your Stripe API Keys

1.  In the Stripe Dashboard, go to the **Developers** tab.
2.  Navigate to **API keys**.
3.  You will see your **Secret key**. It will look like `sk_test_...` or `sk_live_...`. **Copy this key.** This key is highly sensitive.

## Step 3: Create a Webhook Endpoint

Stripe needs to know where to send events like `checkout.session.completed`.

1.  First, deploy your Firebase Functions to get your function's URL.
    ```bash
    firebase deploy --only functions
    ```
2.  After deployment, go to your Firebase project console, navigate to the **Functions** tab, and find the `stripeWebhook` function. Copy its **Trigger URL**. It will look like `https://us-central1-your-project-id.cloudfunctions.net/stripeWebhook`.
3.  Back in the Stripe Dashboard, go to **Developers > Webhooks**.
4.  Click **+ Add an endpoint**.
    -   **Endpoint URL:** Paste the URL you copied from Firebase.
    -   **Listen to:** Click **Select events** and choose `checkout.session.completed`.
    -   Click **Add endpoint**.
5.  On the webhook details page, you will see a **Signing secret**. Click to reveal it. It will look like `whsec_...`. **Copy this secret.**

## Step 4: Set Secrets in Firebase

Now you have four critical pieces of information:
-   Your **Stripe Secret Key** (`sk_...`)
-   Your **Webhook Signing Secret** (`whsec_...`)
-   Your **Pro Plan Price ID** (`price_...`)
-   Your **PYME Plan Price ID** (`price_...`)

1.  **Set the secrets:** Open your terminal in the project directory and run these commands, pasting your keys when prompted:
    ```bash
    firebase functions:secrets:set STRIPE_SECRET_KEY
    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
    firebase functions:secrets:set STRIPE_PRO_PRICE_ID
    firebase functions:secrets:set STRIPE_PYME_PRICE_ID
    ```

2.  **Deploy your functions:** The final step is to deploy your functions so they have access to the secrets.
    ```bash
    firebase deploy --only functions
    ```

Your Stripe integration is now fully configured and ready for production!
