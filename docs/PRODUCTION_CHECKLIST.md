# Shelf. Production Launch Checklist

This document provides a checklist of essential steps to ensure a smooth and secure launch of the Shelf. application into a production environment.

## 🚨 Priority 1: Critical for Security & Functionality

These items **must** be completed before deploying the application to the public. Failure to do so could result in data loss, security breaches, or a non-functional app.

-   **[ ] 1. Configure Firebase Project:**
    -   In `firebase.ts`, replace all placeholder values (`YOUR_API_KEY`, `YOUR_PROJECT_ID`, etc.) with the actual credentials from your Firebase project console under **Project Settings > General > Your apps**.

-   **[ ] 2. Secure Firestore Database:**
    -   In the Firebase console, go to **Firestore Database > Rules**.
    -   Copy the contents of the `firestore.rules` file from this project and paste them into the rules editor.
    -   **Publish** the rules. This is the most critical step to protect user data. The provided rules ensure users can only access their own data.

-   **[ ] 3. Update Application Domain:**
    -   In `index.html`, find the `hreflang` link tags.
    -   Replace the placeholder `https://your-app-url.com/` with your actual production domain. This is important for SEO and browser language features.

-   **[ ] 4. Set Up Authentication:**
    -   In the Firebase console, go to **Authentication > Sign-in method**.
    -   Enable the **Email/Password** provider.

-   **[ ] 5. Set Up Cloud Function Environment Variables:**
    -   You need to set your API keys and secrets for the Cloud Functions.
    -   Run the following commands in your terminal:
        ```bash
        # For Gemini API
        firebase functions:secrets:set API_KEY

        # For Stripe Integration (see docs/STRIPE_SETUP.md)
        firebase functions:secrets:set STRIPE_SECRET_KEY
        firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
        ```
    -   When prompted, paste your secret keys.
    -   Deploy your functions again to apply the secrets:
        ```bash
        firebase deploy --only functions
        ```

## 🟡 Priority 2: Recommended for a Professional Launch

These items are highly recommended for a good user experience and successful monetization.

-   **[ ] 1. Implement Real Advertising:**
    -   Follow the guide in `docs/ADS_SETUP.md`.
    -   Set up a Google AdSense account and create ad units.
    -   Update `index.html` and `.env` with your real publisher and ad slot IDs.

-   **[ ] 2. Implement Real Payments with Stripe:**
    -   Follow the new guide in `docs/STRIPE_SETUP.md`.
    -   Create products and prices in your Stripe dashboard to get real Price IDs.
    -   Update the placeholder Price IDs in `functions/src/index.ts`.
    -   Set up your Stripe webhook and secrets as described in the previous section.

-   **[ ] 3. Test Email Flows:**
    -   Test the password reset email flow provided by Firebase Authentication. You can customize the email template in the Firebase console.

-   **[ ] 4. Set Up a Custom Domain:**
    -   In Firebase Hosting, connect a custom domain to your project for a more professional URL.

## ✅ Priority 3: Final Polish

-   **[ ] 1. Review All Text Content:**
    -   Check for any typos or grammatical errors in all three language files (`en.json`, `es.json`, `pt.json`).
-   **[ ] 2. Create PWA Icons:**
    -   The `metadata.json` file uses placeholder icons. Create a set of app icons (at least 192x192 and 512x512) and update the paths.
-   **[ ] 3. Thorough Cross-Browser/Device Testing:**
    -   Test the application on major browsers (Chrome, Firefox, Safari) and on both iOS and Android mobile devices to catch any platform-specific issues.
