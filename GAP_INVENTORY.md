# GAP & UI COMPONENT INVENTORY REPORT: `@swal/ui` CORE CONSOLIDATION

## 📋 Executive Summary

As part of the **SWAL Core Consolidation Initiative (Sprint JULES-004)**, the architectural directive set by Xavier establishes that **ALL projects must use unified core packages** (`@swal/ui` for UI components, `Xavier` for memory, and `edge-mesh` for P2P networking), ensuring that only the specific business model differs across applications.

This report presents a thorough audit of the local UI components and raw Tailwind styling currently used in the `shelf-inventory` application, identifying duplicate interfaces that are ripe for migration to the unified `@swal/ui` core package.

Because `@swal/ui` is not currently published on the public npm registry nor available as a local workspace package within this repository, this document serves as the **official gap analysis and migration inventory** (the primary deliverable under the Failure Recovery Protocol).

---

## 🔍 The Gap Analysis

### Verification Findings
During the initial step of this sprint, the following checks were performed to locate and attempt installation of `@swal/ui`:
1. **npm Registry Check**: `npm info @swal/ui` and `pnpm info @swal/ui` returned `E404 Not Found`.
2. **Lockfile & Package Check**: Searched `pnpm-lock.yaml` and root `package.json` configurations; no references to `@swal/*` packages exist.
3. **Monorepo Workspaces Check**: Listed all workspace packages under `packages/` (`edge-mesh`, `edge-mesh-react`, `gpu-agent`, `p2p-mesh-core`). No local copy of `ui` or `@swal/ui` exists.

### Root Cause
`@swal/ui` is hosted in the centralized Platform workspace **Maloca** under `maloca/packages/@swal/ui`. Since the `shelf` repository is currently a standalone project decoupled from the central Maloca platform shell, the package cannot be resolved locally or fetched from a public package registry.

---

## 📦 UI Component Inventory & Mapping

The following catalog lists local components and inline styled elements in `apps/shelf-inventory` that duplicate standard UI paradigms. They have been mapped directly to their ideal `@swal/ui` equivalents for seamless future migration.

### 1. Button Components (Botones)
Instead of standard `<button>` tags with verbose, duplicated Tailwind inline styles, these should be replaced with the unified `<Button>` component from `@swal/ui`.

| Current Usage / Component Location | Style / Tailwind Classes | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **Primary Action Buttons** (e.g., *Add Product* in `Inventory.tsx` line 427) | `bg-[#4ADE80] text-[#161616] font-bold py-2.5 px-6 rounded-lg hover:bg-[#22C55E] hover:shadow-[0_0_15px_rgba(74,222,128,0.2)] active:scale-95 text-sm` | `<Button variant="primary">` (or `<Button color="green">`) |
| **Secondary Buttons** (e.g., *Export CSV* in `Inventory.tsx` line 398) | `bg-white/5 border border-white/10 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-white/10 transition-all active:scale-95 text-sm` | `<Button variant="secondary">` |
| **Flat Secondary / System Buttons** (e.g., *Add Sale* in `Sales.tsx` line 144) | `bg-[#F5F5DC] text-[#121212] font-bold py-2 px-4 rounded-lg hover:bg-opacity-80 active:scale-95 text-sm` | `<Button variant="system">` |
| **Danger Actions** (e.g., *Delete Product* in `Inventory.tsx` line 623) | `p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-all active:scale-90 ml-1` | `<Button variant="danger" size="icon">` |
| **Edit/Warn Actions** (e.g., *Edit Product* in `Inventory.tsx` line 612) | `p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded transition-all active:scale-90` | `<Button variant="warning" size="icon">` |

---

### 2. Input Components (Campos de Entrada)
Instead of using `<input className="..." />` with direct style variations (like custom focus rings and manual error borders), these should map to a standardized `<Input>` component.

