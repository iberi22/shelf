/**
 * test-setup.test.ts
 *
 * Configuración global de tests para el monorepo Shelf.
 * Proporciona utilidades compartidas para todos los tests.
 */

// ============================================================================
// Mocks Globales
// ============================================================================

// Mock de localStorage para entorno Node.js (tests)
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => {
      return Object.keys(store)[index] ?? null;
    },
  };
})();

// Asignar mock a globalThis para tests
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Crea un producto de prueba para usar en tests de inventario.
 */
export function createTestProduct(overrides?: Partial<ProductTestData>): ProductTestData {
  return {
    id: `test-${Date.now()}`,
    sku: `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    name: 'Producto de Prueba',
    quantity: 10,
    price: 25.99,
    cost: 15.50,
    ...overrides,
  };
}

/**
 * Crea una venta de prueba.
 */
export function createTestSale(overrides?: Partial<SaleTestData>): SaleTestData {
  return {
    id: `sale-${Date.now()}`,
    products: [createTestProduct()],
    total: 25.99,
    date: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Types de Test
// ============================================================================

interface ProductTestData {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
  [key: string]: unknown;
}

interface SaleTestData {
  id: string;
  products: ProductTestData[];
  total: number;
  date: string;
  [key: string]: unknown;
}

// ============================================================================
// Setup Global
// ============================================================================

beforeAll(() => {
  // Limpiar localStorage antes de cada suite
  localStorage.clear();
  console.log('[test-setup] Test environment initialized');
});

afterAll(() => {
  console.log('[test-setup] Test environment teardown complete');
});
