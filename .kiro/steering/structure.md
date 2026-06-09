# Project Structure

## Root Directory Layout

```
shelf/
├── components/          # React components (UI layer)
├── context/            # React Context providers (state management)
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and helpers
├── locales/            # i18n translation files
├── assets/             # Static assets (icons, images)
├── public/             # Public static files
├── cypress/            # E2E test suites
├── functions/          # Firebase Cloud Functions
├── docs/               # Documentation
├── .kiro/              # Kiro AI configuration
├── .github/            # GitHub Actions workflows
├── .husky/             # Git hooks
└── dist/               # Build output (generated)
```

## Key Files

### Entry Points
- `index.tsx` - Application entry point
- `App.tsx` - Root component with provider hierarchy
- `MainApp.tsx` - Main application shell (post-authentication)
- `index.html` - HTML template

### Configuration
- `vite.config.ts` - Vite build configuration
- `tsconfig.json` - TypeScript compiler options
- `biome.json` - Linting and formatting rules
- `firebase.ts` - Firebase SDK initialization
- `firebase.json` - Firebase project configuration
- `vercel.json` - Vercel deployment settings
- `cypress.config.ts` - Cypress test configuration

### Type Definitions
- `types.ts` - Global TypeScript interfaces and types
- `vite-env.d.ts` - Vite environment type declarations

### Styling
- `styles.css` - Global styles and Tailwind theme
- `constants.ts` - Shared constants and configuration values

## Component Organization

### Component Structure
All components live in `components/` as single files:
- `ComponentName.tsx` - Component implementation
- No separate `.css` files (use Tailwind classes)
- No index files (import directly from component file)

### Component Categories
- **Pages:** Dashboard, Inventory, Sales, Reports, Settings, etc.
- **Modals:** LoginModal, SignupModal, SubscriptionModal, etc.
- **UI Elements:** Sidebar, StatCard, Notification, Modal (base)
- **Feature Components:** BarcodeScanner, AIChat, Arqueo, AuditLogViewer
- **Landing:** LandingPage, WelcomeModal

## Context Providers

Located in `context/`, each provides specific state management:

- `AppContext.tsx` - Core app state (products, sales, clients, suppliers, purchase orders)
- `AuthContext.tsx` - Authentication state and user management
- `CurrencyContext.tsx` - Currency settings and formatting
- `I18nContext.tsx` - Internationalization and language switching
- `SubscriptionContext.tsx` - Pro tier subscription management
- `UIContext.tsx` - UI state (loading, notifications, modals)

### Provider Hierarchy (in App.tsx)
```
I18nProvider
  └─ UIProvider
      └─ AuthProvider
          └─ CurrencyProvider
              └─ SubscriptionProvider
                  └─ AppProvider
                      └─ AppContainer
```

## Custom Hooks

Located in `hooks/`, reusable logic patterns:
- `useLocalStorage` - Persistent local storage with React state
- `useErrorMonitoring` - Global error tracking
- Additional hooks for specific features

## Type System

### Core Entities (types.ts)
All entities extend `BaseEntity`:
```typescript
interface BaseEntity {
  id: string;
  isActive: boolean;
  updatedBy: string;  // Peer ID
  updatedAt: string;  // ISO timestamp
}
```

**Main Types:**
- `Product` - Inventory items
- `Sale` - Sales transactions with line items
- `Client` - Customer records
- `Supplier` - Vendor records
- `PurchaseOrder` - Supplier orders
- `User` - Authentication and subscription
- `TeamMember` - Collaboration users
- `PeerInfo` - P2P sync metadata
- `AuditEntry` - Change tracking logs
- `ArqueoSession` - Invoice scanning sessions

## State Management Pattern

### Local-First Architecture
1. **Primary Storage:** `localStorage` (via `useLocalStorage` hook)
2. **State Layer:** React Context API
3. **Cloud Sync:** Firebase Firestore (Pro tier only)
4. **P2P Sync:** PeerJS for real-time collaboration

### Data Flow
```
User Action → Context Method → Update localStorage → Update React State → Re-render
                                      ↓
                              (Pro) Sync to Firebase
```

## Routing

**No client-side routing library** (no React Router). Navigation handled via:
- State-based view switching in `MainApp.tsx`
- Modal overlays for authentication flows
- Conditional rendering based on `activeView` state

## Testing Structure

### Cypress E2E Tests (`cypress/e2e/`)
- `smoke.cy.ts` - Basic app functionality
- `inventory.cy.ts` - Product management
- `sales.cy.ts` - Sales workflow
- `clients.cy.ts` - Client management
- `suppliers.cy.ts` - Supplier management
- `purchase-orders.cy.ts` - Purchase order flow
- `arqueo.cy.ts` - Invoice scanning
- `settings.cy.ts` - Settings and configuration

## Naming Conventions

### Files
- **Components:** PascalCase (e.g., `Dashboard.tsx`, `LoginModal.tsx`)
- **Contexts:** PascalCase with "Context" suffix (e.g., `AppContext.tsx`)
- **Hooks:** camelCase with "use" prefix (e.g., `useLocalStorage.ts`)
- **Types:** `types.ts` (singular)
- **Constants:** `constants.ts` (singular)

### Code
- **Components:** PascalCase
- **Functions/Variables:** camelCase
- **Constants:** UPPER_SNAKE_CASE
- **Types/Interfaces:** PascalCase
- **Context Hooks:** `use` + ContextName (e.g., `useAuth()`, `useUI()`)

## Import Patterns

### Relative Imports
All imports use relative paths from project root:
```typescript
import { Product } from './types';
import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
```

### No Path Aliases
Project does not use TypeScript path aliases (`@/`, `~/`, etc.)

## Firebase Structure (Pro Features)

### Cloud Functions (`functions/`)
- Serverless backend logic
- Deployed separately from frontend
- Node.js with TypeScript

### Firestore Collections
- `users/` - User profiles and settings
- `products/` - Synced inventory
- `sales/` - Synced transactions
- `clients/` - Synced customer records
- `suppliers/` - Synced vendor records
- `purchaseOrders/` - Synced orders

## Build Artifacts

### Generated Directories (gitignored)
- `dist/` - Production build output
- `node_modules/` - Dependencies
- `.vercel/` - Vercel deployment cache
- `functions/lib/` - Compiled Cloud Functions

## Documentation

Key documentation files in root:
- `README.md` - Project overview and setup
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `FIREBASE_SETUP.md` - Firebase configuration
- `ARQUEO_IMPLEMENTATION.md` - Invoice scanning feature
- `CHANGELOG.md` - Version history
- `PLANNING.md` - Feature roadmap

## Development Workflow

1. **Local Development:** Edit files → Auto-reload via Vite HMR
2. **Code Quality:** Biome checks on save (if configured) + pre-commit hooks
3. **Testing:** Run Cypress tests before major changes
4. **Build:** `pnpm run build` → outputs to `dist/`
5. **Deploy:** Vercel CLI or GitHub Actions → production