| Current Usage / Component Location | Style / Tailwind Classes | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **Global Search Inputs** (e.g., `Inventory.tsx` line 377, `Sales.tsx`, `Clients.tsx`) | `w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#F5F5DC]/30 rounded-lg text-[#F5F5DC] focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 text-sm` | `<Input type="search" icon={<Search />} />` |
| **Standard Form Input** (e.g., Name, SKU, Price fields in `Inventory.tsx` lines 1380, 1396) | `w-full p-2 bg-[#121212] border border-[#F5F5DC]/30 rounded-md text-sm text-white` | `<Input type="text" />` |
| **Form Input with Errors** (e.g., Validation Errors in `Inventory.tsx` line 1385) | `border-red-400/70 bg-[#121212] border rounded-md` along with separate `<p className="text-red-400 text-xs mt-1">` | `<Input error={errors.name} ... />` |

---

### 3. Modal Components (Modales)
`shelf-inventory` currently contains a custom, portal-based modal wrapper in `apps/shelf-inventory/components/Modal.tsx`. Standardizing this with `@swal/ui` will consolidate the Portal container, transition animations, and overlay styling.

| Current Component / Location | Features / Custom Behavior | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **Generic Modal Wrapper** (`apps/shelf-inventory/components/Modal.tsx`) | Custom enter animations (`animate-modal-enter`), `createPortal` to `document.body`, absolute backdrop (`bg-black/70`), sizes `default` & `wide`. | `<Modal isOpen={isOpen} onClose={onClose} title={title}>` |
| **Ad-hoc Documentation Modal** (`apps/shelf-inventory/components/DocumentationModal.tsx`) | Completely hardcoded modal layout using custom viewport-centering styling (`backdrop-blur-sm p-4 md:p-10 z-[100]`). | Replace backdrop/structure with `@swal/ui` modal container, wrapping the tab content. |

---

### 4. Tab Components (Pestañas / Selectores)
All tabs in `shelf-inventory` are currently managed using local React state (e.g. `reportType` or `activeTab`) tied to groups of buttons styled as a single container. A unified `<Tabs>` component from `@swal/ui` will standardise this.

| Current Usage / Component Location | Code Structure / Styling | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **Report Switcher** (`Reports.tsx` line 364) | `<div className="flex bg-[#1a1a1a] p-1 rounded-lg border border-[#F5F5DC]/20">` mapping `<button>` tags toggling `'sales' \| 'consolidated-inventory'`. | `<Tabs value={reportType} onValueChange={setReportType}><TabsList>...` |
| **Documentation Categories** (`DocumentationModal.tsx` line 192) | Custom sidebar layout using buttons that switch active text colors, background tints (`bg-yellow-500/10`), and borders. | `<Tabs orientation="vertical">` |
| **Mobile Tab Menu** (`DocumentationModal.tsx` line 219) | Horizontal scrolling buttons (`overflow-x-auto flex-nowrap shrink-0`) with rounded-full pill states. | `<Tabs orientation="horizontal" variant="pills">` |

---

### 5. Badge Components (Etiquetas / Distintivos)
Status indicators are styled on-the-fly using highly specific Tailwind classes. Replacing these with a consolidated `<Badge>` component ensures visual consistency for status types.

| Current Usage / Location | Tailwind Styles | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **P2P Offline Badge** (`P2PSyncStatusHeader.tsx` line 113) | `flex min-h-[40px] items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-200` | `<Badge variant="warning">` |
| **Arqueo Session Status** (`Arqueo.tsx`) | `px-2 py-1 text-xs rounded-full font-bold bg-green-500/20 text-green-300` | `<Badge variant="success">` |
| **Purchase Order Status** (`PurchaseOrders.tsx`) | `px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-300 font-bold` | `<Badge variant="warning">` |

---

### 6. Card Components (Tarjetas)
`shelf-inventory` includes structured panels that group content. Standardizing cards will unify borders, background opacities, and hover hover-effects.

| Current Component / Location | Custom Behavior | Proposed `@swal/ui` Mapping |
| :--- | :--- | :--- |
| **Dashboard Indicator Cards** (`apps/shelf-inventory/components/StatCard.tsx`) | Semi-transparent glass background (`glass-panel p-6 hover:border-[#4ADE80]/30 transition-colors`), custom change directions ($\uparrow, \downarrow$). | `<StatCard title={...} value={...} change={...} icon={...} />` |
| **Advanced Collapsible Settings** (`apps/shelf-inventory/components/CollapsibleCard.tsx`) | Accordion panel with dynamic toggle states (`isOpen`), keyboard handlers (`onKeyDown`), and auto-expansion for test modes. | `<CollapsibleCard title={...} description={...} icon={...}>` |

