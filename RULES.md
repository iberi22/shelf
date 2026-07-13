# RULES.md — Reglas de Codificación para Shelf

**Última actualización:** 2026-07-09

---

## 📜 Reglas Generales

### 1. Lenguaje y Estilo
- **Idioma del código**: Inglés (variables, funciones, comentarios técnicos)
- **Idioma de UI**: Español (por defecto), con soporte multi-idioma vía archivos de locales
- **TypeScript**: Strict mode, `noImplicitAny`, `strictNullChecks`
- **Formato**: Biome (sin excepciones)

### 2. Estructura del Código

```typescript
// ✅ Correcto: Tipos explícitos, nombres descriptivos
interface Product {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
}

// ❌ Incorrecto: any, nombres genéricos
const getData = (id: any) => { ... }
```

### 3. React Components

```typescript
// ✅ Correcto: Functional components, props tipadas, hooks claros
interface InventoryListProps {
  products: Product[];
  onEdit: (product: Product) => void;
}

function InventoryList({ products, onEdit }: InventoryListProps) {
  // ...
}

// ❌ Incorrecto: class components, props sin tipar
class InventoryList extends React.Component { ... }
```

---

## 🏗️ Reglas del Monorepo

| Regla | Descripción |
|-------|-------------|
| **Workspaces** | Todo código vivo está en `apps/` o `packages/` |
| **Raíz** | Solo configs (package.json, turbo.json, tsconfig) |
| **Dependencias** | Preferir `@shelf/*` packages sobre librerías externas |
| **Public API** | Packages exponen vía `index.ts` en raíz |
| **Tipos compartidos** | En cada package, no en un `shared` global |

---

## 📦 Reglas de Paquetes (@shelf/*)

```bash
packages/
├── edge-mesh/           # Runtime P2P
│   ├── src/             # Código fuente
│   ├── tests/           # Tests unitarios
│   └── package.json     # name: "@shelf/edge-mesh"
├── edge-mesh-react/     # React bindings
├── gpu-agent/           # WebGPU
└── p2p-mesh-core/       # Legacy P2P
```

### Convenciones
- `package.json.name` → `@shelf/<nombre>`
- Entry point → `src/index.ts`
- Tests → `tests/` con sufijo `.test.ts`
- README obligatorio

---

## 🔒 Reglas de Seguridad

1. **Nunca** hardcodees API keys, tokens o secrets
2. **Siempre** usa variables de entorno (`.env`)
3. **Cifrado post-cuántico** obligatorio para datos sensibles
4. **Sanitiza** inputs de usuario (especialmente importación CSV)
5. **Auth checks** en todas las mutaciones remotas vía Security Guard

---

## 🧪 Reglas de Testing

- **Nuevo feature → Nuevos tests** (sin excepción)
- **data-testid** en todos los elementos interactivos
- Tests E2E para flujos críticos (inventario, ventas, P2P sync)
- Tests unitarios para lógica de negocio pura
- `pnpm lint` debe pasar antes de commit

---

## 📝 Reglas de Commits

```
<type>(<scope>): <description> (<SRC-ID>)

Ejemplos:
feat(inventory): implement CRUD operations (SRC-FUN-001)
fix(sync): resolve race condition in edge-mesh broadcast (SRC-EDGE-001)
test(p2p): add E2E test for peer reconnection (SRC-P2P-001)
```

**Types permitidos**: feat, fix, chore, docs, test, refactor, perf, style, build, ci, revert

---

## 🚫 Lo que NO está permitido

- ❌ `any` types sin justificación documentada
- ❌ Dependencias nuevas sin aprobación de BELA
- ❌ Código muerto/comentado
- ❌ Console.log en producción
- ❌ Archivos grandes (>500 líneas) sin justificación
- ❌ Modificaciones a `.gitcore/ARCHITECTURE.md`
- ❌ Push directo a `main`
