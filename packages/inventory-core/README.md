# @swal/inventory-core

This package extracts the core inventory domain types and pure business logic out of `p2p-mesh-core` and the `shelf-inventory` application into a standalone module.

## Contents
- **Domain Types (`src/domain/`)**: Shared types like `Product`, `Sale`, `PurchaseOrder`, `Branch`, and `InventoryConfig`.
- **Pure Logic (`src/logic/`)**: Functions handling variant calculation, CSV product imports, and basic configuration checks, with no side effects.

## What is NOT included
- Ports, adapters, and repositories (e.g., `InventoryRepository`).
- UI logic, React hooks, or Views (e.g., read-only warehouse view).
- P2P sync logic or integrations like Firebase/Supabase/Yjs.

This represents Layer 4 (Core Domain Foundation) in the SWAL architecture.
