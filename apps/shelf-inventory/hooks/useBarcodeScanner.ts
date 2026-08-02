import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  interKeyMs?: number;
  minLength?: number;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  interKeyMs = 50,
  minLength = 3,
}: UseBarcodeScannerOptions): void {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let buffer = '';
    let lastKeyAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      const code = buffer.trim();
      buffer = '';
      if (code.length >= minLength) onScanRef.current(code);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isScanField = target?.getAttribute?.('data-barcode-capture') === 'true';
      if (!isScanField && (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable)) {
        return;
      }
      const now = Date.now();
      if (lastKeyAt && now - lastKeyAt > interKeyMs * 4) buffer = '';
      lastKeyAt = now;
      if (event.key === 'Enter') {
        if (buffer.length >= minLength) {
          event.preventDefault();
          flush();
        }
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        buffer += event.key;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {}, interKeyMs * 8);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const onManualDetect = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.trim().length >= minLength) onScanRef.current(detail.trim());
    };
    window.addEventListener('shelf:barcode-scan', onManualDetect as EventListener);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('shelf:barcode-scan', onManualDetect as EventListener);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [enabled, interKeyMs, minLength]);
}

export function emitBarcodeScan(code: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('shelf:barcode-scan', { detail: code }));
}
