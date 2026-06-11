# Tech Stack

## Core Technologies

### Frontend
- **React 19.2.6** with **TypeScript 6.0.3**
- **Vite 8.0.11** - Build tool and dev server
- **Tailwind CSS 4.3.0** - Utility-first styling with custom theme
- **React Context API** - State management (no Redux/Zustand)

### Backend & Services (Pro Features)
- **Firebase 12.13.0** - Authentication, Firestore, Cloud Functions
- **Google Gemini** (@google/genai) - AI assistant
- **Vercel** - Deployment platform

### Key Libraries
- **chart.js** + **react-chartjs-2** - Data visualization
- **jspdf** + **jspdf-autotable** - PDF generation
- **html5-qrcode** + **qrcode.react** - QR code scanning/generation
- **tesseract.js** - OCR for invoice scanning
- **peerjs** - P2P data sync
- **@mlc-ai/web-llm** - Local AI models

### Development Tools
- **Biome** - Linting and formatting (replaces ESLint + Prettier)
- **Cypress** - E2E testing
- **Husky** - Git hooks
- **PWA Plugin** (vite-plugin-pwa) - Service worker and manifest

## Build System

### Prerequisites
- Node.js v18+
- pnpm v9+

### Common Commands

```bash
# Development
pnpm run dev              # Start dev server on localhost:5173

# Build & Preview
pnpm run build            # TypeScript compile + Vite build
pnpm run preview          # Preview production build

# Code Quality
pnpm run lint             # Check code with Biome
pnpm run lint:fix         # Auto-fix issues with Biome
pnpm run format           # Format code with Biome

# Deployment
pnpm run vercel:pull:preview      # Pull Vercel preview env
pnpm run vercel:pull:production   # Pull Vercel production env
pnpm run vercel:build             # Build for Vercel
pnpm run vercel:deploy:preview    # Deploy to preview
pnpm run vercel:deploy:production # Deploy to production
```

### Testing
```bash
# E2E tests with Cypress
npx cypress open          # Interactive mode
npx cypress run           # Headless mode
```

## TypeScript Configuration

- **Target:** ES2020
- **Module:** ESNext with bundler resolution
- **Strict mode:** Enabled
- **JSX:** react-jsx
- **No unused locals/parameters:** Enforced
- **Includes:** Root-level .tsx/.ts files, components/, context/, hooks/

## Code Style (Biome)

### Formatting
- **Indent:** 2 spaces
- **Line width:** 120 characters
- **Quotes:** Single quotes for JS/TS
- **Semicolons:** Always required

### Linting
- **Base:** Recommended rules enabled
- **Relaxed rules:**
  - `noExplicitAny`: off (allows `any` type)
  - `noAssignInExpressions`: off
  - `noArrayIndexKey`: off
  - Accessibility rules relaxed for rapid development

### CSS
- **Tailwind directives:** Enabled
- **CSS linting/formatting:** Disabled (Tailwind handles styling)

## Styling Conventions

### Tailwind Theme
- **Font:** "Fira Code" monospace for all text
- **Colors:**
  - Background: `#121212` (dark)
  - Foreground: `#F5F5DC` (beige)
  - Primary: `#1e1e1e` (darker gray)
- **Custom animations:** fade-in, fade-in-down, modal-enter, slide-up

### CSS Architecture
- Use Tailwind utility classes in JSX
- Custom animations defined in `styles.css` with `@theme`
- Avoid writing custom CSS; prefer Tailwind utilities

## Build Output

- **Output directory:** `dist/`
- **Sourcemaps:** Disabled in production
- **Code splitting:**
  - `react-vendor` chunk (React + ReactDOM)
  - `firebase-vendor` chunk (Firebase SDK)
- **PWA assets:** Cached with Workbox (10MB max file size)

## Development Server

- **Port:** 5173
- **Host:** All interfaces (accessible on network)
- **Proxy:** `/ollama-api` → `http://localhost:11434` (for local AI)

## Firebase Configuration

For Pro features, Firebase config is in `firebase.ts`. Required services:
- **Authentication:** User accounts
- **Firestore:** Cloud database
- **Cloud Functions:** Backend logic
- **Hosting:** Production deployment

See `FIREBASE_SETUP.md` for detailed setup instructions.
