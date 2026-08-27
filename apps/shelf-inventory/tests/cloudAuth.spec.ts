// cloudAuth.spec.ts — pointer to the real unit test suite.
//
// NOTE: `tests/` is the Playwright E2E testDir in this app, so a Vitest
// suite placed here would break Playwright collection (verified:
// `vitest`'s describe() throws outside the Vitest runtime). The actual
// unit tests for lib/cloudAuth.ts live in `lib/cloudAuth.spec.ts`
// (Vitest, same convention as lib/localAuth.spec.ts) and are picked up
// automatically by `pnpm test:unit`. This file intentionally registers no
// tests.
export {};
