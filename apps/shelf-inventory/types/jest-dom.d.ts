// Loads the @testing-library/jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...)
// into the Vitest `Assertion` interface so spec files under lib/** type-check with `tsc`.
import '@testing-library/jest-dom/vitest';
