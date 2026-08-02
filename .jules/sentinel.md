## 2025-02-27 - [Fix XSS from missing quote escaping in escapeHtml utility]
**Vulnerability:** XSS vulnerability in `escapeHtml` where it did not escape single and double quotes, only escaping `<` and `>` through DOM `textContent` -> `innerHTML` assignment.
**Learning:** Using `div.textContent = text; return div.innerHTML` is insufficient for preventing HTML attribute injection since standard text escaping does not sanitize quotation marks (`"` and `'`).
**Prevention:** Avoid relying solely on native DOM assignments for full HTML escaping. Explicitly replace/sanitize quotes (`"`, `'`) or use a robust library if using the result inside attributes.

## 2024-03-24 - Removed Hardcoded JWT Secret in Edge Mesh Authentication
**Vulnerability:** A hardcoded `JWT_SECRET` (`'maloca-gateway-default-secret-change-me'`) was found in `packages/edge-mesh/src/maloca/gateway/auth.ts`, allowing anyone with access to the source code to forge JWTs and impersonate profiles.
**Learning:** Hardcoded secrets should never be used, especially for signing JSON Web Tokens which establish identity in cross-platform (edge/browser) systems.
**Prevention:** Keys should be loaded securely from environment variables, avoiding exceptions when missing by verifying `typeof globalThis.process !== 'undefined'`. A cryptographically secure random value (`crypto.getRandomValues`) should be used as a fallback accompanied by a console warning.
