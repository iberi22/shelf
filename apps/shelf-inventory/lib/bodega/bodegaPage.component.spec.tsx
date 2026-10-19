import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BodegaPage, * as BodegaModule from '../../components/BodegaPage';

const mockState = {
  inventoryConfig: null,
  role: 'admin',
};

vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({ state: mockState }),
}));

vi.mock('../../context/CurrencyContext', () => ({
  useCurrency: () => ({
    formatCurrency: (n: number) => `$${n}`,
  }),
}));

const translations: Record<string, string> = {
  'nav.bodegas': 'Bodegas',
  'bodega.description': 'Carga un archivo de instantánea de inventario para visualizarlo.',
  'bodega.fileAriaLabel': 'Archivo de instantánea de bodega',
  'bodega.passphraseAriaLabel': 'Clave para desencriptar (opcional)',
  'bodega.passphrasePlaceholder': 'Clave (opcional)',
  'bodega.loadButton': 'Cargar',
  'common.clear': 'Limpiar',
  'bodega.fileTooLarge': 'El archivo supera el tamaño máximo permitido (5 MB).',
  'bodega.invalidFormat': 'El archivo no tiene un formato válido de bodega.',
  'bodega.invalidKey': 'La clave es incorrecta o requerida.',
  'bodega.alteredFile': 'El archivo ha sido alterado o está corrupto.',
  'bodega.unexpectedError': 'Error inesperado al leer el archivo.',
  'bodega.source': 'Fuente:',
  'bodega.date': 'Fecha:',
  'bodega.currency': 'Moneda:',
  'bodega.unmapped': 'Sin mapear:',
};

vi.mock('../../context/I18nContext', () => ({
  useI18n: () => ({
    t: (k: string) => translations[k] || k,
  }),
}));

vi.mock('../../hooks/useLocalStorage', () => ({
  default: () => [5, vi.fn()],
}));

vi.mock('../../components/inventory/InventoryView', () => ({
  InventoryView: () => <div data-testid="inventory-view">InventoryView Table</div>,
}));

describe('BodegaPage component', () => {
  const sampleSnapshot = JSON.stringify({
    format: 'swal-inventory-export/v1',
    source: {
      appId: 'shelf',
      instanceId: 'inst-test-1',
      schemaVersion: 1,
      exportedAt: '2026-10-19T10:00:00Z',
    },
    currency: 'USD',
    locations: [{ id: 'loc-1', name: 'Almacen', type: 'bodega' }],
    items: [
      {
        id: 'item-1',
        name: 'Producto Alfa',
        quantity: 15,
        minStock: 2,
        cost: 10,
        price: 20,
        locationId: 'loc-1',
      },
    ],
    movements: [],
  });

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('exports only default BodegaPage (no fake/stub exports - kills M9)', () => {
    const exports = Object.keys(BodegaModule);
    expect(exports).toEqual(['default']);
  });

  it('renders initial form with inputs and disabled load button until a file is picked', () => {
    render(<BodegaPage />);

    expect(screen.getByRole('heading', { name: 'Bodegas' })).toBeInTheDocument();
    expect(screen.getByText('Carga un archivo de instantánea de inventario para visualizarlo.')).toBeInTheDocument();

    const fileInput = screen.getByLabelText('Archivo de instantánea de bodega') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const loadButton = screen.getByRole('button', { name: 'Cargar' });
    expect(loadButton).toBeDisabled();

    const clearButton = screen.getByRole('button', { name: 'Limpiar' });
    expect(clearButton).toBeInTheDocument();
  });

  it('rejects files larger than 5 MB without invoking file.text() and shows error (kills M1, M2, M3)', async () => {
    render(<BodegaPage />);

    const fileInput = screen.getByLabelText('Archivo de instantánea de bodega') as HTMLInputElement;
    const textSpy = vi.fn().mockResolvedValue(sampleSnapshot);

    const file = new File(['dummy'], 'too-large.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
    file.text = textSpy;

    fireEvent.change(fileInput, { target: { files: [file] } });

    const loadButton = screen.getByRole('button', { name: 'Cargar' });
    expect(loadButton).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(loadButton);
    });

    await waitFor(() => {
      expect(screen.getByText('El archivo supera el tamaño máximo permitido (5 MB).')).toBeInTheDocument();
    });

    expect(textSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('inventory-view')).not.toBeInTheDocument();
  });

  it('loads a valid snapshot and renders source metadata and InventoryView', async () => {
    render(<BodegaPage />);

    const fileInput = screen.getByLabelText('Archivo de instantánea de bodega') as HTMLInputElement;
    const textSpy = vi.fn().mockResolvedValue(sampleSnapshot);

    const file = new File(['valid'], 'valid.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 1024 });
    file.text = textSpy;

    fireEvent.change(fileInput, { target: { files: [file] } });

    const loadButton = screen.getByRole('button', { name: 'Cargar' });
    await act(async () => {
      fireEvent.click(loadButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inventory-view')).toBeInTheDocument();
    });

    expect(textSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Fuente: shelf/i)).toBeInTheDocument();
    expect(screen.getByText(/Moneda: USD/i)).toBeInTheDocument();
  });

  it('resets state, error, and clears the file input value on Limpiar click', async () => {
    render(<BodegaPage />);

    const fileInput = screen.getByLabelText('Archivo de instantánea de bodega') as HTMLInputElement;
    const textSpy = vi.fn().mockResolvedValue(sampleSnapshot);

    const file = new File(['valid'], 'valid.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 1024 });
    file.text = textSpy;

    fireEvent.change(fileInput, { target: { files: [file] } });

    const loadButton = screen.getByRole('button', { name: 'Cargar' });
    await act(async () => {
      fireEvent.click(loadButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inventory-view')).toBeInTheDocument();
    });

    // Now click Limpiar
    const clearButton = screen.getByRole('button', { name: 'Limpiar' });
    await act(async () => {
      fireEvent.click(clearButton);
    });

    expect(screen.queryByTestId('inventory-view')).not.toBeInTheDocument();
    expect(fileInput.value).toBe('');
    expect(loadButton).toBeDisabled();
  });
});
