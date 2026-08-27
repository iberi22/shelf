# @swal/ui

Reusable React UI primitives for the SWAL / Shelf ecosystem. Styled with the app's Tailwind semantic tokens (`bg-primary`, `bg-panel`, `bg-background`, `text-foreground`, `border-foreground/30`, `rounded-lg`, `active:scale-95 transition-all`) so components look native inside `shelf-inventory` without extra theming.

## Installation

This package lives inside the pnpm workspace monorepo. No registry publish is required during development.

Add it as a workspace dependency in any app/package:

```json
{
  "dependencies": {
    "@swal/ui": "workspace:*"
  }
}
```

Then run `pnpm install` from the repo root — pnpm will link `packages/swal-ui` automatically.

## Development

```bash
pnpm --dir packages/swal-ui build   # type-check + emit dist/
pnpm --dir packages/swal-ui dev     # watch mode
pnpm exec biome check packages/swal-ui
```

## Components

| Component | Description |
|-----------|-------------|
| `Button` | Variants `primary`/`secondary`/`ghost`/`danger`, sizes `sm`/`md`/`lg`, optional `loading` spinner that disables the button. |
| `Input` | Label + error/hint slots, native `<input>` props passthrough, `bg-panel` surface with `border-foreground/30` and focus ring. |
| `Modal` | Portal to `document.body`, backdrop-click and `ESC` close, sizes `default`/`wide`, self-contained (no i18n dependency). |

## Usage

```tsx
import { Button, Input, Modal } from '@swal/ui';

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Open</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Hello">
        <Input label="Name" placeholder="Ada Lovelace" />
        <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
      </Modal>
    </>
  );
}
```

Individual component entry points are also available via the `exports` map:

```ts
import Button from '@swal/ui/components/Button';
```

## Exports

- `.` -> `dist/index.js` + `dist/index.d.ts`
- `./components/*` -> `dist/components/*.js` + `dist/components/*.d.ts`
