# Palette Journal — Shelf UX/A11y Learnings

## 2026-07-17 - CollapsibleCard keyboard/a11y pattern
**Learning:** Settings and network cards use a `role="button"` div (not `<button>`) to avoid nested-button hydration issues, but that pattern had dropped focus rings (`focus:outline-none` only) and never exposed expand state. Screen-reader and keyboard users could not tell open vs closed.
**Action:** On any collapsible custom control: always set `aria-expanded`, link with `aria-controls` + content `id` (prefer `useId`), mark decorative chevrons/icons `aria-hidden`, and replace bare `focus:outline-none` with `focus-visible:ring-*` so keyboard focus stays visible.
