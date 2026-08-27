import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('provides default theme as "classic" and does not set data-theme attribute', () => {
    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(getByTestId('theme').textContent).toBe('classic');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('restores theme from localStorage when valid', () => {
    localStorage.setItem('shelf-theme', 'swal');

    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(getByTestId('theme').textContent).toBe('swal');
    expect(document.documentElement.getAttribute('data-theme')).toBe('swal');
  });

  it('falls back to "classic" when localStorage contains invalid theme', () => {
    localStorage.setItem('shelf-theme', 'invalid-theme');

    const TestComponent = () => {
      const { theme } = useTheme();
      return <div data-testid="theme">{theme}</div>;
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(getByTestId('theme').textContent).toBe('classic');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('updates theme, localStorage, and document attribute on setTheme call', () => {
    const TestComponent = () => {
      const { theme, setTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <button data-testid="set-swal" onClick={() => setTheme('swal')}>
            Swal
          </button>
          <button data-testid="set-classic" onClick={() => setTheme('classic')}>
            Classic
          </button>
        </div>
      );
    };

    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Switch to swal
    act(() => {
      getByTestId('set-swal').click();
    });

    expect(getByTestId('theme').textContent).toBe('swal');
    expect(localStorage.getItem('shelf-theme')).toBe('swal');
    expect(document.documentElement.getAttribute('data-theme')).toBe('swal');

    // Switch back to classic
    act(() => {
      getByTestId('set-classic').click();
    });

    expect(getByTestId('theme').textContent).toBe('classic');
    expect(localStorage.getItem('shelf-theme')).toBe('classic');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('throws error when useTheme is used outside ThemeProvider', () => {
    // Suppress expected console error output during throw test
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      renderHook(() => useTheme());
    }).toThrow('useTheme must be used within a ThemeProvider');

    console.error = originalError;
  });
});
