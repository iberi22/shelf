/**
 * ProGate — gate Pro-only children behind SWAL node status.
 *
 * Usage:
 *   <ProGate feature="inventory-analytics">
 *     <AnalyticsPanel />
 *   </ProGate>
 *
 *   <ProGate feature="ai-assistant" fallback="Activa tu nodo SWAL para usar el asistente.">
 *     <AIChat />
 *   </ProGate>
 *
 * When `status === "active"` children are rendered. Otherwise a subtle
 * upsell slot is shown (custom `fallback` string or default per feature).
 */

import type React from 'react';
import type { ReactNode } from 'react';
import { isProEnabled, useSwalNode } from '../context/SwalNodeContext';

export interface ProGateProps {
  /** Feature identifier for telemetry / upsell copy (e.g. "inventory-analytics"). */
  feature: string;
  /** Content to render when Pro is active. */
  children: ReactNode;
  /**
   * Custom fallback text when not Pro. If omitted, a generic upsell is shown.
   * Pass `null` to render nothing, or a ReactNode via `fallbackSlot`.
   */
  fallback?: string | null;
  /** Fully custom fallback slot (takes precedence over `fallback`). */
  fallbackSlot?: ReactNode;
  /** Optional className for the fallback wrapper. */
  className?: string;
}

const defaultFallbackForFeature = (feature: string): string => {
  const pretty = feature.replace(/[-_]/g, ' ');
  return `Pro feature "${pretty}" — activa tu nodo SWAL para desbloquearlo.`;
};

const ProGate: React.FC<ProGateProps> = ({ feature, children, fallback, fallbackSlot, className }) => {
  const { status } = useSwalNode();
  const isPro = isProEnabled(status);

  if (isPro) {
    return <>{children}</>;
  }

  // Explicit null fallback => render nothing (silent gate).
  if (fallback === null && fallbackSlot === undefined) {
    return null;
  }

  if (fallbackSlot !== undefined) {
    return <>{fallbackSlot}</>;
  }

  const text = fallback ?? defaultFallbackForFeature(feature);

  return (
    <div
      className={
        className ??
        'rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-6 text-center text-sm text-amber-200/80'
      }
      data-testid="pro-gate-fallback"
      data-feature={feature}
      data-status={status}
      role="note"
      aria-label={`Pro gate for ${feature}`}
    >
      <p className="mx-auto max-w-md leading-relaxed">{text}</p>
      <p className="mt-2 text-xs opacity-60">Estado del nodo: {status}</p>
    </div>
  );
};

export default ProGate;
