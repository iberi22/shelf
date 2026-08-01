import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BusinessOnboarding from './BusinessOnboarding';

// ─── Welcome Step ──────────────────────────────────────────────

describe('BusinessOnboarding — Welcome Step', () => {
  it('renders the welcome heading', () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    expect(screen.getByText('¡Bienvenido a Shelf!')).toBeDefined();
  });

  it('shows the setup button', () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    expect(screen.getByText('Configurar mi inventario')).toBeDefined();
  });

  it('shows the skip button', () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    expect(screen.getByText('Omitir — usar configuración predeterminada')).toBeDefined();
  });

  it('calls onComplete with a default config when skipping', async () => {
    const onComplete = vi.fn();
    render(<BusinessOnboarding onComplete={onComplete} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Omitir — usar configuración predeterminada'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        variantAttributes: expect.any(Array),
        colorOptions: expect.any(Array),
        measureOptions: expect.any(Array),
        materialOptions: expect.any(Array),
      }),
    );
  });
});

// ─── Select Step ───────────────────────────────────────────────

describe('BusinessOnboarding — Select Step', () => {
  it('shows preset categories after clicking setup', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));

    // Category headers should be visible (use getByRole for specificity)
    expect(screen.getByRole('heading', { name: /Tienda \/ Retail/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /Alimentos y Bebidas/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /General/ })).toBeDefined();
  });

  it('shows preset names in the select step', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));

    expect(screen.getByText('Materas y Plantas')).toBeDefined();
    expect(screen.getByText('Ropa y Calzado')).toBeDefined();
    expect(screen.getByText('Electrónicos')).toBeDefined();
    expect(screen.getByText('Inventario Simple')).toBeDefined();
  });

  it('has a back button that returns to welcome', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    expect(screen.getByText('¿Qué tipo de negocio manejas?')).toBeDefined();

    await user.click(screen.getByText('← Volver'));
    expect(screen.getByText('¡Bienvenido a Shelf!')).toBeDefined();
  });
});

// ─── Preview Step ──────────────────────────────────────────────

describe('BusinessOnboarding — Preview Step', () => {
  it('shows preview after selecting a preset', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    await user.click(screen.getByText('Ropa y Calzado'));

    // Should show the preset name
    expect(screen.getByText('Ropa y Calzado')).toBeDefined();
    // Should show variant attributes
    expect(screen.getByText('Color')).toBeDefined();
    expect(screen.getByText('Talla')).toBeDefined();
    expect(screen.getByText('Material')).toBeDefined();
    // Should show the confirm button
    expect(screen.getByText('¡Configurar! ✓')).toBeDefined();
  });

  it('shows color count for presets with colors', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    await user.click(screen.getByText('Ropa y Calzado'));

    expect(screen.getByText(/Colores \(\d+\)/)).toBeDefined();
  });

  it('shows material options section for presets with materials', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    await user.click(screen.getByText('Ropa y Calzado'));

    expect(screen.getByText(/Materiales \(\d+\)/)).toBeDefined();
  });

  it('calls onComplete with valid config when confirming', async () => {
    const onComplete = vi.fn();
    render(<BusinessOnboarding onComplete={onComplete} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    await user.click(screen.getByText('Ropa y Calzado'));
    await user.click(screen.getByText('¡Configurar! ✓'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const config = onComplete.mock.calls[0][0];
    expect(config).toHaveProperty('variantAttributes');
    expect(config).toHaveProperty('colorOptions');
    expect(config).toHaveProperty('measureOptions');
    expect(config).toHaveProperty('materialOptions');
    expect(config.variantAttributes).toContain('Color');
    expect(config.variantAttributes).toContain('Talla');
    expect(config.variantAttributes).toContain('Material');
  });

  it('can go back to select from preview', async () => {
    render(<BusinessOnboarding onComplete={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Configurar mi inventario'));
    await user.click(screen.getByText('Materas y Plantas'));
    expect(screen.getByText('Dimensiones de variante')).toBeDefined();

    await user.click(screen.getByText('← Cambiar'));
    expect(screen.getByText('¿Qué tipo de negocio manejas?')).toBeDefined();
  });
});

// ─── Full Flow ─────────────────────────────────────────────────

describe('BusinessOnboarding — Full Flow', () => {
  it('can navigate welcome → select → preview → confirm', async () => {
    const onComplete = vi.fn();
    render(<BusinessOnboarding onComplete={onComplete} />);
    const user = userEvent.setup();

    // Step 1: Welcome
    expect(screen.getByText('¡Bienvenido a Shelf!')).toBeDefined();

    // Step 2: Select
    await user.click(screen.getByText('Configurar mi inventario'));
    expect(screen.getByText('¿Qué tipo de negocio manejas?')).toBeDefined();

    // Step 3: Preview
    await user.click(screen.getByText('Electrónicos'));
    expect(screen.getByText('Electrónicos')).toBeDefined();

    // Step 4: Confirm
    await user.click(screen.getByText('¡Configurar! ✓'));
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Verify the config passed to onComplete
    const config = onComplete.mock.calls[0][0];
    expect(config.variantAttributes).toEqual(['Modelo', 'Capacidad']);
  });
});
