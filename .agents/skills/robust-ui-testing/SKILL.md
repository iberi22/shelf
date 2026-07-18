---
name: robust-ui-testing
description: Applies robust UI testing patterns including Cypress component tests, Playwright visual regression, and hardware API mocking.
---

# Robust UI Testing Skill

Use this skill when asked to make testing "robust", or when the user wants to ensure UI components (like modals, scanners) are fully covered against CSS layout regressions, race conditions, and hardware interaction issues.

## 1. Playwright Visual Regression Testing
For floating components (Modals, Dropdowns) or full views, create Playwright tests that capture a screenshot of the DOM element or page and assert it visually.
**Pattern:**
```typescript
import { test, expect } from '@playwright/test';

test('modal should render correctly in the center', async ({ page }) => {
  await page.goto('/path-to-test');
  await page.click('#open-modal');
  // Visual assertion
  await expect(page).toHaveScreenshot('modal-baseline.png');
});
```

## 2. Cypress Component Testing
For complex React components, especially those relying on `createPortal` or specific context providers, mount the component in isolation using Cypress Component Testing (`cypress run --component`).
**Pattern:**
```tsx
import { mount } from 'cypress/react18';
import MyModal from './MyModal';

describe('MyModal.cy.tsx', () => {
  it('renders correctly inside a tall scrollable container', () => {
    mount(
      <div style={{ height: '2000px', transform: 'translateZ(0)' }}>
        <MyModal isOpen={true} />
      </div>
    );
    // Bounding box assertion
    cy.get('.fixed.inset-0').then(($el) => {
      const rect = $el[0].getBoundingClientRect();
      expect(rect.top).to.equal(0); // Should be attached to viewport, not container
    });
  });
});
```

## 3. Hardware / API Mocking & Monkey Testing
For components that use camera (`html5-qrcode`), geolocation, or other hardware APIs, inject mocks into the Playwright browser context to simulate race conditions (e.g., rapid mount/unmount) and assert the app does not crash.
**Pattern:**
```typescript
test('camera race condition unmount', async ({ page }) => {
  // Inject mock with 2-second artificial delay
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => {
      setTimeout(() => resolve(new MediaStream()), 2000);
    });
  });
  
  await page.goto('/scanner');
  await page.click('#start-scan');
  
  // Rapidly unmount before promise resolves
  await page.click('#close-scan');
  
  // Assert ErrorBoundary wasn't triggered
  await expect(page.locator('text=Algo salió mal')).not.toBeVisible();
});
```

## 4. CI/CD Integration
Always ensure the testing commands (`pnpm test:e2e`, `pnpm test:ct`) exist in the target app's `package.json` and are connected to the GitHub Actions / CI pipeline in `.github/workflows/ci.yml`.
