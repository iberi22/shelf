# Shelf. Planning Document

## Core Objective

Create a simple, modern, and powerful inventory management PWA named "Shelf." that is intuitive for small business owners. The app should be offline-first, cloud-syncable for premium users, and monetizable through ads (for free users) and subscriptions (for Pro features).

## Target Audience

- Small retail shop owners
- E-commerce sellers on platforms like Etsy, Mercado Libre, or Instagram
- Artisans and crafters who manage a small inventory
- Warehouse managers in small companies

## Key Pain Points to Solve

- Complexity of existing inventory software.
- High cost of traditional POS and inventory systems.
- Difficulty tracking stock levels accurately, leading to stockouts or overstocking.
- Lack of a centralized place for product, sales, client, and supplier information.
- Inability to access inventory data on the go (mobile).

## Feature Set

### v1.0 (MVP)

- **[Core] Dashboard:** Overview of key metrics (Total Revenue, Profit, Total Products).
- **[Core] Inventory Management:** CRUD for products (name, SKU, quantity, price, cost).
- **[Core] Sales Management:** Record a sale, which automatically decrements product quantity.
- **[Core] Client Management:** Basic CRUD for clients (name, phone, email).
- **[Core] Supplier Management:** Basic CRUD for suppliers (name, phone, email).
- **[Data] Offline First:** Use `localStorage` to ensure the app is fully functional without an internet connection.
- **[UI] Responsive Design:** Mobile-first approach, fully usable on all screen sizes.
- **[UI] Minimalist Theme:** Dark background, bone-white text, Fira Code font.

### v1.1 (Pro Features & Monetization)

- **[Pro] Firebase Authentication:** User login/signup with email and password.
- **[Pro] Cloud Sync:** Sync `localStorage` state with Firestore for logged-in users.
- **[Monetization] Ads:** Implement ad slots for free/anonymous users.
- **[Monetization] Subscription Modal:** Create a modal to showcase Pro plans (`basic`, `pro`, `pyme`).
- **[Core] Settings:**
  - Data reset option.
  - JSON backup and restore.
  - Language toggle (EN, ES, PT).
  - Currency selection.

### v1.2 (Advanced Features)

- **[Core] Reporting:** Basic reports page with charts for sales over time and top-selling products.
- **[Pro] AI Assistant:** Integrate Gemini API for users to ask questions about their inventory data.
- **[Core] Barcode/QR Scanner:** Use the device camera to scan and populate the SKU field.

## UI/UX Principles

- **Simplicity:** Avoid clutter. Every element should have a clear purpose.
- **Clarity:** Use clear labels, good contrast, and a readable font (`Fira Code`).
- **Efficiency:** The user should be able to perform core tasks (add product, record sale) with minimal clicks.
- **Consistency:** Maintain a consistent layout and component design across all pages.
- **Branding:** The brand "Shelf." with the slogan "Every item in its place." should evoke a sense of calm, order, and control.

## Monetization Strategy

- **Free Tier:**
  - Full access to core local features (inventory, sales, contacts).
  - Data is stored only on the device's `localStorage`.
  - Non-intrusive ads are displayed.
- **Pro Tier (Subscription):**
  - All free features.
  - Cloud sync and backup.
  - AI-powered reporting and insights.
  - Ad-free experience.
  - Access to future premium features.

## Technical Architecture

- **Frontend:** React (Vite) + TypeScript.
- **State Management:** React Context API (`useReducer` for app state, `useState` for UI state).
- **Persistence:**
  - `localStorage` for offline/anonymous users.
  - Firebase Firestore for authenticated users.
- **Styling:** Tailwind CSS.
- **Backend Logic:** Firebase Cloud Functions (for AI chat proxy).
- **Deployment:** Firebase Hosting.
