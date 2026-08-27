import type React from 'react';
import { useId } from 'react';

/**
 * React port of @swal/ui/components/Input.svelte (SHELF-212).
 * Misma estructura de clases (`swal-label`, `swal-input`, `swal-error`) y
 * mismos tokens `--swal-*` que el design system.
 */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Etiqueta opcional renderizada sobre el input (clase `swal-label`). */
  label?: string;
  /** Mensaje de error: pinta el borde `has-error` + aria-invalid + texto `swal-error`. */
  error?: string;
}

const Input: React.FC<InputProps> = ({ label, error, id, className, ...rest }) => {
  const autoId = useId();
  const inputId = id ?? `swal-input-${autoId.replace(/:/g, '')}`;
  return (
    <>
      {label && (
        <label className="swal-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`swal-input${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />
      {error && (
        <p className="swal-error" id={`${inputId}-error`}>
          {error}
        </p>
      )}
    </>
  );
};

export default Input;
