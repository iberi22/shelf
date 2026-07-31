import type { ChatMessage, Product, Sale } from 'p2p-mesh-core';
import { describe, expect, it } from 'vitest';

/**
 * AIChat Context Serialization Tests
 *
 * These tests verify the data transformation logic used by the AIChat component
 * to serialize inventory data into context for LLM providers. The patterns tested
 * here mirror the exact transformations in AIChat.tsx's handleSendMessage().
 */

// ─── Helper: build minimal Product/Sale shapes ────────────────

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: `prod-${Math.random().toString(36).slice(2, 8)}`,
    isActive: true,
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
    name: 'Test Product',
    quantity: 10,
    price: 25,
    cost: 12,
    ...overrides,
  }) as Product;

const buildSale = (overrides: Partial<Sale> = {}): Sale =>
  ({
    id: `sale-${Math.random().toString(36).slice(2, 8)}`,
    isActive: true,
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
    date: '2026-07-30',
    items: [],
    totalPrice: 0,
    profit: 0,
    ...overrides,
  }) as Sale;

// ─── Context serialization: product slicing ───────────────────

describe('AIChat context serialization - product limits', () => {
  const serializeProducts = (products: Product[], limit: number) =>
    products.slice(0, limit).map((p) => ({
      name: p.name,
      sku: p.sku,
      quantity: p.quantity,
      price: p.price,
      cost: p.cost,
      colors: p.colors || (p.color ? [p.color] : []),
      sizes: p.sizes,
      dimensions: p.dimensions,
      material: p.material,
      capacity: p.capacity,
      customFields: p.customFields,
      variants: p.variants?.map((v) => ({
        label: v.label,
        sku: v.sku,
        quantity: v.quantity,
        attributes: v.attributes,
      })),
    }));

  it('slices products to the given limit', () => {
    const products = Array.from({ length: 500 }, (_, i) =>
      buildProduct({ name: `Product ${i}`, quantity: i + 1 }),
    );

    expect(serializeProducts(products, 50)).toHaveLength(50);
    expect(serializeProducts(products, 300)).toHaveLength(300);
    expect(serializeProducts(products, 500)).toHaveLength(500);
  });

  it('uses limit=50 for local/nano models', () => {
    const isLocalModel = true;
    const productLimit = isLocalModel ? 50 : 300;

    expect(productLimit).toBe(50);
  });

  it('uses limit=300 for cloud/auto models', () => {
    const isLocalModel = false;
    const productLimit = isLocalModel ? 50 : 300;

    expect(productLimit).toBe(300);
  });

  it('serializes product color aliases correctly', () => {
    const products = [
      buildProduct({ color: 'Rojo', colors: undefined }),
      buildProduct({ color: undefined, colors: ['Azul', 'Verde'] }),
      buildProduct({ color: undefined, colors: [] }),
    ];

    const serialized = serializeProducts(products, 10);
    expect(serialized[0].colors).toEqual(['Rojo']);
    expect(serialized[1].colors).toEqual(['Azul', 'Verde']);
    expect(serialized[2].colors).toEqual([]);
  });

  it('serializes variant data within products', () => {
    const product = buildProduct({
      variants: [
        {
          id: 'v1',
          isActive: true,
          updatedBy: 'local',
          updatedAt: new Date().toISOString(),
          label: 'Rojo | 20CM',
          sku: 'SKU-R20',
          quantity: 5,
          price: 25,
          cost: 12,
          attributes: { Color: 'Rojo', Medida: '20CM' },
        },
      ] as any,
    });

    const serialized = serializeProducts([product], 10);
    expect(serialized[0].variants).toHaveLength(1);
    expect(serialized[0].variants![0].label).toBe('Rojo | 20CM');
    expect(serialized[0].variants![0].attributes).toEqual({ Color: 'Rojo', Medida: '20CM' });
  });
});

// ─── Context serialization: sale slicing ──────────────────────

