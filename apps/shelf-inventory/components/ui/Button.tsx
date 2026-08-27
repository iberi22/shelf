import type React from 'react';

/**
 * React port of @swal/ui/components/Button.svelte (SHELF-212).
 * Same class structure (`swal-btn {variant} {size}` + `full`/`busy`) and
 * same `--swal-*` tokens, so the UI is identical to the design system.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'orange';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra un spinner y deshabilita la interacción. */
  loading?: boolean;
  /** Ocupa el 100% del ancho disponible. */
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}) => {
  const busy = disabled || loading;
  return (
    <button
      type={type}
      className={`swal-btn ${variant} ${size}${fullWidth ? ' full' : ''}${busy ? ' busy' : ''}${className ? ` ${className}` : ''}`}
      disabled={busy}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
};

export default Button;