---

## 🛠️ Code Migration Blueprint

Below is an engineering spec demonstrating how the code looks currently, and exactly how it will be modified when `@swal/ui` is integrated.

### Component: Modal & Button Replacement (e.g., `WelcomeModal.tsx`)

#### Before (Local & Raw HTML):
```tsx
import type React from 'react';
import { useState } from 'react';
import Modal from './Modal'; // Local component duplicate

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Welcome">
      <div className="space-y-4">
        <button
          onClick={onClose}
          className="w-full bg-[#4ADE80] text-[#161616] font-bold py-2 px-4 rounded-lg hover:bg-[#22C55E]"
        >
          Aceptar
        </button>
      </div>
    </Modal>
  );
};
```

#### After (Consolidated with `@swal/ui`):
```tsx
import type React from 'react';
import { useState } from 'react';
import { Modal, Button } from '@swal/ui'; // Consolidated import

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Welcome">
      <div className="space-y-4">
        <Button
          onClick={onClose}
          variant="primary"
          className="w-full"
        >
          Aceptar
        </Button>
      </div>
    </Modal>
  );
};
```

---

---

## 🎟️ Maloca Support Ticket Per-App Isolation Gap & Architecture Spec

### 🔍 Verification Findings
During the audit for task **[P0] Support isolation: Add per-app support tickets**, the following verification steps were conducted:
1. **Directory & Workspace Search**: Searched for `apps/maloca` and `swal-backoffice` across the repository.
2. **File Search**: Searched for `SupportPage.svelte` and `malocaClient.svelte.ts`.
3. **Result**: Neither `apps/maloca` nor Svelte-based backoffice applications exist inside this repository tree (`shelf`). `apps/maloca` is managed in the central Maloca platform repository.

### 🎯 Requirements & Data Architecture Spec

When `apps/maloca/apps/swal-backoffice` is integrated or synced, the following support ticket isolation specification must be implemented:

#### 1. Support Ticket Model Extension (`app_id`)
Support tickets must include an explicit `app_id` field to isolate tickets per application (e.g. `'shelf-inventory'`, `'maloca-salud'`, `'maloca-veeduria'`, etc.).

```typescript
// Proposed Type Definition in malocaClient.svelte.ts / types.ts
export interface SupportTicket {
  id: string;
  app_id: string; // Isolated application identifier (e.g. 'shelf-inventory')
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppSupportMetrics {
  app_id: string;
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  avg_resolution_time_ms: number;
}
```

#### 2. App Isolation in `malocaClient.svelte.ts`
The Maloca client state and API handlers must enforce per-app filtering and ticket querying:

```typescript
// Proposed implementation spec for malocaClient.svelte.ts
export class MalocaClient {
  private currentAppId: string = 'shelf-inventory';

  constructor(appId?: string) {
    if (appId) {
      this.currentAppId = appId;
    }
  }

  public setAppId(appId: string) {
    this.currentAppId = appId;
  }

  public getAppId(): string {
    return this.currentAppId;
  }

  // Fetch support tickets filtered strictly by current app_id
  public async getTicketsByApp(appId: string = this.currentAppId): Promise<SupportTicket[]> {
    const allTickets = await this.fetchSupportTickets();
    return allTickets.filter((ticket) => ticket.app_id === appId);
  }

  // Compute support metrics for a specific app
  public async getAppSupportMetrics(appId: string = this.currentAppId): Promise<AppSupportMetrics> {
    const tickets = await this.getTicketsByApp(appId);
    return {
      app_id: appId,
      total_tickets: tickets.length,
      open_tickets: tickets.filter((t) => t.status === 'open').length,
      in_progress_tickets: tickets.filter((t) => t.status === 'in_progress').length,
      resolved_tickets: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
      avg_resolution_time_ms: 0 // Computed based on created_at and updated_at
    };
  }

  // Create ticket attached to current app_id
  public async createTicket(ticketData: Omit<SupportTicket, 'id' | 'app_id' | 'created_at' | 'updated_at'>): Promise<SupportTicket> {
    const newTicket: SupportTicket = {
      ...ticketData,
      id: crypto.randomUUID(),
      app_id: this.currentAppId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // Persist via Edge Mesh / Yjs adapter
    return newTicket;
  }
}
```