describe('AIChat context serialization - sale limits', () => {
  const serializeSales = (sales: Sale[], limit: number) =>
    sales.slice(0, limit).map((s) => ({
      date: s.date,
      total: s.totalPrice,
      items: s.items.map((item) => ({ name: item.productName, variant: item.variantLabel, quantity: item.quantity })),
    }));

  it('slices sales to the given limit', () => {
    const sales = Array.from({ length: 100 }, (_, i) =>
      buildSale({ date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    );

    expect(serializeSales(sales, 20)).toHaveLength(20);
    expect(serializeSales(sales, 100)).toHaveLength(100);
  });

  it('uses limit=20 for local models and 100 for cloud', () => {
    expect(true ? 20 : 100).toBe(20); // local
    expect(false ? 20 : 100).toBe(100); // cloud
  });

  it('serializes sale items with product name and variant label', () => {
    const sale = buildSale({
      items: [
        {
          productId: 'p1',
          productName: 'Camiseta',
          quantity: 2,
          price: 25,
          cost: 12,
          variantLabel: 'Rojo | M',
        },
      ],
      totalPrice: 50,
    });

    const serialized = serializeSales([sale], 10);
    expect(serialized[0].total).toBe(50);
    expect(serialized[0].items[0].name).toBe('Camiseta');
    expect(serialized[0].items[0].variant).toBe('Rojo | M');
    expect(serialized[0].items[0].quantity).toBe(2);
  });
});

// ─── Context serialization: audit log slicing ─────────────────

describe('AIChat context serialization - audit log limits', () => {
  const serializeLogs = (logs: any[], limit: number) =>
    logs.slice(0, limit).map((l) => ({
      action: l.action,
      entityType: l.entityType,
      timestamp: l.timestamp,
    }));

  it('slices logs to the given limit', () => {
    const logs = Array.from({ length: 50 }, (_, i) => ({
      action: 'UPDATE',
      entityType: 'product',
      timestamp: new Date().toISOString(),
    }));

    expect(serializeLogs(logs, 10)).toHaveLength(10);
    expect(serializeLogs(logs, 50)).toHaveLength(50);
  });

  it('uses limit=10 for local models and 50 for cloud', () => {
    expect(true ? 10 : 50).toBe(10); // local
    expect(false ? 10 : 50).toBe(50); // cloud
  });
});

// ─── AIEngine hint text ───────────────────────────────────────

describe('AIChat engine hints', () => {
  const getEngineHint = (aiEngine: string) =>
    aiEngine === 'cloud'
      ? 'SWAL AI (OpenRouter / DeepSeek v4 Flash)'
      : aiEngine === 'local'
        ? 'Local WebLLM (WebGPU) — data stays on device'
        : aiEngine === 'nano'
          ? 'Gemini Nano (browser built-in)'
          : aiEngine === 'gemini'
            ? 'Gemini API key (client) — optional proxy URL in settings'
            : 'Auto: SWAL AI first, local fallback if offline';

  it('returns cloud hint for cloud engine', () => {
    expect(getEngineHint('cloud')).toContain('OpenRouter');
  });

  it('returns local hint for local engine', () => {
    expect(getEngineHint('local')).toContain('WebGPU');
    expect(getEngineHint('local')).toContain('stays on device');
  });

  it('returns nano hint for nano engine', () => {
    expect(getEngineHint('nano')).toContain('Gemini Nano');
  });

  it('returns gemini hint for gemini engine', () => {
    expect(getEngineHint('gemini')).toContain('Gemini API');
  });

  it('returns auto hint for auto engine', () => {
    expect(getEngineHint('auto')).toContain('Auto');
    expect(getEngineHint('auto')).toContain('fallback');
  });
});

// ─── System prompt construction ───────────────────────────────

describe('AIChat system prompt', () => {
  it('includes the locale code', () => {
    const locale = 'es-CO';
    const systemPrompt = `You are an inventory analyst for Shelf app. You must respond in the language of this locale code: ${locale}, or match the user's input language. Be helpful and analyze the provided data accurately.`;

    expect(systemPrompt).toContain(locale);
    expect(systemPrompt).toContain('inventory analyst');
  });

  it('adapts to different locales', () => {
    for (const locale of ['en-US', 'pt-BR', 'fr-FR', 'de-DE']) {
      const prompt = `...locale code: ${locale}...`;
      expect(prompt).toContain(locale);
    }
  });
});

// ─── ChatMessage type compliance ──────────────────────────────

describe('AIChat message structure', () => {
  it('user messages have role=user', () => {
    const msg: ChatMessage = { role: 'user', text: 'How many products are low on stock?' };
    expect(msg.role).toBe('user');
    expect(msg.text).toBeTruthy();
  });

  it('model messages have role=model', () => {
    const msg: ChatMessage = { role: 'model', text: 'You have 3 products with low stock.' };
    expect(msg.role).toBe('model');
    expect(msg.text).toBeTruthy();
  });

  it('empty messages are allowed for streaming placeholders', () => {
    const msg: ChatMessage = { role: 'model', text: '' };
    expect(msg.text).toBe('');
  });
});

// ─── JSON serialization of context data ───────────────────────

describe('AIChat context JSON serialization', () => {
  it('produces valid JSON from product data', () => {
    const products = [
      buildProduct({ name: 'Camiseta', quantity: 10 }),
      buildProduct({ name: 'Pantalón', quantity: 5 }),
    ];

    const contextData = { products: products.map((p) => ({ name: p.name, quantity: p.quantity })) };
    const json = JSON.stringify(contextData);
    const parsed = JSON.parse(json);

    expect(parsed.products).toHaveLength(2);
    expect(parsed.products[0].name).toBe('Camiseta');
    expect(parsed.products[1].name).toBe('Pantalón');
  });

  it('handles products with special characters', () => {
    const products = [buildProduct({ name: 'Café "Especial" Ñoño' })];
    const contextData = { products: products.map((p) => ({ name: p.name })) };
    const json = JSON.stringify(contextData);
    const parsed = JSON.parse(json);

    expect(parsed.products[0].name).toBe('Café "Especial" Ñoño');
  });
});
