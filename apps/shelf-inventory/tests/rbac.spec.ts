// rbac.spec.ts — pointer to the real unit test suite.
//
// NOTE: `tests/` is the Playwright E2E testDir in this app, so a Vitest
// suite placed here would break Playwright collection. The unit tests for
// lib/rbac.ts (role × permission matrix, assertPermission / authorize /
// PermissionDeniedError) live in `lib/rbac.spec.ts` (Vitest, same convention
// as lib/cloudAuth.spec.ts) and are picked up by the unit gate. This file
// intentionally registers no tests.
export {};
