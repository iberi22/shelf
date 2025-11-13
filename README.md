# Shelf. - Inventory Management PWA

**Shelf.** is a simple, modern, and powerful Progressive Web App (PWA) designed to help small business owners, e-commerce sellers, and artisans manage their inventory with ease. The app is built with an offline-first approach, ensuring that your data is always accessible, even without an internet connection.

**Slogan:** _Every item in its place._

## ✨ Features

-   **📊 Dashboard:** Get a quick overview of your business with key metrics like total revenue, profit, and stock levels.
-   **📦 Inventory Management:** Easily add, edit, and delete products. Track quantity, price, cost, and even add images.
-   **🛒 Sales Tracking:** Record sales effortlessly. Stock levels are automatically updated with each sale.
-   **👥 Contact Management:** Keep a record of your clients and suppliers in one place.
-   **🧾 Purchase Orders:** Create and manage purchase orders to suppliers and update your inventory automatically when items are received.
-   **📈 Advanced Reports:** Analyze your sales data with dynamic filters (date, product, client), charts for sales over time, and lists of top-selling products.
-   **⚙️ Settings:** Customize your experience with currency settings, low-stock alerts, and data management tools.
-   **🌐 Multi-language Support:** Available in English, Spanish, and Portuguese.
-   **📱 PWA & Offline-First:** Install Shelf. on your device and use it anywhere, anytime—even without an internet connection. All data is stored locally.

### 🚀 Pro Features

Upgrade to a Pro plan to unlock:

-   **☁️ Cloud Sync & Backup:** Securely sync your data across all your devices with Firebase.
-   **🤖 AI Assistant:** Get intelligent insights by asking questions about your business data in natural language, powered by Google Gemini.
-   **🚫 Ad-Free Experience:** Enjoy a clean, uninterrupted interface.

## 💻 Tech Stack

-   **Frontend:** React (with Vite), TypeScript
-   **Styling:** Tailwind CSS
-   **State Management:** React Context API
-   **Local Storage:** `localStorage` for offline-first data persistence.
-   **Backend & Database (Pro):** Firebase (Authentication, Firestore, Cloud Functions)
-   **AI:** Google Gemini
-   **Deployment:** Firebase Hosting

## 🚀 Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm or yarn
-   Firebase Account (for Pro features and deployment)

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd shelf-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

### Setting up Firebase (Optional, for Pro features)

1.  Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2.  Go to **Project Settings** and add a new Web App.
3.  Copy the `firebaseConfig` object.
4.  In the project, open `firebase.ts` and replace the placeholder configuration with your actual config.
5.  Follow the instructions in `docs/PRODUCTION_CHECKLIST.md` to enable Authentication, set up Firestore rules, and configure Cloud Functions.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