#### 3. Filtering and Metrics UI in `SupportPage.svelte`
`SupportPage.svelte` must filter tickets by the active application context and display isolated support metrics per app.

```svelte
<!-- Proposed implementation spec for SupportPage.svelte -->
<script lang="ts">
  import { malocaClient } from '../lib/malocaClient.svelte';

  let selectedAppId = $state(malocaClient.getAppId() || 'shelf-inventory');
  let tickets = $state<SupportTicket[]>([]);
  let metrics = $state<AppSupportMetrics | null>(null);

  $effect(() => {
    loadAppSupportData(selectedAppId);
  });

  async function loadAppSupportData(appId: string) {
    tickets = await malocaClient.getTicketsByApp(appId);
    metrics = await malocaClient.getAppSupportMetrics(appId);
  }
</script>

<div class="support-page">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">App Support Portal</h1>

    <!-- App Context Filter Selector -->
    <select bind:value={selectedAppId} class="app-selector px-4 py-2 border rounded-lg">
      <option value="shelf-inventory">Shelf Inventory</option>
      <option value="maloca-salud">Maloca Salud</option>
      <option value="maloca-veeduria">Maloca Veeduria</option>
    </select>
  </header>

  {#if metrics}
    <div class="metrics-grid grid grid-cols-4 gap-4 mb-8">
      <div class="card p-4 rounded-lg bg-surface">
        <span class="text-sm text-muted">Total Tickets</span>
        <p class="text-xl font-bold">{metrics.total_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface">
        <span class="text-sm text-muted">Open</span>
        <p class="text-xl font-bold text-amber-500">{metrics.open_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface">
        <span class="text-sm text-muted">In Progress</span>
        <p class="text-xl font-bold text-blue-500">{metrics.in_progress_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface">
        <span class="text-sm text-muted">Resolved</span>
        <p class="text-xl font-bold text-emerald-500">{metrics.resolved_tickets}</p>
      </div>
    </div>
  {/if}

  <!-- Isolated Support Ticket List -->
  <div class="ticket-list">
    {#each tickets as ticket (ticket.id)}
      <div class="ticket-item p-4 mb-2 border rounded-lg flex justify-between">
        <div>
          <span class="badge text-xs px-2 py-1 bg-muted rounded">{ticket.app_id}</span>
          <h3 class="font-semibold text-lg inline ml-2">{ticket.title}</h3>
          <p class="text-sm text-muted">{ticket.description}</p>
        </div>
        <span class="status-badge status-{ticket.status}">{ticket.status}</span>
      </div>
    {/each}
  </div>
</div>
```

---

## 🚀 Recommendation & Integration Strategy

Once the `@swal/ui` package is published or the **Maloca** workspace dependency is linked into the `shelf` monorepo, follow these steps to perform the migration safely without visual regressions:

1. **Workspace Association**:
   Add the dependency to `apps/shelf-inventory/package.json`:
   ```json
   "dependencies": {
     "@swal/ui": "workspace:*"
   }
   ```
2. **Execute Gradual Replacement**:
   Perform replacement starting with core structural components:
   - Phase 1: Re-route `apps/shelf-inventory/components/Modal.tsx` exports to point directly to `@swal/ui`'s `Modal`.
   - Phase 2: Refactor general button definitions to `<Button>`.
   - Phase 3: Replace inputs, badges, cards, and custom tab switches.
3. **Continuous Verification**:
   Execute the local test suite continuously during replacement to capture visual and event regressions:
   ```bash
   pnpm --dir apps/shelf-inventory test:unit
   pnpm --dir apps/shelf-inventory test:ct
   pnpm --dir apps/shelf-inventory test:e2e
   ```
