---
name: advanced-visual-qa-battery
description: Ejecuta una batería robusta de pruebas E2E (Playwright) y de componentes (Cypress) con capturas de pantalla o video para que el agente realice inspección visual multimodal.
---

# Advanced Visual QA Battery Skill

Use this skill when the user requests an exhaustive, robust test battery to ensure no UI/UX bugs exist (like floating window positioning, modal stacking, or race conditions). This skill explicitly outlines how the AI can verify generated visual artifacts.

## 1. Automated E2E Trace and Video Generation
Instead of just running unit tests, trigger Playwright E2E tests with video recording and tracing enabled. This allows the AI to review the exact sequence of events.
**Command to execute:**
```bash
npx playwright test --headed --config=playwright.config.ts
# or
pnpm test:e2e
```
*Make sure `playwright.config.ts` has `video: 'on'` and `trace: 'on'` configured.*

## 2. Multi-Modal Visual AI Verification
When the tests produce a failing screenshot, a visual diff, or an error state, locate the artifact (usually in `test-results/` or `playwright-report/`). 
As an AI with visual capabilities, you can read the image directly via your `view_file` tool (which supports image files).

**Workflow:**
1. Run tests: `pnpm test`
2. If failures occur, search for screenshots: `Get-ChildItem -Path "playwright-report" -Filter "*.png" -Recurse`
3. View the image using your `view_file` tool.
4. Analyze the image to detect issues like:
   - Modals appearing off-screen or at `scrollTop: 0` inside a scrolled container.
   - Z-index stacking context bugs.
   - Text overflows and cutoff buttons.

## 3. Explaining "Why Tests Didn't Catch It"
Often tests miss bugs because they assert DOM presence but NOT layout/viewport correctness. 
When asked why a bug slipped through, check if existing Cypress/Playwright assertions only checked `expect(locator).toBeVisible()` without validating bounding boxes or coordinate offsets relative to the viewport (`getBoundingClientRect()`).

**How to robustify:**
Always recommend adding Visual Regression `expect(page).toHaveScreenshot()` OR explicit coordinate assertions for floating panels.

## 4. Hardware Mock Verification
To ensure camera components (`Html5Qrcode`) or WebRTC connections (`Edge Mesh P2P`) do not leave phantom instances or crash on rapid unmounts:
Implement monkey testing scripts in Playwright that rapidly toggle `start()` and `stop()` within ms, and assert that memory/DOM elements are cleanly collected.
