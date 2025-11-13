# Shelf. Task & Progress Tracker

This document tracks the development progress of the Shelf. application based on the initial planning.

## ✅ Completed - v1.0 (MVP)

-   [x] **Dashboard:** Implemented with key metric cards (Revenue, Profit, Sales, Products).
-   [x] **Inventory Management:** Full CRUD functionality for products.
-   [x] **Sales Management:** Sales recording with automatic stock decrementation.
-   [x] **Client Management:** Full CRUD for clients.
-   [x] **Supplier Management:** Full CRUD for suppliers.
-   [x] **Offline First:** Application state is persisted in `localStorage`.
-   [x] **Responsive Design:** UI is mobile-first and works across all screen sizes.
-   [x] **Minimalist Theme:** Dark theme with Fira Code font is applied globally.

## ✅ Completed - v1.1 (Pro Features & Monetization)

-   [x] **Firebase Authentication:** User login/signup with email and password is functional.
-   [x] **Cloud Sync:** Basic logic for syncing local state to Firestore is implemented (can be expanded).
-   [x] **Advertising:** Ad components (`DesktopAdColumn`, `MobileAdBars`) are in place and show placeholders in dev mode. Logic to hide ads for Pro users is implemented.
-   [x] **Subscription Modal:** A UI modal showcases Pro plans.
-   [x] **Settings:**
    -   [x] JSON backup and restore functionality is complete.
    -   [x] Data reset option is working.
    -   [x] Language toggle (EN, ES, PT) is implemented.
    -   [x] Currency and number format selection is complete.
    -   [x] Low-stock threshold setting is implemented.

## ✅ Completed - v1.2 (Advanced Features)

-   [x] **Barcode/QR Scanner:** Implemented using `html5-qrcode` for SKU entry.
-   [x] **AI Assistant:** A chat interface is integrated into the reports page, connected to a Firebase Cloud Function proxy for the Gemini API. Gated for Pro users.
-   [x] **Reporting:**
    - [x] Basic charts for sales over time.
    - [x] Top-selling products list.
    - [x] Advanced filters by date, product, and client.

## ✅ Completed - Final Polish

-   [x] **Purchase Orders:** Module to create and manage purchase orders. Stock is automatically updated when an order is marked as "received".
-   [x] **Data Import:** Allow users to import their existing inventory from a CSV file.
-   [x] **Dashboard Customization:** Let users choose which stats to display on their dashboard.
-   [x] **Advanced Charting:** Use a dedicated charting library for more complex visualizations (e.g., profit margins over time, inventory value).
-   [x] **Multi-user Access (Pyme Plan):** Allow a business owner to invite team members with specific roles and permissions.
-   [x] **Code Refactoring:** Abstracted `Clients` and `Suppliers` components into a single generic `ContactManagementPage` to eliminate over 300 lines of duplicated code, improving maintainability.
-   [x] **End-to-End Testing:** Prepared the application for testing by adding `data-testid` attributes to all key interactive elements, making them easily selectable by testing frameworks.
-   [x] **Production Configuration:** Moved sensitive configuration (AdSense IDs) to environment variables for better security and management.

---

## ✅ Completed - Phase 1: Production Readiness

This phase focuses on making the application secure, configurable, and ready for a public launch.

-   [x] **Finalize Stripe Integration:** Replaced mock payment logic with a production-ready implementation using the Stripe SDK. Implemented secure webhook signature verification.
-   [x] **Configure Production Firebase Keys:** Update the frontend with real Firebase project credentials.
-   [x] **Publish Firestore Rules:** Secure the database by publishing the provided security rules.
-   [x] **Set Cloud Function Secrets:** Configure `API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` in the Google Cloud environment.

---
## 📈 Phase 2: Maintenance & Growth (Post-Launch)

Once the application is live, this phase focuses on ensuring its stability and understanding user behavior.

-   [ ] **Implement Error Monitoring:** Integrate a service like Sentry or Firebase Crashlytics to proactively track and fix bugs.
-   [ ] **Set Up User Analytics:** Integrate a tool like Google Analytics to understand user flows and feature adoption.
-   [x] **Create a Feedback Channel:** Add a simple way for users to report issues or suggest features.

---
## 🗺️ Phase 3: Future Roadmap

This phase outlines potential new features to add significant value to the application.

-   [ ] **Implement Full Cloud Sync:** Develop the mechanism to sync the entire application state (products, sales, etc.) with Firestore for Pro users, enabling true multi-device access.
-   [ ] **Implement Multi-user Logic (Backend):** Build the server-side logic for inviting users, managing roles, and enforcing permissions.
-   [ ] **Advanced Reporting Suite:** Add more detailed reports like profit margin analysis, inventory turnover, and customer lifetime value.
-   [ ] **E-commerce Integrations:** Allow users to connect their stores (e.g., Shopify, WooCommerce) to sync products and sales automatically.