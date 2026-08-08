## 2025-02-27 - [Fix XSS from missing quote escaping in escapeHtml utility]
**Vulnerability:** XSS vulnerability in `escapeHtml` where it did not escape single and double quotes, only escaping `<` and `>` through DOM `textContent` -> `innerHTML` assignment.
**Learning:** Using `div.textContent = text; return div.innerHTML` is insufficient for preventing HTML attribute injection since standard text escaping does not sanitize quotation marks (`"` and `'`).
**Prevention:** Avoid relying solely on native DOM assignments for full HTML escaping. Explicitly replace/sanitize quotes (`"`, `'`) or use a robust library if using the result inside attributes.

## 2024-03-24 - Removed Hardcoded JWT Secret in Edge Mesh Authentication
**Vulnerability:** A hardcoded `JWT_SECRET` (`'maloca-gateway-default-secret-change-me'`) was found in `packages/edge-mesh/src/maloca/gateway/auth.ts`, allowing anyone with access to the source code to forge JWTs and impersonate profiles.
**Learning:** Hardcoded secrets should never be used, especially for signing JSON Web Tokens which establish identity in cross-platform (edge/browser) systems.
**Prevention:** Keys should be loaded securely from environment variables, avoiding exceptions when missing by verifying `typeof globalThis.process !== 'undefined'`. A cryptographically secure random value (`crypto.getRandomValues`) should be used as a fallback accompanied by a console warning.

 ## 2025-02-27 - [Fix XSS vulnerability in Catalog image rendering]
 **Vulnerability:** XSS vulnerability in `apps/shelf-inventory/components/Catalog.tsx` where an unescaped `product.imageUrl` was directly interpolated into the `src` attribute of an `<img>` tag in a template literal meant for HTML document generation.
 **Learning:** Even if primary identifiers or names are correctly escaped (e.g., `escapeHtml(product.name)`), secondary fields like `imageUrl` that are used inside attributes (such as `src`) must also be explicitly sanitized to prevent attribute injection payloads (e.g., `"><script>alert(1)</script>`).
 **Prevention:** Ensure all user-controlled data interpolated into raw HTML string templates, especially when building documents for export (like PDF/HTML generation), passes through `escapeHtml` or an equivalent robust HTML sanitization utility.
 ## 2025-02-27 - [Fix timing attack vulnerability in HMAC signature verification]
 **Vulnerability:** HMAC signature validation logic for both JWTs (`packages/edge-mesh/src/maloca/gateway/auth.ts`) and webhook signatures (`apps/shelf-inventory/api/webhooks/*.ts`) manually derived a hash and used standard JavaScript string equality (`===`) to compare the expected base64-encoded hash with the received base64-encoded signature. This is vulnerable to timing attacks since the V8 engine stops comparing strings as soon as it finds a mismatch, leaking the length of the matching prefix and allowing attackers to forge signatures.
 **Learning:** Checking signatures with standard equality operators (`===`) creates timing side-channels.
 **Prevention:** Always use Web Crypto API's constant-time comparison methods. Instead of deriving the signature using `crypto.subtle.sign` and manually comparing it with `===`, use `crypto.subtle.verify` which is designed to prevent timing attacks.

## 2025-02-27 - [Fix weak PRNG usage for ID generation]
**Vulnerability:** Weak PRNG (`Math.random()`) was used for generating critical identifiers like transaction IDs, event keys, connection IDs, and envelope nonces/IDs throughout the `edge-mesh` package.
**Learning:** `Math.random()` is not cryptographically secure, which means its sequence can potentially be predicted, leading to ID collisions, replay attacks, or spoofing in a P2P context.
**Prevention:** In edge/browser environments, always use the Web Crypto API (`crypto.getRandomValues()`) or `crypto.randomUUID()` to generate unpredictable nonces and unique identifiers. A `secureRandomString()` utility function has been created to replace weak random sequences.
